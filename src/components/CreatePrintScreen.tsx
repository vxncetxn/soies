import { randomUUID } from "expo-crypto";
/**
 * CreatePrintScreen — author a multi-artefact Print entry (up to 5).
 *
 * Starts with the image from Create Entry. document-plus blooms the shared
 * Print media panel; on successful pick, appends with entrance animation.
 * Type: scroll locked; Prev/Next jumps + focuses caption.
 * Scribble: scroll locked; draw Ink on the current page; Save commits, Back discards session.
 */
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { type SharedValue } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import type { DraftInk } from "../data/ink";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import {
  INK_COLORS,
  INK_STROKE_SIZES,
  type InkStrokeSizeKey,
  type InkTool,
} from "../constants/ink";
import { savePrintEntry } from "../data/savePrintEntry";
import { useCreateArtefactAuthoring } from "../hooks/useCreateArtefactAuthoring";
import { useCreateEntrySave } from "../hooks/useCreateEntrySave";
import { usePrintImagePickFlow } from "../hooks/usePrintImagePickFlow";
import ArtefactInkCanvas, { type ArtefactInkCanvasHandle } from "./ArtefactInkCanvas";
import CreateArtefactPager from "./CreateArtefactPager";
import { useCreateContext, useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePrint from "./EditablePrint";
import { PrintMediaBloomPanel } from "./PrintMediaBloomPanel";
import ScribbleToolStrip from "./ScribbleToolStrip";

const StyledImage = withUniwind(Image);

type DraftPrint = { id: string; text: string; imageUri: string; ink: DraftInk | null };

type CreatePrintScreenProps = {
  progress: SharedValue<number>;
  date: string;
  imageUri: string;
  onClose: () => void;
};

const CreatePrintScreen = ({ progress, date, imageUri, onClose }: CreatePrintScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { setCreateSessionBusy } = useCreateContext();
  const { width: windowWidth } = useWindowDimensions();
  // Match EditablePrint / Paper: Scribble needs a top-aligned EXPANDED slot so the
  // scaled polaroid isn't vertically centered in the flex-1 pager page.
  const paperHeight = ((windowWidth - 80) / 210) * 297;
  const printBaseWidth = (53 / 86) * paperHeight;
  const printExpandedWidth = windowWidth - 20;
  const printExpandedHeight = paperHeight * (printExpandedWidth / printBaseWidth);
  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPrint[]>(() => [
    { id: randomUUID(), text: "", imageUri, ink: null },
  ]);
  const [barOpen, setBarOpen] = useState(false);
  const inkCanvasRefs = useRef<Record<string, ArtefactInkCanvasHandle | null>>({});

  const [inkTool, setInkTool] = useState<InkTool>("pen");
  const [inkColor, setInkColor] = useState<string>(INK_COLORS[0]);
  const [inkSizeKey, setInkSizeKey] = useState<InkStrokeSizeKey>("M");

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
  } = useCreateArtefactAuthoring();

  useEffect(() => {
    syncArtefactCount(artefacts.length);
  }, [artefacts.length, syncArtefactCount]);

  const appendPrint = (uri: string) => {
    const item: DraftPrint = { id: randomUUID(), text: "", imageUri: uri, ink: null };
    tryAppend(() => {
      setArtefacts((prev) => {
        if (prev.length >= MAX_ARTEFACTS_PER_ENTRY) {
          return prev;
        }
        return [...prev, item];
      });
    });
  };

  const {
    picking,
    mediaScreen,
    setMediaScreen,
    permissionSource,
    errorMessage,
    handlePick,
    resetToMedia,
  } = usePrintImagePickFlow({
    onBeforePick: () => setBarOpen(false),
    onNeedsAttention: () => setBarOpen(true),
    onSuccess: (uri) => {
      appendPrint(uri);
    },
  });

  const { saving, submit } = useCreateEntrySave({
    setSessionBusy: setCreateSessionBusy,
    save: async () => {
      if (artefacts.length === 0) {
        throw new Error("Print entry needs at least one image.");
      }
      await savePrintEntry({
        date,
        title: title.trim() || "Untitled",
        artefacts: artefacts.map((a) => ({
          text: a.text,
          imageUri: a.imageUri,
          ink: a.ink,
        })),
      });
    },
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
    activeInkCanvas()?.loadDocument(artefacts[activeIndex]?.ink?.document ?? null);
    handleBack();
  };

  const size = INK_STROKE_SIZES[inkSizeKey];

  const addBloomPanel = (
    <PrintMediaBloomPanel
      screen={mediaScreen}
      picking={picking}
      permissionSource={permissionSource}
      errorMessage={errorMessage}
      onPick={(source) => {
        void handlePick(source);
      }}
      onBackToMedia={resetToMedia}
      onDismiss={() => {
        resetToMedia();
        setBarOpen(false);
      }}
    />
  );

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
      typeLabel="PRINT"
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
      addConfig={{
        kind: "bloom",
        panel: addBloomPanel,
        contentKey: mediaScreen,
        forceAddPanel: mediaScreen === "permission" || mediaScreen === "error",
        onOpen: () => setMediaScreen("media"),
        barOpen,
        onBarOpenChange: setBarOpen,
      }}
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
        renderPreview={(index) => {
          const draft = artefacts[index];
          return (
            <View className="h-14 w-10 overflow-hidden rounded-sm bg-paper">
              {draft ? (
                <StyledImage
                  source={draft.imageUri}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                />
              ) : null}
            </View>
          );
        }}
        renderPage={(index) => {
          const draft = artefacts[index];
          if (!draft) {
            return null;
          }
          const isActiveScribble = scribbleActive && index === activeIndex;
          // Same top-aligned EXPANDED slot as CreatePaperScreen — Print's flex-1
          // centering + Type pin left a large gap under the Scribble header.
          return (
            <Animated.ScrollView
              style={{ flex: 1, width: printExpandedWidth }}
              contentContainerStyle={{ alignItems: "center" }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              scrollEnabled={false}
            >
              <View
                style={{
                  width: printExpandedWidth,
                  height: printExpandedHeight,
                }}
                className="items-center justify-start"
              >
                <EditablePrint
                  imageUri={draft.imageUri}
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

export default CreatePrintScreen;
