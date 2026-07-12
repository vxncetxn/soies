/**
 * ArtefactInkCanvas — seam over react-native-signature-ink (vendored fork).
 *
 * Owns pen/eraser tools, undo/redo, stroke load/export, and PNG export for the
 * overlay cache. Create/read UIs never import signature-ink directly.
 *
 * Stroke eraser calls native `eraseStrokeNear` (dp/points on both platforms);
 * one drag is one undo transaction — no per-frame JS hit-test or PNG work.
 *
 * `commit` uses native `snapshot` so stroke JSON and PNG share one revision.
 * Failures reject (Save stays in Scribble). `loadDocument` uses
 * `replaceStrokeData` so Back cannot push discarded ink onto Undo.
 * Successful Save clears history via `clearHistory`.
 *
 * A successful `commit` transfers its temporary PNG to `useScribbleSession`.
 * The canvas deletes only failed/cancelled snapshots. This distinction matters
 * because the pager virtualizes off-window canvases while draft state still
 * needs their committed PNGs for Entry Submit.
 */
import { Image } from "expo-image";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { SignatureInk, type SignatureInkHandle, type StrokeData } from "react-native-signature-ink";

import { INK_ERASER_HIT_RADIUS, type InkTool } from "../constants/ink";
import {
  inkStrokesFromStrokeData,
  strokeDataForCanvas,
  type InkCanvasSize,
  type InkDocument,
} from "../data/ink";
import { deleteMediaFile } from "../storage/files";

export type ArtefactInkCanvasHandle = {
  undo: () => void;
  redo: () => void;
  /**
   * Atomic stroke + PNG snapshot for durable commit.
   * Rejects on native failure — caller must keep Scribble open and offer Retry.
   */
  commit: () => Promise<{ document: InkDocument; overlayUri: string }>;
  /** Replace canvas with committed strokes (clears undo stack; non-undoable). */
  loadDocument: (document: InkDocument | null) => void;
  /** Clear undo/redo after a successful Save without changing pixels. */
  clearHistory: () => void;
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
  /** When true, ignore input (Save in flight). */
  locked?: boolean;
  style?: object;
};

/** Swallow only classified cancellation (unmount / missing view) for preview work. */
function isBenignInkCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message;
  return message.includes("unmounted") || message.includes("not mounted");
}

function deleteFailedSnapshot(uri: string | null | undefined): void {
  if (!uri) {
    return;
  }
  void deleteMediaFile(uri).catch(() => {});
}

const ArtefactInkCanvas = forwardRef<ArtefactInkCanvasHandle, ArtefactInkCanvasProps>(
  function ArtefactInkCanvas(
    {
      tool,
      penColor,
      penMinWidth,
      penMaxWidth,
      initialDocument = null,
      enabled = true,
      locked = false,
      style,
    },
    ref,
  ) {
    const inkRef = useRef<SignatureInkHandle>(null);
    const loadedRef = useRef(false);
    const mountedRef = useRef(true);
    const initialDocumentRef = useRef(initialDocument);
    const canvasSizeRef = useRef<InkCanvasSize | null>(null);
    const commitGenerationRef = useRef(0);
    const [committing, setCommitting] = useState(false);
    const isEraser = tool === "eraser";
    const inputEnabled = enabled && !locked && !committing;

    useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        commitGenerationRef.current += 1;
      };
    }, []);

    useEffect(() => {
      initialDocumentRef.current = initialDocument;
    }, [initialDocument]);

    useImperativeHandle(ref, () => ({
      undo: () => {
        if (!inputEnabled) {
          return;
        }
        inkRef.current?.undo();
      },
      redo: () => {
        if (!inputEnabled) {
          return;
        }
        inkRef.current?.redo();
      },
      clearHistory: () => {
        inkRef.current?.clearHistory();
      },
      commit: () => {
        const ink = inkRef.current;
        if (!ink) {
          return Promise.reject(new Error("Ink canvas is not ready."));
        }
        const generation = ++commitGenerationRef.current;
        setCommitting(true);
        return ink
          .snapshot({ format: "png", trim: false })
          .then((snap) => {
            if (!mountedRef.current || generation !== commitGenerationRef.current) {
              deleteFailedSnapshot(snap.fileUri);
              throw new Error("Ink save was cancelled.");
            }
            if (!snap.fileUri) {
              throw new Error("Ink overlay export failed.");
            }
            if (
              !Number.isFinite(snap.canvasWidth) ||
              snap.canvasWidth <= 0 ||
              !Number.isFinite(snap.canvasHeight) ||
              snap.canvasHeight <= 0
            ) {
              deleteFailedSnapshot(snap.fileUri);
              throw new Error("Ink canvas dimensions are invalid.");
            }
            let strokes;
            try {
              strokes = inkStrokesFromStrokeData(snap.strokes);
            } catch (error) {
              deleteFailedSnapshot(snap.fileUri);
              throw error;
            }
            return Image.prefetch(snap.fileUri, "memory").then(
              (prefetched) => {
                if (!prefetched) {
                  deleteFailedSnapshot(snap.fileUri);
                  throw new Error("Ink overlay could not be prepared for display.");
                }
                ink.clearHistory();
                return {
                  document: {
                    version: 2 as const,
                    canvas: { width: snap.canvasWidth, height: snap.canvasHeight },
                    strokes,
                  },
                  overlayUri: snap.fileUri,
                };
              },
              (error: unknown) => {
                deleteFailedSnapshot(snap.fileUri);
                throw error;
              },
            );
          })
          .then(
            (result) => {
              if (generation === commitGenerationRef.current && mountedRef.current) {
                setCommitting(false);
              }
              return result;
            },
            (error: unknown) => {
              if (generation === commitGenerationRef.current && mountedRef.current) {
                setCommitting(false);
              }
              throw error;
            },
          );
      },
      loadDocument: (document) => {
        const targetSize = canvasSizeRef.current;
        const strokes = document && targetSize ? strokeDataForCanvas(document, targetSize) : [];
        inkRef.current?.replaceStrokeData(strokes as StrokeData);
      },
      isEmpty: () => {
        const ink = inkRef.current;
        if (!ink) {
          return Promise.resolve(true);
        }
        return ink.isEmpty().catch((error: unknown) => {
          if (isBenignInkCancellation(error)) {
            return true;
          }
          throw error;
        });
      },
    }));

    const handleEraserTouch = (event: GestureResponderEvent) => {
      if (!inputEnabled) {
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      inkRef.current?.eraseStrokeNear(locationX, locationY, INK_ERASER_HIT_RADIUS);
    };

    const handleEraserStart = (event: GestureResponderEvent) => {
      if (!inputEnabled) {
        return;
      }
      inkRef.current?.beginEraseGesture();
      handleEraserTouch(event);
    };

    const handleEraserEnd = () => {
      inkRef.current?.endEraseGesture();
    };

    const handleNativeLayout = (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      canvasSizeRef.current = { width, height };
      if (loadedRef.current) {
        return;
      }
      loadedRef.current = true;
      const doc = initialDocumentRef.current;
      if (doc && doc.strokes.length > 0) {
        inkRef.current?.replaceStrokeData(
          strokeDataForCanvas(doc, { width, height }) as StrokeData,
        );
      }
    };

    return (
      <View
        style={[StyleSheet.absoluteFill, style]}
        pointerEvents={inputEnabled ? "box-none" : "none"}
        onLayout={handleNativeLayout}
      >
        <SignatureInk
          ref={inkRef}
          style={StyleSheet.absoluteFill}
          showToolbar={false}
          showBaseline={false}
          backgroundColor="transparent"
          penColor={penColor}
          penMinWidth={penMinWidth}
          penMaxWidth={penMaxWidth}
        />
        {isEraser ? (
          <View
            style={StyleSheet.absoluteFill}
            collapsable={false}
            onStartShouldSetResponder={() => inputEnabled}
            onMoveShouldSetResponder={() => inputEnabled}
            onResponderGrant={handleEraserStart}
            onResponderMove={handleEraserTouch}
            onResponderRelease={handleEraserEnd}
            onResponderTerminate={handleEraserEnd}
          />
        ) : null}
      </View>
    );
  },
);

export default ArtefactInkCanvas;
