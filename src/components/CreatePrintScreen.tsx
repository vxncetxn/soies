/**
 * CreatePrintScreen — author a multi-artefact Print entry (up to 5).
 *
 * Every page uses the same canonical Print canvas as Home/frame/share. Type
 * delegates its fixed one-line caption policy to the shared native bounded-text
 * engine. Scribble keeps that canvas and coordinate space, while the shared
 * two-phase dismissal hook settles native responders before the Create overlay
 * unmounts.
 */
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import Animated, { type SharedValue } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import type { DraftInk } from "../data/ink";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { savePrintEntry } from "../data/savePrintEntry";
import { useCreateArtefactAuthoring } from "../hooks/useCreateArtefactAuthoring";
import { useCreateEntrySave } from "../hooks/useCreateEntrySave";
import { useCreateScreenDismissal } from "../hooks/useCreateScreenDismissal";
import { usePrintImagePickFlow } from "../hooks/usePrintImagePickFlow";
import { useScribbleSession } from "../hooks/useScribbleSession";
import ArtefactInkCanvas, { type ArtefactInkCanvasHandle } from "./ArtefactInkCanvas";
import CreateArtefactPager from "./CreateArtefactPager";
import { useCreateContext, useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePrint from "./EditablePrint";
import { PRINT_CANVAS_HEIGHT, printCanvasScaleForDisplayWidth } from "./printLayout";
import { PrintMediaBloomPanel } from "./PrintMediaBloomPanel";

const StyledImage = withUniwind(Image);

type DraftPrint = {
  /** Stable page identity for pager refs and Ink ownership. */
  id: string;
  /** Plain caption text; only mutations accepted by the native surface reach this draft. */
  text: string;
  /** Local image URI selected before or during this Create session. */
  imageUri: string;
  /** Unsaved Ink payload owned by the per-page Scribble session. */
  ink: DraftInk | null;
};

type CreatePrintScreenProps = {
  /** Root Create overlay progress supplied by the entry flow. */
  progress: SharedValue<number>;
  /** Entry date persisted unchanged with the completed draft. */
  date: string;
  /** Initial image selected before the Print authoring screen opens. */
  imageUri: string;
  /** Begins root overlay dismissal after native responders settle. */
  onClose: () => void;
};

const CreatePrintScreen = ({ progress, date, imageUri, onClose }: CreatePrintScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { setCreateSessionBusy } = useCreateContext();
  const { width: windowWidth } = useWindowDimensions();
  // Create allocates the final device-sized canonical Print from mount. Default
  // only downscales it, so caption/caret and Ink settle at identity in Type.
  const printExpandedWidth = windowWidth - 20;
  const printPresentationScale = printCanvasScaleForDisplayWidth(printExpandedWidth);
  const printExpandedHeight = PRINT_CANVAS_HEIGHT * printPresentationScale;
  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPrint[]>(() => [
    { id: randomUUID(), text: "", imageUri, ink: null },
  ]);
  const [barOpen, setBarOpen] = useState(false);
  const inkCanvasRefs = useRef<Record<string, ArtefactInkCanvasHandle | null>>({});

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
  } = useCreateArtefactAuthoring();

  const { closing, handleClose } = useCreateScreenDismissal(onClose, prepareForDismiss);

  useEffect(() => {
    syncArtefactCount(artefacts.length);
  }, [artefacts.length, syncArtefactCount]);

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

  const appendPrint = (uri: string) => {
    const item: DraftPrint = {
      id: randomUUID(),
      text: "",
      imageUri: uri,
      ink: null,
    };
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
      handleClose();
    },
  });

  const updateText = (index: number, text: string) => {
    setArtefacts((prev) => prev.map((item, i) => (i === index ? { ...item, text } : item)));
  };

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

  const scribbleTools = renderScribbleTools(scribbleActive);

  return (
    <CreateScreenChrome
      progress={progress}
      expandProgress={expandProgress}
      typeLabel="PRINT"
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
        scrollEnabled={!typeState && !scribbleActive && !saving && !scribbleSaving && !closing}
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
          // Match CreatePaperScreen's top-aligned expanded slot so flex
          // centering and the Type pin cannot open a gap below Scribble chrome.
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
                  editable={!saving && !scribbleSaving && !closing}
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
                      penMinWidth={size.min * printPresentationScale}
                      penMaxWidth={size.max * printPresentationScale}
                      interactionScale={printPresentationScale}
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

export default CreatePrintScreen;
