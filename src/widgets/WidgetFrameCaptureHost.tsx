/**
 * WidgetFrameCaptureHost — lazy, single-flight rasterizer for widget frames.
 *
 * A request first checks the revisioned shared cache. On a miss it mounts one
 * ArtefactFrame far off-screen, waits for WidgetFrameSubject's layout/image
 * barrier, and captures it inside a shadow-sized transparent canvas before
 * copying the PNG into `widgetsDirectory`. The gutter is load-bearing:
 * ArtefactFrame's board shadow draws beyond its own layout bounds and an
 * edge-to-edge capture clips it. The downward shadow uses a larger bottom than
 * top inset, avoiding transparent pixels that would only shrink the widget.
 * The host is otherwise absent, so Home never retains five live Paper/Print/Ink
 * trees for the management carousel.
 *
 * The capture gate is an imperative lock because two calls can arrive before a
 * React render. Its ten-second timeout and identity checks also make late native
 * callbacks harmless after cancellation or a newer request.
 *
 * Map:
 * - the context exposes one promise-returning capture command;
 * - `CaptureGate` queues commands before React mounts one `CaptureJob`;
 * - `WidgetFrameSubject` releases capture only after required pixels display;
 * - successful temporaries are installed by immutable revision then released.
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

import type { Artefact } from "../data/entries";

import ArtefactFrame from "../components/ArtefactFrame";
import { FRAME_BOARD_SCALE } from "../components/artefactFrameGeometry";
import { CaptureGate } from "./CaptureGate";
import { withReleasedCapture } from "./captureTemporaryFile";
import {
  cachedWidgetFrameUriForRevision,
  installWidgetFrame,
  removeWidgetFrame,
} from "./widgetFrameCache";
import {
  WIDGET_FRAME_EXPORT_BOARD_WIDTH_PX,
  widgetFrameGeometryForBoard,
} from "./widgetFrameGeometry";
import { WidgetFrameSubject } from "./WidgetFrameSubject";

export type CaptureWidgetFrameArgs = {
  /** Fresh repository object, not a potentially stale picker reference. */
  artefact: Artefact;
  /** Artefact/Ink revision; Entry metadata intentionally does not affect it. */
  frameRevision: number;
};

export type CapturedWidgetFrame = {
  uri: string;
  /** True only when this request installed new derived bytes. */
  created: boolean;
};

type CaptureJob = CaptureWidgetFrameArgs & {
  /** Guards asynchronous native callbacks from settling a later job. */
  id: number;
  resolve: (capture: CapturedWidgetFrame) => void;
  reject: (error: Error) => void;
};

type WidgetFrameCaptureContextValue = {
  captureWidgetFrame: (args: CaptureWidgetFrameArgs) => Promise<CapturedWidgetFrame>;
};

const WidgetFrameCaptureContext = createContext<WidgetFrameCaptureContextValue | null>(null);
/** Bounds layout/image stalls and native capture hangs for each queued job. */
const CAPTURE_TIMEOUT_MS = 10_000;
/** Stable Home geometry input keeps captures consistent across device widths. */
const CANONICAL_VIEWPORT_WIDTH = 390;

export function useWidgetFrameCapture() {
  const value = useContext(WidgetFrameCaptureContext);
  if (!value) {
    throw new Error("useWidgetFrameCapture must be used within WidgetFrameCaptureHost");
  }
  return value;
}

export function WidgetFrameCaptureHost({ children }: { children: ReactNode }) {
  /** Non-null only while the lazy off-screen React tree must be mounted. */
  const [job, setJob] = useState<CaptureJob | null>(null);
  /** Synchronous identity visible to callbacks before React commits state. */
  const jobRef = useRef<CaptureJob | null>(null);
  /** Native view-shot target containing one frame plus its transparent shadow gutter. */
  const shotRef = useRef<View>(null);
  /** Deduplicates readiness callbacks from layout/photo/Ink in the same frame. */
  const capturingRef = useRef(false);
  const nextJobIdRef = useRef(1);
  /** Imperative FIFO is stable for the provider lifetime. */
  const gateRef = useRef(new CaptureGate());

  /** Unmount only the job that still owns the host. */
  const finishJob = useCallback((current: CaptureJob) => {
    if (jobRef.current !== current) {
      return;
    }
    jobRef.current = null;
    capturingRef.current = false;
    setJob(null);
  }, []);

  /** Resolve cache hits immediately; queue misses and recheck when admitted. */
  const captureWidgetFrame = useCallback(
    ({ artefact, frameRevision }: CaptureWidgetFrameArgs) => {
      const id = nextJobIdRef.current;
      nextJobIdRef.current += 1;
      let acceptedJob: CaptureJob | null = null;
      return gateRef.current
        .run(() => {
          // Recheck at queue admission time. An earlier request for the same
          // revision may have installed the bytes while this one waited.
          const cached = cachedWidgetFrameUriForRevision(artefact.id, frameRevision);
          if (cached) {
            return Promise.resolve({ uri: cached, created: false });
          }
          return new Promise<CapturedWidgetFrame>((resolve, reject) => {
            const next = { id, artefact, frameRevision, resolve, reject };
            acceptedJob = next;
            jobRef.current = next;
            setJob(next);
          });
        }, CAPTURE_TIMEOUT_MS)
        .finally(() => {
          if (acceptedJob) {
            finishJob(acceptedJob);
          }
        });
    },
    [finishJob],
  );

  /** Capture one frame after Fabric has committed the final displayed image. */
  const runCapture = useCallback(() => {
    const current = jobRef.current;
    if (!current || capturingRef.current) {
      return;
    }
    capturingRef.current = true;

    requestAnimationFrame(() => {
      if (!shotRef.current || jobRef.current !== current) {
        current.reject(new Error("Widget frame capture view missing"));
        return;
      }
      void captureRef(shotRef, { format: "png", quality: 1, result: "tmpfile" }).then(
        (temporaryUri) => {
          void withReleasedCapture(
            temporaryUri,
            async (uri) => {
              if (jobRef.current !== current) {
                return;
              }
              const installedUri = await installWidgetFrame(
                uri,
                current.artefact.id,
                current.frameRevision,
              );
              if (jobRef.current === current) {
                current.resolve({ uri: installedUri, created: true });
              }
            },
            releaseCapture,
          ).catch((error: unknown) => {
            if (jobRef.current === current) {
              current.reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
        },
        (error: unknown) => {
          current.reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  }, []);

  useEffect(
    () => () => {
      gateRef.current.cancel();
      const current = jobRef.current;
      if (current) {
        current.reject(new Error("WIDGET_CAPTURE_CANCELLED"));
      }
      jobRef.current = null;
    },
    [],
  );

  const value = useMemo(() => ({ captureWidgetFrame }), [captureWidgetFrame]);
  const pixelRatio = PixelRatio.get();
  const exportGeometry = widgetFrameGeometryForBoard(WIDGET_FRAME_EXPORT_BOARD_WIDTH_PX);
  const canvasWidth = exportGeometry.canvasWidth / pixelRatio;
  const canvasHeight = exportGeometry.canvasHeight / pixelRatio;
  const boardWidth = exportGeometry.boardWidth / pixelRatio;
  const boardLeft = exportGeometry.boardLeft / pixelRatio;
  const boardTop = exportGeometry.boardTop / pixelRatio;
  const wellWidth = boardWidth / FRAME_BOARD_SCALE;

  return (
    <WidgetFrameCaptureContext.Provider value={value}>
      {children}
      {job ? (
        <View pointerEvents="none" style={styles.offscreen} collapsable={false}>
          <View
            ref={shotRef}
            collapsable={false}
            style={[styles.captureCanvas, { width: canvasWidth, height: canvasHeight }]}
          >
            <ArtefactFrame
              artefact={job.artefact}
              wellWidth={wellWidth}
              viewportWidth={CANONICAL_VIEWPORT_WIDTH}
              style={[styles.captureFrame, { left: boardLeft, top: boardTop }]}
            >
              <WidgetFrameSubject
                // A retry for the same revision needs a fresh one-shot barrier;
                // React may batch the old job's unmount with queue promotion.
                key={`${job.id}:${job.artefact.id}:${job.frameRevision}`}
                artefact={job.artefact}
                onReady={runCapture}
                onError={(error) => job.reject(error)}
              />
            </ArtefactFrame>
          </View>
        </View>
      ) : null}
    </WidgetFrameCaptureContext.Provider>
  );
}

/** Delete a just-created capture when its following assignment cannot commit. */
export function discardUnassignedWidgetFrame(capture: CapturedWidgetFrame): void {
  if (capture.created) {
    removeWidgetFrame(capture.uri);
  }
}

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
  // The transparent parent, rather than ArtefactFrame itself, is the view-shot
  // target. Its bounds are the exact crop boundary used later by both image
  // surfaces, so the live shadow and cached shadow terminate identically.
  captureCanvas: {
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  captureFrame: {
    position: "absolute",
  },
});
