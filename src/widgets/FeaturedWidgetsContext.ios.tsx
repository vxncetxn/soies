/**
 * FeaturedWidgetsContext — iOS controller for sheet, capture, and publication.
 *
 * User selection follows a deliberate boundary: rasterize first, commit the
 * lowest empty slot second, then publish one complete five-slot snapshot. A
 * capture/assignment failure leaves the picker intact. A publication failure
 * happens after durable intent exists, so it becomes a non-blocking warning and
 * a coalesced reconciliation retry rather than rolling the slot back.
 *
 * Reconciliation runs once after first paint and on foreground. It publishes
 * empty/unavailable states immediately, lazily captures only missing revisioned
 * frames through the single-flight host, republishes if bytes changed, and only
 * then removes unreferenced old captures.
 *
 * Map:
 * - session state owns the one native sheet and its cross-faded phase command;
 * - selection performs capture -> transactional assignment -> one publication;
 * - reconciliation serializes foreground repair and revisioned cache cleanup;
 * - the public context exposes only platform support and the two launch paths.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import type { Entry } from "../data/entries";
import type {
  FeaturedWidgetSlot,
  FeaturedWidgetSlotIndex,
} from "../db/repositories/featuredWidgetSlots";
import type {
  FeaturedWidgetsContextValue,
  FeaturedWidgetsProviderProps,
} from "./FeaturedWidgetsContext.types";

import FeatureErrorBoundary from "../components/feature-error-boundary";
import {
  assignFeaturedWidgetSlot,
  getFeaturedWidgetCaptureSource,
  getFeaturedWidgetPickerState,
  getFeaturedWidgetSlots,
} from "../db/repositories/featuredWidgetSlots";
import { FeaturedWidgetsSheet } from "./FeaturedWidgetsSheet";
import { cachedWidgetFrameUri, cleanUnreferencedWidgetFrames } from "./widgetFrameCache";
import { protectedWidgetFrameUris } from "./widgetFrameCachePolicy";
import {
  discardUnassignedWidgetFrame,
  useWidgetFrameCapture,
  WidgetFrameCaptureHost,
} from "./WidgetFrameCaptureHost";
import { publishFeaturedWidgetSlots } from "./widgetPublication.ios";
import { featuredPhaseForSlot, initialFeaturedWidgetSheetPhase } from "./widgetSheetState";

type SheetPhase = "picker" | "featured";

type SheetSession = {
  /** Remount boundary between separate presentations, never between phases. */
  id: number;
  phase: SheetPhase;
  /** Kept through picker fade-out so its outgoing tree remains mounted. */
  entry: Entry | null;
  /** Entry artefact selected when Focus launched the picker. */
  initialPage: number;
  /** Management page requested by a launcher, deep link, or successful assignment. */
  centeredSlot: FeaturedWidgetSlotIndex;
};

/** Before the first database read, render the complete stable slot shape. */
const emptySlots = (): FeaturedWidgetSlot[] =>
  ([1, 2, 3, 4, 5] as const).map((slotIndex) => ({ slotIndex, state: "empty" }));

const FeaturedWidgetsContext = createContext<FeaturedWidgetsContextValue | null>(null);

export class FeaturedWidgetsFullError extends Error {
  constructor() {
    super("All five Featured Artefact slots are occupied");
    this.name = "FeaturedWidgetsFullError";
  }
}

export function useFeaturedWidgets(): FeaturedWidgetsContextValue {
  const value = useContext(FeaturedWidgetsContext);
  if (!value) {
    throw new Error("useFeaturedWidgets must be used within FeaturedWidgetsProvider");
  }
  return value;
}

function FeaturedWidgetsController({ children }: FeaturedWidgetsProviderProps) {
  const { captureWidgetFrame } = useWidgetFrameCapture();
  /** Repository projection used by cached carousel previews. */
  const [slots, setSlots] = useState<FeaturedWidgetSlot[]>(emptySlots);
  /** Null means no native sheet is mounted. */
  const [session, setSession] = useState<SheetSession | null>(null);
  /** Durable assignment succeeded but WidgetKit has not acknowledged publication. */
  const [publicationWarning, setPublicationWarning] = useState(false);
  /** Prevents a closing sheet callback from clearing a newer presentation. */
  const nextSessionIdRef = useRef(1);
  /** Latest-wins guard around the asynchronous capacity check before opening. */
  const latestOpenRequestRef = useRef(0);
  /** In-flight reconciliation shared by first-paint and foreground triggers. */
  const reconciliationRef = useRef<Promise<void> | null>(null);
  /** Coalesces any trigger received while the current pass is still running. */
  const reconciliationQueuedRef = useRef(false);
  // One successful logical publication remains protected for a full later
  // pass. WidgetKit may still be rendering that older timeline after
  // `updateSnapshot` returns, so current-only cleanup would race its file read.
  const previousPublicationUrisRef = useRef<Set<string> | null>(null);

  /** Refresh both caller-visible data and the mounted management carousel. */
  const refreshSlots = useCallback(async () => {
    const next = await getFeaturedWidgetSlots();
    setSlots(next);
    return next;
  }, []);

  /** Publish one atomic payload and return the derived files that payload names. */
  const publishSlots = useCallback((nextSlots: FeaturedWidgetSlot[]): Set<string> => {
    const snapshot = publishFeaturedWidgetSlots(nextSlots);
    return new Set(
      Object.values(snapshot.slots)
        .map((slot) => slot.frameUri)
        .filter((uri): uri is string => Boolean(uri)),
    );
  }, []);

  /** Advance cleanup protection only after a complete logical pass succeeds. */
  const finishPublicationPass = useCallback((currentUris: Set<string>) => {
    const previousUris = previousPublicationUrisRef.current;
    const protectedUris = protectedWidgetFrameUris(previousUris, currentUris);
    if (protectedUris) {
      // Protect both generations. A URI first omitted by `currentUris` remains
      // alive for this pass and becomes collectable only after another success.
      cleanUnreferencedWidgetFrames(protectedUris);
    }
    previousPublicationUrisRef.current = currentUris;
  }, []);

  /** Repair every slot from one database projection, without redundant captures. */
  const reconcileOnce = useCallback(async () => {
    const nextSlots = await refreshSlots();
    let initialPublished = false;
    let publishedUris: Set<string> | null = null;
    try {
      // The first publication immediately removes images for unavailable rows
      // even if a later recapture stalls or fails.
      publishedUris = publishSlots(nextSlots);
      initialPublished = true;
    } catch {
      setPublicationWarning(true);
    }

    let captured = false;
    for (const slot of nextSlots) {
      if (slot.state !== "featured" || cachedWidgetFrameUri(slot)) {
        continue;
      }
      try {
        await captureWidgetFrame({ artefact: slot.artefact, frameRevision: slot.frameRevision });
        captured = true;
      } catch {
        // Keep the missing-image fallback published. Foreground or an explicit
        // retry will revisit only this still-missing revision.
      }
    }

    if (captured || !initialPublished) {
      try {
        // The slot rows are unchanged, but a fresh array lets the carousel
        // re-resolve newly installed derived file URIs without live frame trees.
        setSlots([...nextSlots]);
        publishedUris = publishSlots(nextSlots);
        setPublicationWarning(false);
      } catch {
        setPublicationWarning(true);
        return;
      }
    } else if (initialPublished) {
      setPublicationWarning(false);
    }

    if (publishedUris) {
      finishPublicationPass(publishedUris);
    }
  }, [captureWidgetFrame, finishPublicationPass, publishSlots, refreshSlots]);

  /** Serialize triggers; at most one additional pass is queued while busy. */
  const reconcile = useCallback((): Promise<void> => {
    if (reconciliationRef.current) {
      reconciliationQueuedRef.current = true;
      return reconciliationRef.current;
    }

    const task = (async () => {
      do {
        reconciliationQueuedRef.current = false;
        try {
          await reconcileOnce();
        } catch {
          setPublicationWarning(true);
        }
      } while (reconciliationQueuedRef.current);
    })();
    reconciliationRef.current = task;
    void task.then(() => {
      reconciliationRef.current = null;
    });
    return task;
  }, [reconcileOnce]);

  useEffect(() => {
    const firstPaint = requestAnimationFrame(() => {
      void reconcile();
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void reconcile();
      }
    });
    return () => {
      cancelAnimationFrame(firstPaint);
      subscription.remove();
    };
  }, [reconcile]);

  /** Start one sheet presentation; later phase changes mutate this same session. */
  const createSession = useCallback(
    (
      phase: SheetPhase,
      entry: Entry | null,
      initialPage: number,
      centeredSlot: FeaturedWidgetSlotIndex,
    ) => {
      const id = nextSessionIdRef.current;
      nextSessionIdRef.current += 1;
      setSession({ id, phase, entry, initialPage, centeredSlot });
      void refreshSlots().catch(() => {});
    },
    [refreshSlots],
  );

  /** Capacity is checked before presentation so a full set never flashes picker UI. */
  const openPicker = useCallback(
    (entry: Entry, initialPage: number) => {
      const request = latestOpenRequestRef.current + 1;
      latestOpenRequestRef.current = request;
      void getFeaturedWidgetPickerState([])
        .then((state) => {
          if (latestOpenRequestRef.current !== request) {
            return;
          }
          createSession(initialFeaturedWidgetSheetPhase(state.isFull), entry, initialPage, 1);
        })
        .catch(() => {
          if (latestOpenRequestRef.current === request) {
            createSession("picker", entry, initialPage, 1);
          }
        });
    },
    [createSession],
  );

  /** Open management directly, optionally centered by an empty/unavailable URL. */
  const openFeatured = useCallback(
    (slotIndex: FeaturedWidgetSlotIndex = 1) => {
      latestOpenRequestRef.current += 1;
      createSession("featured", null, 0, slotIndex);
    },
    [createSession],
  );

  /** Preserve the picker on pre-commit failure and intent on post-commit failure. */
  const featureArtefact = useCallback(
    async (artefactId: string): Promise<FeaturedWidgetSlotIndex> => {
      const source = await getFeaturedWidgetCaptureSource(artefactId);
      if (!source) {
        throw new Error("This artefact is no longer available");
      }

      const capture = await captureWidgetFrame(source);
      let outcome;
      try {
        outcome = await assignFeaturedWidgetSlot(artefactId);
      } catch (error) {
        discardUnassignedWidgetFrame(capture);
        throw error;
      }
      if (outcome.status === "full") {
        discardUnassignedWidgetFrame(capture);
        throw new FeaturedWidgetsFullError();
      }

      const assignedSlot = outcome.slotIndex;
      const nextSlots = await refreshSlots();
      try {
        finishPublicationPass(publishSlots(nextSlots));
        setPublicationWarning(false);
      } catch {
        // The durable assignment is user intent. Retain it, show management,
        // and let the coalesced reconciliation retry publication.
        setPublicationWarning(true);
        void reconcile();
      }
      setSession((current) =>
        // Retain the picker Entry while its layer fades out. Clearing it here
        // would unmount the outgoing content on the transition's first frame,
        // turning a cross-fade into a fade-through-empty.
        current ? { ...current, ...featuredPhaseForSlot(assignedSlot) } : current,
      );
      return assignedSlot;
    },
    [captureWidgetFrame, finishPublicationPass, publishSlots, reconcile, refreshSlots],
  );

  const value = useMemo<FeaturedWidgetsContextValue>(
    () => ({ supported: true, openPicker, openFeatured }),
    [openFeatured, openPicker],
  );

  return (
    <FeaturedWidgetsContext.Provider value={value}>
      {children}
      {session ? (
        <FeatureErrorBoundary
          featureName="Featured Widgets"
          key={session.id}
          onDismiss={() => {
            setSession((current) => (current?.id === session.id ? null : current));
          }}
          title="Couldn’t continue managing featured artefacts."
        >
          <FeaturedWidgetsSheet
            key={session.id}
            session={session}
            slots={slots}
            publicationWarning={publicationWarning}
            onFeatureArtefact={featureArtefact}
            onRefreshSlots={refreshSlots}
            onClosed={() => {
              setSession((current) => (current?.id === session.id ? null : current));
            }}
          />
        </FeatureErrorBoundary>
      ) : null}
    </FeaturedWidgetsContext.Provider>
  );
}

export function FeaturedWidgetsProvider(props: FeaturedWidgetsProviderProps) {
  return (
    <WidgetFrameCaptureHost>
      <FeaturedWidgetsController {...props} />
    </WidgetFrameCaptureHost>
  );
}
