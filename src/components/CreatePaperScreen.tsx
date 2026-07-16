/**
 * CreatePaperScreen — author a multi-artefact Paper entry (up to 5 pages).
 *
 * Default: horizontal CreateArtefactPager + ScrollIndicator.
 * Type: scroll locked; Prev/Next focuses TextKit; paragraph presets float above the keyboard.
 * Scribble: scroll locked; draw Ink on the current page; Save commits, Back discards session.
 * document-plus appends a blank page with entrance animation (no auto-focus).
 *
 * Each draft owns one atomic `PaperDocument` (plain text + paragraph tokens).
 * Native TextKit accepts/rejects edits synchronously, then this screen mirrors
 * only accepted documents into React state for persistence. Selection/capacity
 * events are kept separately by artefact id because the floating toolbar follows
 * whichever virtualized page currently owns first responder.
 *
 * Closing is deliberately two-phase. Native responders are resigned and
 * focus-driven React updates are frozen while the root-owned tree is mounted;
 * the Create close spring starts on the following frame. The complete Create
 * screen stays in one root Fabric hierarchy; only its small Bloom menu portals,
 * preventing nested native reparenting during teardown.
 *
 * The authoring canvas is allocated at final expanded resolution from mount and
 * downscaled in Default. TextKit still measures the invariant logical canvas;
 * the higher presentation scale exists solely so the focused surface reaches
 * scale 1 instead of magnifying a blurry collapsed raster.
 */
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { type SharedValue, useAnimatedProps } from "react-native-reanimated";

import type { DraftInk } from "../data/ink";
import type { PaperDocument, PaperParagraphPreset } from "../data/paperDocument";
import type { PaperSelectionState, PaperTextSurfaceHandle } from "./PaperTextSurface.types";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { createPaperDocument } from "../data/paperDocument";
import { savePaperEntry } from "../data/savePaperEntry";
import { useCreateArtefactAuthoring } from "../hooks/useCreateArtefactAuthoring";
import { useCreateEntrySave } from "../hooks/useCreateEntrySave";
import { useCreateScreenDismissal } from "../hooks/useCreateScreenDismissal";
import { useScribbleSession } from "../hooks/useScribbleSession";
import ArtefactInkCanvas, { type ArtefactInkCanvasHandle } from "./ArtefactInkCanvas";
import CreateArtefactPager from "./CreateArtefactPager";
import { useCreateContext, useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePaper from "./EditablePaper";
import { PAPER_CANVAS_WIDTH } from "./paperLayout";
import PaperTextPresetToolbar from "./PaperTextPresetToolbar";

/** Extra ScrollView inset keeps the Paper bottom clear of the raised keyboard. */
const PAPER_BOTTOM_GUTTER = 16;

type DraftPaper = {
  /** Stable pager key and future durable artefact identity. */
  id: string;
  /** Parent-owned text + paragraph tokens accepted by native TextKit. */
  document: PaperDocument;
  /** Last committed Scribble snapshot for this in-progress page. */
  ink: DraftInk | null;
};

/** Used until the focused native surface publishes its first selection event. */
const DEFAULT_SELECTION_STATE: PaperSelectionState = {
  selectedPreset: "default",
  canApply: { default: true, large: true, "x-large": true },
};

/** Cheap structural equality keeps high-frequency native selection events out of React state. */
function selectionStatesEqual(left: PaperSelectionState, right: PaperSelectionState): boolean {
  return (
    left.selectedPreset === right.selectedPreset &&
    left.canApply.default === right.canApply.default &&
    left.canApply.large === right.canApply.large &&
    left.canApply["x-large"] === right.canApply["x-large"]
  );
}

type CreatePaperScreenProps = {
  progress: SharedValue<number>;
  date: string;
  onClose: () => void;
};

const CreatePaperScreen = ({ progress, date, onClose }: CreatePaperScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { setCreateSessionBusy } = useCreateContext();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { width: windowWidth } = useWindowDimensions();

  // These dimensions match the Create chrome's 10-point side gutters. Paper
  // stays at this resolution even while visually collapsed, avoiding a raster
  // resolution switch at the moment Type takes focus.
  const EXPANDED_WIDTH = windowWidth - 20;
  const EXPANDED_HEIGHT = (EXPANDED_WIDTH * 297) / 210;
  const PAPER_PRESENTATION_SCALE = EXPANDED_WIDTH / PAPER_CANVAS_WIDTH;

  /** Entry-level metadata remains independent of each Paper page document. */
  const [title, setTitle] = useState("");
  /** Source of truth for draft content; native emits only capacity-valid states. */
  const [artefacts, setArtefacts] = useState<DraftPaper[]>(() => [
    { id: randomUUID(), document: createPaperDocument(), ink: null },
  ]);
  /** Latest native caret/preset availability keyed by stable draft id. */
  const [selectionStates, setSelectionStates] = useState<Record<string, PaperSelectionState>>({});
  /** Per-page vertical scroll is reset whenever the horizontal pager changes page. */
  const scrollRefs = useRef<(ScrollView | null)[]>([]);
  /** Scribble session addresses native Ink canvases by stable artefact id. */
  const inkCanvasRefs = useRef<Record<string, ArtefactInkCanvasHandle | null>>({});
  /** Paper-only extension of the shared focus refs, used by the preset toolbar. */
  const paperInputRefs = useRef<(PaperTextSurfaceHandle | null)[]>([]);

  const resetVerticalScroll = useCallback((index: number) => {
    scrollRefs.current[index]?.scrollTo({ y: 0, animated: false });
  }, []);

  const {
    activeIndex,
    enteringIndex,
    setEnteringIndex,
    typeState,
    scribbleActive,
    expandProgress,
    pagerRef,
    keepExpandedOnBlurRef,
    suppressArtefactFocusRef,
    inputRefs,
    handleActiveIndexChange,
    handlePrev,
    handleNext,
    handleBack,
    prepareForDismiss,
    enterScribble,
    exitScribble,
    tryAppend,
    syncArtefactCount,
  } = useCreateArtefactAuthoring({
    onActiveIndexChange: resetVerticalScroll,
  });

  useEffect(() => {
    syncArtefactCount(artefacts.length);
  }, [artefacts.length, syncArtefactCount]);

  const { closing, handleClose } = useCreateScreenDismissal(onClose, prepareForDismiss);

  const {
    inkTool,
    inkColor,
    size,
    scribbleSaving,
    handleScribbleSave,
    handleScribbleBack,
    renderScribbleTools,
  } = useScribbleSession({
    artefacts,
    setArtefacts,
    activeIndex,
    inkCanvasRefs,
    exitScribble,
    onBackFromScribble: handleBack,
    setSessionBusy: setCreateSessionBusy,
  });

  const scrollAnimatedProps = useAnimatedProps(() => {
    const inset = Math.max(0, -keyboardHeight.get()) + PAPER_BOTTOM_GUTTER;
    return {
      contentInset: { bottom: inset },
      scrollIndicatorInsets: { bottom: inset },
    };
  });

  const handleAddArtefact = () => {
    const item: DraftPaper = { id: randomUUID(), document: createPaperDocument(), ink: null };
    tryAppend(() => {
      setArtefacts((prev) => {
        if (prev.length >= MAX_ARTEFACTS_PER_ENTRY) {
          return prev;
        }
        return [...prev, item];
      });
    });
  };

  const { saving, submit } = useCreateEntrySave({
    setSessionBusy: setCreateSessionBusy,
    save: () =>
      savePaperEntry({
        date,
        title: title.trim() || "Untitled",
        artefacts: artefacts.map((a) => ({ document: a.document, ink: a.ink })),
      }),
    onSuccess: () => {
      bumpEntriesVersion();
      handleClose();
    },
  });

  /** Mirror one already-accepted native document into the JS draft on the JS thread. */
  const updateDocument = (index: number, document: PaperDocument) => {
    setArtefacts((prev) => prev.map((item, i) => (i === index ? { ...item, document } : item)));
  };

  /**
   * Store native toolbar state only when it materially changes. Selection
   * events may repeat during controlled acknowledgements; retaining object
   * identity avoids rerendering the complete pager for equivalent capacity.
   */
  const updateSelectionState = (artefactId: string, state: PaperSelectionState) => {
    setSelectionStates((previous) => {
      const current = previous[artefactId];
      if (current && selectionStatesEqual(current, state)) {
        return previous;
      }
      return { ...previous, [artefactId]: state };
    });
  };

  /** Route a toolbar choice to the active first-responder surface; native rechecks fit. */
  const handleSelectPreset = (preset: PaperParagraphPreset) => {
    void paperInputRefs.current[activeIndex]?.setParagraphPreset(preset);
  };

  const scribbleTools = renderScribbleTools(scribbleActive);

  // Pager virtualization means a page may not have emitted a selection event
  // yet. The permissive default keeps controls responsive; native remains the
  // final capacity gate and will reject an optimistic larger preset if needed.
  const activeArtefactId = artefacts[activeIndex]?.id;
  const activeSelectionState =
    (activeArtefactId ? selectionStates[activeArtefactId] : undefined) ?? DEFAULT_SELECTION_STATE;

  return (
    <CreateScreenChrome
      progress={progress}
      expandProgress={expandProgress}
      typeLabel="PAPER"
      title={title}
      onChangeTitle={setTitle}
      onClose={handleClose}
      onSubmit={submit}
      saving={saving || scribbleSaving}
      onBack={scribbleActive ? handleScribbleBack : handleBack}
      activeArtefactIndex={activeIndex}
      artefactCount={artefacts.length}
      onPrevArtefact={handlePrev}
      onNextArtefact={() => handleNext(artefacts.length)}
      addConfig={{ kind: "immediate", onAdd: handleAddArtefact }}
      onEnterScribble={enterScribble}
      scribbleActive={scribbleActive}
      onScribbleSave={() => {
        void handleScribbleSave();
      }}
      scribbleTools={scribbleTools}
      floatingAccessory={
        typeState && !closing ? (
          <PaperTextPresetToolbar
            selectionState={activeSelectionState}
            onSelectPreset={handleSelectPreset}
          />
        ) : null
      }
    >
      <CreateArtefactPager
        ref={pagerRef}
        count={artefacts.length}
        pageKeys={artefacts.map((a) => a.id)}
        scrollEnabled={!typeState && !scribbleActive && !saving && !scribbleSaving && !closing}
        showScrollIndicator={!typeState && !scribbleActive}
        onActiveIndexChange={handleActiveIndexChange}
        enteringIndex={enteringIndex}
        onEnteringComplete={() => setEnteringIndex(null)}
        suppressArtefactFocusRef={suppressArtefactFocusRef}
        renderPreview={(index) => (
          <View className="h-14 w-10 items-center justify-center overflow-hidden rounded-sm bg-paper">
            <Text numberOfLines={3} className="px-0.5 font-mono text-[6px] text-primary">
              {artefacts[index]?.document.text || " "}
            </Text>
          </View>
        )}
        renderPage={(index) => {
          const draft = artefacts[index];
          if (!draft) {
            return null;
          }
          const isActiveScribble = scribbleActive && index === activeIndex;
          return (
            <Animated.ScrollView
              ref={(node: ScrollView | null) => {
                scrollRefs.current[index] = node;
              }}
              style={{ flex: 1, width: EXPANDED_WIDTH }}
              contentContainerStyle={{ alignItems: "center" }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={!scribbleActive}
              animatedProps={scrollAnimatedProps}
            >
              <View
                style={{ width: EXPANDED_WIDTH, height: EXPANDED_HEIGHT }}
                className="items-center justify-start"
              >
                <EditablePaper
                  document={draft.document}
                  onChangeDocument={(document) => updateDocument(index, document)}
                  onSelectionStateChange={(state) => updateSelectionState(draft.id, state)}
                  expandProgress={expandProgress}
                  keepExpandedOnBlurRef={keepExpandedOnBlurRef}
                  suppressArtefactFocusRef={suppressArtefactFocusRef}
                  editable={!saving && !scribbleSaving && !closing}
                  inkOverlayUri={draft.ink?.overlayUri}
                  scribbleActive={scribbleActive}
                  textInputRef={(node) => {
                    inputRefs.current[index] = node;
                    paperInputRefs.current[index] = node;
                  }}
                  scribbleCanvas={
                    <ArtefactInkCanvas
                      key={draft.id}
                      ref={(node) => {
                        inkCanvasRefs.current[draft.id] = node;
                      }}
                      tool={inkTool}
                      penColor={inkColor}
                      penMinWidth={size.min * PAPER_PRESENTATION_SCALE}
                      penMaxWidth={size.max * PAPER_PRESENTATION_SCALE}
                      interactionScale={PAPER_PRESENTATION_SCALE}
                      initialDocument={draft.ink?.document ?? null}
                      enabled={isActiveScribble}
                      locked={scribbleSaving}
                    />
                  }
                />
              </View>
            </Animated.ScrollView>
          );
        }}
      />
    </CreateScreenChrome>
  );
};

export default CreatePaperScreen;
