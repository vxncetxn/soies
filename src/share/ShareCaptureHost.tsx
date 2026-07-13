/**
 * ShareCaptureHost — offscreen rasterizer for share actions.
 *
 * Captures never screenshot the carousel. A pending job mounts one canonical
 * ShareComposition far off-screen, waits for every image in the card, then
 * `captureRef`s to a temporary file. The mount is expressed in logical points
 * (`target pixels / PixelRatio`) so high-density devices do not allocate a
 * multi-screen bitmap before downsampling it.
 *
 * Stickers capture at intrinsic bounds (card + brand). Forcing 1080×1920
 * letterboxes transparent padding and Instagram shows a thin column.
 *
 * The host is deliberately single-flight. React state updates are not an atomic
 * lock—two taps can arrive before a render—so `jobRef` accepts or rejects the
 * request synchronously. Completed files are cached for the current share
 * session and released when that session closes or changes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PixelRatio, StyleSheet, View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";

import type { PaperArtefact, PrintArtefact } from "../data/entries";

import { SHARE_EXPORT_HEIGHT, SHARE_EXPORT_WIDTH, type ShareBackgroundId } from "./constants";
import { ShareComposition, type ShareCompositionVariant } from "./ShareComposition";

export type CaptureShareImageArgs = {
  artefact: PaperArtefact | PrintArtefact;
  variant: ShareCompositionVariant;
  background: ShareBackgroundId;
};

type CaptureJob = CaptureShareImageArgs & {
  scope: object | null;
  resolve: (uri: string) => void;
  reject: (error: Error) => void;
};

type CachedCapture = CaptureShareImageArgs & {
  scope: object | null;
  uri: string;
};

type ShareCaptureContextValue = {
  captureShareImage: (args: CaptureShareImageArgs) => Promise<string>;
};

const ShareCaptureContext = createContext<ShareCaptureContextValue | null>(null);
const CAPTURE_TIMEOUT_MS = 10_000;

export function useShareCapture() {
  const value = useContext(ShareCaptureContext);
  if (!value) {
    throw new Error("useShareCapture must be used within ShareCaptureHost");
  }
  return value;
}

export function ShareCaptureHost({
  children,
  cacheScope,
}: {
  children: ReactNode;
  /** Entry object that owns this cache; null means the sheet is closed. */
  cacheScope: object | null;
}) {
  const [job, setJob] = useState<CaptureJob | null>(null);
  const jobRef = useRef<CaptureJob | null>(null);
  const shotRef = useRef<View>(null);
  const capturingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<CachedCapture[]>([]);

  /** Release only files owned by view-shot; destination APIs never own them. */
  const clearCache = useCallback(() => {
    for (const cached of cacheRef.current) {
      releaseCapture(cached.uri);
    }
    cacheRef.current = [];
  }, []);

  /**
   * Settle one accepted job exactly once. Identity checking matters when a
   * session closes while native capture is still finishing: that stale callback
   * must not clear a newer job.
   */
  const finishJob = useCallback((current: CaptureJob) => {
    if (jobRef.current !== current) {
      return;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    capturingRef.current = false;
    jobRef.current = null;
    setJob(null);
  }, []);

  const captureShareImage = useCallback(
    (args: CaptureShareImageArgs) => {
      const cached = cacheRef.current.find(
        (candidate) =>
          candidate.scope === cacheScope &&
          candidate.artefact === args.artefact &&
          candidate.variant === args.variant &&
          candidate.background === args.background,
      );
      if (cached) {
        return Promise.resolve(cached.uri);
      }

      if (jobRef.current) {
        return Promise.reject(new Error("SHARE_CAPTURE_BUSY"));
      }

      return new Promise<string>((resolve, reject) => {
        const next: CaptureJob = { ...args, scope: cacheScope, resolve, reject };
        jobRef.current = next;
        timeoutRef.current = setTimeout(() => {
          if (jobRef.current !== next) {
            return;
          }
          next.reject(new Error("SHARE_CAPTURE_TIMEOUT"));
          finishJob(next);
        }, CAPTURE_TIMEOUT_MS);
        setJob(next);
      });
    },
    [cacheScope, finishJob],
  );

  /**
   * ShareArtefactCard calls this only after layout, the Print photo, and Ink
   * overlay have all displayed. One additional frame lets Fabric commit that
   * final image before view-shot traverses the native hierarchy.
   */
  const runCapture = useCallback(() => {
    const current = jobRef.current;
    if (!current || capturingRef.current) {
      return;
    }
    capturingRef.current = true;

    requestAnimationFrame(() => {
      if (!shotRef.current) {
        current.reject(new Error("Share capture view missing"));
        finishJob(current);
        return;
      }

      const isSticker = current.variant === "sticker";
      const opts = isSticker
        ? { format: "png" as const, quality: 1, result: "tmpfile" as const }
        : {
            format: "jpg" as const,
            quality: 0.92,
            result: "tmpfile" as const,
            width: SHARE_EXPORT_WIDTH / PixelRatio.get(),
            height: SHARE_EXPORT_HEIGHT / PixelRatio.get(),
          };
      captureRef(shotRef, opts).then(
        (uri) => {
          if (jobRef.current !== current) {
            releaseCapture(uri);
            return;
          }
          cacheRef.current.push({ ...current, uri });
          current.resolve(uri);
          finishJob(current);
        },
        (error: unknown) => {
          current.reject(error instanceof Error ? error : new Error(String(error)));
          finishJob(current);
        },
      );
    });
  }, [finishJob]);

  /** A closed/new sheet invalidates both pending work and completed captures. */
  useEffect(() => {
    clearCache();
    const current = jobRef.current;
    if (current) {
      current.reject(new Error("SHARE_CAPTURE_CANCELLED"));
      finishJob(current);
    }
  }, [cacheScope, clearCache, finishJob]);

  useEffect(
    () => () => {
      clearCache();
      const current = jobRef.current;
      if (current) {
        current.reject(new Error("SHARE_CAPTURE_CANCELLED"));
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      jobRef.current = null;
    },
    [clearCache],
  );

  const value = useMemo(() => ({ captureShareImage }), [captureShareImage]);
  const layoutWidth = SHARE_EXPORT_WIDTH / PixelRatio.get();
  const layoutHeight = SHARE_EXPORT_HEIGHT / PixelRatio.get();

  return (
    <ShareCaptureContext.Provider value={value}>
      {children}
      {job ? (
        <View pointerEvents="none" style={styles.offscreen} collapsable={false}>
          <View ref={shotRef} collapsable={false}>
            <ShareComposition
              artefact={job.artefact}
              variant={job.variant}
              background={job.background}
              width={layoutWidth}
              height={layoutHeight}
              onReady={runCapture}
              onError={(error) => {
                job.reject(error);
                finishJob(job);
              }}
            />
          </View>
        </View>
      ) : null}
    </ShareCaptureContext.Provider>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -10000,
    top: 0,
    opacity: 0,
  },
});
