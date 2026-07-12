/**
 * ArtefactInkCanvas — seam over react-native-signature-ink (vendored fork).
 *
 * Owns pen/eraser tools, undo/redo, stroke load/export, and PNG export for the
 * overlay cache. Create/read UIs never import signature-ink directly.
 *
 * Stroke eraser is implemented in JS (hit-test + setStrokeData) so both
 * platforms share one path without relying on PKToolPicker / native eraser.
 * Erase updates are coalesced to one setStrokeData per animation frame.
 *
 * During eraser mode the native canvas is hidden and a PNG preview is shown
 * instead — iOS setStrokeData rebuilds PKCanvasView (resetCanvasWithDrawing),
 * which otherwise flickers every remaining stroke.
 *
 * After undo/redo, strokesRef and the eraser/warm PNG are refreshed together so
 * eraser hit-testing stays aligned with what is on screen.
 *
 * SignatureInk rejects in-flight toFile/getStrokeData when it unmounts (e.g.
 * exit Scribble). Those promises are caught so they never surface as uncaught
 * rejections.
 */
import { Image } from "expo-image";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent } from "react-native";
import { SignatureInk, type SignatureInkHandle, type StrokeData } from "react-native-signature-ink";
import { withUniwind } from "uniwind";

import { INK_ERASER_HIT_RADIUS, type InkTool } from "../constants/ink";
import {
  inkStrokesFromStrokeData,
  strokeDataFromInkStrokes,
  type InkDocument,
  type InkStroke,
} from "../data/ink";

const StyledImage = withUniwind(Image);

export type ArtefactInkCanvasHandle = {
  undo: () => void;
  redo: () => void;
  /** Snapshot strokes + PNG file URI for durable commit. */
  commit: () => Promise<{ document: InkDocument; overlayUri: string }>;
  /** Replace canvas with committed strokes (clears undo stack). */
  loadDocument: (document: InkDocument | null) => void;
  isEmpty: () => Promise<boolean>;
};

type ArtefactInkCanvasProps = {
  tool: InkTool;
  penColor: string;
  penMinWidth: number;
  penMaxWidth: number;
  /** Initial strokes when mounting Scribble for an artefact that already has Ink. */
  initialDocument?: InkDocument | null;
  /** Disables touch ownership while the persistent canvas sits behind Default mode. */
  enabled?: boolean;
  style?: object;
};

/** Swallow SignatureInk unmount rejections (and any other async failure). */
function safeInkAsync<T>(promise: Promise<T> | undefined): Promise<T | undefined> {
  if (!promise) {
    return Promise.resolve(undefined);
  }
  return promise.catch(() => undefined);
}

function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function findStrokeIndexNearPoint(strokes: InkStroke[], x: number, y: number): number {
  let bestIndex = -1;
  let bestDist = INK_ERASER_HIT_RADIUS;
  for (let i = 0; i < strokes.length; i++) {
    const points = strokes[i].points;
    if (points.length === 0) {
      continue;
    }
    if (points.length === 1) {
      const d = Math.hypot(x - points[0].x, y - points[0].y);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
      continue;
    }
    for (let j = 1; j < points.length; j++) {
      const d = distanceToSegment(x, y, points[j - 1].x, points[j - 1].y, points[j].x, points[j].y);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
  }
  return bestIndex;
}

const ArtefactInkCanvas = forwardRef<ArtefactInkCanvasHandle, ArtefactInkCanvasProps>(
  function ArtefactInkCanvas(
    { tool, penColor, penMinWidth, penMaxWidth, initialDocument = null, enabled = true, style },
    ref,
  ) {
    const inkRef = useRef<SignatureInkHandle>(null);
    const loadedRef = useRef(false);
    const mountedRef = useRef(true);
    const initialDocumentRef = useRef(initialDocument);
    /** Local stroke cache — avoids getStrokeData on every eraser move. */
    const strokesRef = useRef<InkStroke[]>(initialDocument?.strokes ?? []);
    const eraseDirtyRef = useRef(false);
    const eraseRafRef = useRef<number | null>(null);
    const previewGenRef = useRef(0);
    /** PNG snapshot shown while eraser hides the native canvas rebuild. */
    const [eraserPreviewUri, setEraserPreviewUri] = useState<string | null>(null);
    /** Warm preview kept after pen strokes so entering eraser can swap without a blank frame. */
    const warmPreviewUriRef = useRef<string | null>(null);
    /** Don't hide the canvas until the eraser preview Image has painted. */
    const [previewPainted, setPreviewPainted] = useState(false);
    const isEraser = tool === "eraser";
    const isEraserRef = useRef(isEraser);
    const hideCanvasForEraser = isEraser && eraserPreviewUri != null && previewPainted;

    useEffect(() => {
      isEraserRef.current = isEraser;
    }, [isEraser]);

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        previewGenRef.current += 1;
        if (eraseRafRef.current != null) {
          cancelAnimationFrame(eraseRafRef.current);
          eraseRafRef.current = null;
        }
      };
    }, []);

    useEffect(() => {
      initialDocumentRef.current = initialDocument;
    }, [initialDocument]);

    const capturePreview = async (): Promise<string | null> => {
      const gen = ++previewGenRef.current;
      const uri =
        (await safeInkAsync(inkRef.current?.toFile({ format: "png", trim: false }))) ?? null;
      if (gen !== previewGenRef.current || !mountedRef.current) {
        return null;
      }
      if (uri) {
        warmPreviewUriRef.current = uri;
      }
      return uri;
    };

    /** After native undo/redo: keep strokesRef + eraser/warm PNG in sync. */
    const syncAfterHistoryMutation = () => {
      void safeInkAsync(inkRef.current?.getStrokeData()).then((data) => {
        if (!data || !mountedRef.current) {
          return;
        }
        strokesRef.current = inkStrokesFromStrokeData(data);
        void capturePreview().then((uri) => {
          if (uri && mountedRef.current && isEraserRef.current) {
            setEraserPreviewUri(uri);
            setPreviewPainted(true);
          }
        });
      });
    };

    const flushErasedStrokes = () => {
      eraseRafRef.current = null;
      if (!eraseDirtyRef.current) {
        return;
      }
      eraseDirtyRef.current = false;
      inkRef.current?.setStrokeData(strokeDataFromInkStrokes(strokesRef.current) as StrokeData);
      void capturePreview().then((uri) => {
        if (uri && mountedRef.current) {
          setEraserPreviewUri(uri);
        }
      });
    };

    const scheduleEraseFlush = () => {
      eraseDirtyRef.current = true;
      if (eraseRafRef.current != null) {
        return;
      }
      eraseRafRef.current = requestAnimationFrame(flushErasedStrokes);
    };

    useImperativeHandle(ref, () => ({
      undo: () => {
        inkRef.current?.undo();
        syncAfterHistoryMutation();
      },
      redo: () => {
        inkRef.current?.redo();
        syncAfterHistoryMutation();
      },
      commit: async () => {
        const data = await safeInkAsync(inkRef.current?.getStrokeData());
        if (!mountedRef.current) {
          return {
            document: { version: 1 as const, strokes: inkStrokesFromStrokeData(data) },
            overlayUri: "",
          };
        }
        const strokes = inkStrokesFromStrokeData(data);
        strokesRef.current = strokes;
        const overlayUri =
          (await safeInkAsync(inkRef.current?.toFile({ format: "png", trim: false }))) ?? "";
        if (overlayUri.length > 0) {
          await Image.prefetch(overlayUri, "memory").catch(() => false);
        }
        return {
          document: { version: 1 as const, strokes },
          overlayUri,
        };
      },
      loadDocument: (document) => {
        const strokes = document?.strokes ?? [];
        strokesRef.current = strokes;
        inkRef.current?.setStrokeData(strokeDataFromInkStrokes(strokes) as StrokeData);
      },
      isEmpty: async () => {
        return (await safeInkAsync(inkRef.current?.isEmpty())) ?? true;
      },
    }));

    const eraseAt = (x: number, y: number) => {
      const strokes = strokesRef.current;
      const index = findStrokeIndexNearPoint(strokes, x, y);
      if (index < 0) {
        return;
      }
      strokesRef.current = strokes.filter((_, i) => i !== index);
      scheduleEraseFlush();
    };

    const handleEraserTouch = (event: GestureResponderEvent) => {
      eraseAt(event.nativeEvent.locationX, event.nativeEvent.locationY);
    };

    useEffect(() => {
      if (!isEraser) {
        setPreviewPainted(false);
        setEraserPreviewUri(null);
        return;
      }
      void safeInkAsync(inkRef.current?.getStrokeData()).then((data) => {
        if (data && mountedRef.current) {
          strokesRef.current = inkStrokesFromStrokeData(data);
        }
      });
      const warm = warmPreviewUriRef.current;
      if (warm) {
        setPreviewPainted(false);
        setEraserPreviewUri(warm);
        return;
      }
      void capturePreview().then((uri) => {
        if (uri && mountedRef.current) {
          setPreviewPainted(false);
          setEraserPreviewUri(uri);
        }
      });
    }, [isEraser]);

    const handleNativeLayout = () => {
      if (loadedRef.current) {
        return;
      }
      loadedRef.current = true;
      const doc = initialDocumentRef.current;
      if (doc && doc.strokes.length > 0) {
        strokesRef.current = doc.strokes;
        inkRef.current?.setStrokeData(strokeDataFromInkStrokes(doc.strokes) as StrokeData);
        void capturePreview();
        return;
      }
    };

    const syncStrokesFromNative = () => {
      void safeInkAsync(inkRef.current?.getStrokeData()).then((data) => {
        if (data && mountedRef.current) {
          strokesRef.current = inkStrokesFromStrokeData(data);
        }
      });
      void capturePreview();
    };

    return (
      <View
        style={[StyleSheet.absoluteFill, style]}
        pointerEvents={enabled ? "box-none" : "none"}
        onLayout={handleNativeLayout}
      >
        <SignatureInk
          ref={inkRef}
          style={[StyleSheet.absoluteFill, hideCanvasForEraser ? styles.canvasHidden : null]}
          showToolbar={false}
          showBaseline={false}
          backgroundColor="transparent"
          penColor={penColor}
          penMinWidth={penMinWidth}
          penMaxWidth={penMaxWidth}
          onEnd={syncStrokesFromNative}
        />
        {isEraser && eraserPreviewUri ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <StyledImage
              source={eraserPreviewUri}
              style={StyleSheet.absoluteFill}
              contentFit="fill"
              cachePolicy="memory-disk"
              transition={0}
              onLoad={() => setPreviewPainted(true)}
            />
          </View>
        ) : null}
        {isEraser ? (
          <View
            style={StyleSheet.absoluteFill}
            collapsable={false}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleEraserTouch}
            onResponderMove={handleEraserTouch}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  canvasHidden: {
    opacity: 0,
  },
});

export default ArtefactInkCanvas;
