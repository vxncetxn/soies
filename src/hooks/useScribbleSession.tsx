/**
 * Shared Scribble tool state + Save/Back orchestration for Create Paper/Print.
 *
 * Keeps both screens on one Save contract: commit must succeed (or Alert+Retry),
 * tools lock while committing, Back uses non-undoable replace via loadDocument,
 * and the create session owns every committed temporary overlay until Entry
 * Submit has copied it durably. Canvas pages are virtualized, so assigning that
 * ownership to an individual canvas would let pager unmount delete a PNG still
 * referenced by draft state.
 *
 * Uses promise chains instead of try/finally — React Compiler cannot lower
 * `try` with a `finally` clause yet.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { Alert } from "react-native";

import type { ArtefactInkCanvasHandle } from "../components/ArtefactInkCanvas";
import type { DraftInk } from "../data/ink";

import ScribbleToolStrip from "../components/ScribbleToolStrip";
import {
  INK_COLORS,
  INK_STROKE_SIZES,
  type InkStrokeSizeKey,
  type InkTool,
} from "../constants/ink";
import { deleteMediaFile } from "../storage/files";

type DraftWithInk = { id: string; ink: DraftInk | null };

function deleteTemporaryOverlay(uri: string | undefined): void {
  if (!uri) {
    return;
  }
  void deleteMediaFile(uri).catch(() => {
    // Temporary cleanup is best-effort; the OS also owns cache eviction.
  });
}

export function useScribbleSession<T extends DraftWithInk>(options: {
  artefacts: T[];
  setArtefacts: Dispatch<SetStateAction<T[]>>;
  activeIndex: number;
  inkCanvasRefs: RefObject<Record<string, ArtefactInkCanvasHandle | null>>;
  exitScribble: () => void;
  onBackFromScribble: () => void;
  setSessionBusy: (busy: boolean) => void;
}) {
  const {
    artefacts,
    setArtefacts,
    activeIndex,
    inkCanvasRefs,
    exitScribble,
    onBackFromScribble,
    setSessionBusy,
  } = options;

  const [inkTool, setInkTool] = useState<InkTool>("pen");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkSizeKey, setInkSizeKey] = useState<InkStrokeSizeKey>("M");
  const [scribbleSaving, setScribbleSaving] = useState(false);
  const aliveRef = useRef(true);
  const scribbleSaveGenRef = useRef(0);
  const handleScribbleSaveRef = useRef<() => void>(() => {});
  /** Temporary PNGs transferred from canvases and still referenced by draft state. */
  const ownedOverlayUrisRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const ownedOverlayUris = ownedOverlayUrisRef.current;
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      scribbleSaveGenRef.current += 1;
      setSessionBusy(false);
      for (const uri of ownedOverlayUris.values()) {
        deleteTemporaryOverlay(uri);
      }
      ownedOverlayUris.clear();
    };
  }, [setSessionBusy]);

  const activeInkCanvas = useCallback(() => {
    const id = artefacts[activeIndex]?.id;
    return id ? inkCanvasRefs.current[id] : null;
  }, [artefacts, activeIndex, inkCanvasRefs]);

  const handleScribbleSave = useCallback(() => {
    if (scribbleSaving) {
      return;
    }
    const canvas = activeInkCanvas();
    if (!canvas) {
      Alert.alert(
        "Ink canvas isn’t ready",
        "Keep Scribble open for a moment, then try Save again.",
      );
      return;
    }
    const generation = ++scribbleSaveGenRef.current;
    const artefactId = artefacts[activeIndex]?.id;
    if (!artefactId) {
      Alert.alert("Couldn’t save Ink", "The current artefact is no longer available.");
      return;
    }
    setScribbleSaving(true);
    setSessionBusy(true);

    void canvas
      .commit()
      .then((committed) => {
        if (!aliveRef.current || generation !== scribbleSaveGenRef.current) {
          deleteTemporaryOverlay(committed.overlayUri);
          return;
        }
        const previousUri = ownedOverlayUrisRef.current.get(artefactId);
        const hasInk = committed.document.strokes.length > 0;
        if (hasInk) {
          ownedOverlayUrisRef.current.set(artefactId, committed.overlayUri);
        } else {
          ownedOverlayUrisRef.current.delete(artefactId);
          deleteTemporaryOverlay(committed.overlayUri);
        }
        if (previousUri && previousUri !== committed.overlayUri) {
          deleteTemporaryOverlay(previousUri);
        }
        setArtefacts((prev) =>
          prev.map((item) =>
            item.id === artefactId
              ? {
                  ...item,
                  ink: hasInk
                    ? { document: committed.document, overlayUri: committed.overlayUri }
                    : null,
                }
              : item,
          ),
        );
        exitScribble();
      })
      .catch((error: unknown) => {
        if (!aliveRef.current || generation !== scribbleSaveGenRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : "Couldn’t save this Ink.";
        Alert.alert("Couldn’t save Ink", message, [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Retry",
            onPress: () => {
              handleScribbleSaveRef.current();
            },
          },
        ]);
      })
      .then(() => {
        if (aliveRef.current && generation === scribbleSaveGenRef.current) {
          setScribbleSaving(false);
          setSessionBusy(false);
        }
      });
  }, [
    activeInkCanvas,
    activeIndex,
    artefacts,
    exitScribble,
    scribbleSaving,
    setArtefacts,
    setSessionBusy,
  ]);

  useEffect(() => {
    handleScribbleSaveRef.current = handleScribbleSave;
  }, [handleScribbleSave]);

  const handleScribbleBack = useCallback(() => {
    if (scribbleSaving) {
      return;
    }
    // Discard uncommitted session strokes; last Save is already on the draft.
    const ink = artefacts[activeIndex]?.ink ?? null;
    const canvas = activeInkCanvas();
    const document = ink?.document ?? null;
    // Exit first so Default shows the committed overlay and hides the live
    // canvas (opacity 0). Remount PencilKit only after that paint — otherwise
    // replaceStrokeData flickers every remaining stroke.
    onBackFromScribble();
    requestAnimationFrame(() => {
      canvas?.loadDocument(document);
    });
  }, [activeInkCanvas, activeIndex, artefacts, onBackFromScribble, scribbleSaving]);

  const size = INK_STROKE_SIZES[inkSizeKey];

  const renderScribbleTools = (scribbleActive: boolean): ReactNode => {
    if (!scribbleActive) {
      return null;
    }
    return (
      <ScribbleToolStrip
        tool={inkTool}
        onToolChange={setInkTool}
        color={inkColor}
        onColorChange={setInkColor}
        sizeKey={inkSizeKey}
        onSizeChange={setInkSizeKey}
        onUndo={() => {
          if (!scribbleSaving) {
            activeInkCanvas()?.undo();
          }
        }}
        onRedo={() => {
          if (!scribbleSaving) {
            activeInkCanvas()?.redo();
          }
        }}
      />
    );
  };

  return {
    inkTool,
    inkColor,
    inkSizeKey,
    size,
    scribbleSaving,
    handleScribbleSave,
    handleScribbleBack,
    renderScribbleTools,
  };
}
