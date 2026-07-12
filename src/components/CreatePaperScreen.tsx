/**
 * CreatePaperScreen — author a multi-artefact Paper entry (up to 5 pages).
 *
 * Default: horizontal CreateArtefactPager + ScrollIndicator.
 * Type: scroll locked; Prev/Next jumps + focuses the target TextInput.
 * Scribble: scroll locked; draw Ink on the current page; Save commits, Back discards session.
 * document-plus appends a blank page with entrance animation (no auto-focus).
 */
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, { type SharedValue, useAnimatedProps } from "react-native-reanimated";

import type { DraftInk } from "../data/ink";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import {
  INK_COLORS,
  INK_STROKE_SIZES,
  type InkStrokeSizeKey,
  type InkTool,
} from "../constants/ink";
import { savePaperEntry } from "../data/savePaperEntry";
import { useCreateArtefactAuthoring } from "../hooks/useCreateArtefactAuthoring";
import { useCreateEntrySave } from "../hooks/useCreateEntrySave";
import ArtefactInkCanvas, { type ArtefactInkCanvasHandle } from "./ArtefactInkCanvas";
import CreateArtefactPager from "./CreateArtefactPager";
import { useCreateContext, useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePaper from "./EditablePaper";
import ScribbleToolStrip from "./ScribbleToolStrip";

const PAPER_BOTTOM_GUTTER = 16;

type DraftPaper = { id: string; text: string; ink: DraftInk | null };

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

  const EXPANDED_WIDTH = windowWidth - 20;
  const EXPANDED_HEIGHT = (EXPANDED_WIDTH * 297) / 210;

  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPaper[]>(() => [
    { id: randomUUID(), text: "", ink: null },
  ]);
  const scrollRefs = useRef<(ScrollView | null)[]>([]);
  const inkCanvasRefs = useRef<Record<string, ArtefactInkCanvasHandle | null>>({});

  const [inkTool, setInkTool] = useState<InkTool>("pen");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkSizeKey, setInkSizeKey] = useState<InkStrokeSizeKey>("M");

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

  const scrollAnimatedProps = useAnimatedProps(() => {
    const inset = Math.max(0, -keyboardHeight.get()) + PAPER_BOTTOM_GUTTER;
    return {
      contentInset: { bottom: inset },
      scrollIndicatorInsets: { bottom: inset },
    };
  });

  const handleAddArtefact = () => {
    const item: DraftPaper = { id: randomUUID(), text: "", ink: null };
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
        artefacts: artefacts.map((a) => ({ text: a.text, ink: a.ink })),
      }),
    onSuccess: () => {
      bumpEntriesVersion();
      onClose();
    },
  });

  const updateText = (index: number, text: string) => {
    setArtefacts((prev) => prev.map((item, i) => (i === index ? { ...item, text } : item)));
  };

  const activeInkCanvas = () => {
    const id = artefacts[activeIndex]?.id;
    return id ? inkCanvasRefs.current[id] : null;
  };

  const handleScribbleSave = async () => {
    const committed = await activeInkCanvas()?.commit();
    if (!committed) {
      return;
    }
    const index = activeIndex;
    setArtefacts((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              ink:
                committed.document.strokes.length > 0
                  ? { document: committed.document, overlayUri: committed.overlayUri }
                  : null,
            }
          : item,
      ),
    );
    exitScribble();
  };

  const handleScribbleBack = () => {
    // Discard uncommitted session strokes; last Save is already on the draft.
    activeInkCanvas()?.loadDocument(artefacts[activeIndex]?.ink?.document ?? null);
    handleBack();
  };

  const size = INK_STROKE_SIZES[inkSizeKey];

  const scribbleTools = scribbleActive ? (
    <ScribbleToolStrip
      tool={inkTool}
      onToolChange={setInkTool}
      color={inkColor}
      onColorChange={setInkColor}
      sizeKey={inkSizeKey}
      onSizeChange={setInkSizeKey}
      onUndo={() => activeInkCanvas()?.undo()}
      onRedo={() => activeInkCanvas()?.redo()}
    />
  ) : null;

  return (
    <CreateScreenChrome
      progress={progress}
      expandProgress={expandProgress}
      typeLabel="PAPER"
      title={title}
      onChangeTitle={setTitle}
      onClose={onClose}
      onSubmit={submit}
      saving={saving}
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
    >
      <CreateArtefactPager
        ref={pagerRef}
        count={artefacts.length}
        pageKeys={artefacts.map((a) => a.id)}
        scrollEnabled={!typeState && !scribbleActive && !saving}
        showScrollIndicator={!typeState && !scribbleActive}
        onActiveIndexChange={handleActiveIndexChange}
        enteringIndex={enteringIndex}
        onEnteringComplete={() => setEnteringIndex(null)}
        suppressArtefactFocusRef={suppressArtefactFocusRef}
        renderPreview={(index) => (
          <View className="h-14 w-10 items-center justify-center overflow-hidden rounded-sm bg-paper">
            <Text numberOfLines={3} className="px-0.5 font-mono text-[6px] text-primary">
              {artefacts[index]?.text || " "}
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
                  value={draft.text}
                  onChangeText={(text) => updateText(index, text)}
                  expandProgress={expandProgress}
                  keepExpandedOnBlurRef={keepExpandedOnBlurRef}
                  suppressArtefactFocusRef={suppressArtefactFocusRef}
                  editable={!saving}
                  inkOverlayUri={draft.ink?.overlayUri}
                  scribbleActive={scribbleActive}
                  textInputRef={(node) => {
                    inputRefs.current[index] = node;
                  }}
                  scribbleCanvas={
                    <ArtefactInkCanvas
                      key={draft.id}
                      ref={(node) => {
                        inkCanvasRefs.current[draft.id] = node;
                      }}
                      tool={inkTool}
                      penColor={inkColor}
                      penMinWidth={size.min}
                      penMaxWidth={size.max}
                      initialDocument={draft.ink?.document ?? null}
                      enabled={isActiveScribble}
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
