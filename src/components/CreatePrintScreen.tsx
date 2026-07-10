import { randomUUID } from "expo-crypto";
/**
 * CreatePrintScreen — author a multi-artefact Print entry (up to 5).
 *
 * Starts with the image from Create Entry. document-plus blooms the shared
 * Print media panel; on successful pick, appends with entrance animation.
 * Type: scroll locked; Prev/Next jumps + focuses caption.
 */
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { type SharedValue } from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { savePrintEntry } from "../data/savePrintEntry";
import { useCreateArtefactAuthoring } from "../hooks/useCreateArtefactAuthoring";
import { useCreateEntrySave } from "../hooks/useCreateEntrySave";
import { usePrintImagePickFlow } from "../hooks/usePrintImagePickFlow";
import CreateArtefactPager from "./CreateArtefactPager";
import { useCreateContext, useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePrint from "./EditablePrint";
import { PrintMediaBloomPanel } from "./PrintMediaBloomPanel";

const StyledImage = withUniwind(Image);

type DraftPrint = { id: string; text: string; imageUri: string };

type CreatePrintScreenProps = {
  progress: SharedValue<number>;
  date: string;
  imageUri: string;
  onClose: () => void;
};

const CreatePrintScreen = ({ progress, date, imageUri, onClose }: CreatePrintScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { setCreateSessionBusy } = useCreateContext();
  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPrint[]>(() => [
    { id: randomUUID(), text: "", imageUri },
  ]);
  const [barOpen, setBarOpen] = useState(false);

  const {
    activeIndex,
    enteringIndex,
    setEnteringIndex,
    typeState,
    expandProgress,
    pagerRef,
    keepExpandedOnBlurRef,
    suppressArtefactFocusRef,
    inputRefs,
    handleActiveIndexChange,
    handlePrev,
    handleNext,
    handleBack,
    tryAppend,
    syncArtefactCount,
  } = useCreateArtefactAuthoring();

  useEffect(() => {
    syncArtefactCount(artefacts.length);
  }, [artefacts.length, syncArtefactCount]);

  const appendPrint = (uri: string) => {
    const item: DraftPrint = { id: randomUUID(), text: "", imageUri: uri };
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
        artefacts: artefacts.map((a) => ({ text: a.text, imageUri: a.imageUri })),
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
      onBack={handleBack}
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
    >
      <CreateArtefactPager
        ref={pagerRef}
        count={artefacts.length}
        pageKeys={artefacts.map((a) => a.id)}
        scrollEnabled={!typeState && !saving}
        showScrollIndicator={!typeState}
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
          return (
            <View className="flex-1 items-center" style={{ overflow: "visible" }}>
              <EditablePrint
                imageUri={draft.imageUri}
                value={draft.text}
                onChangeText={(text) => updateText(index, text)}
                expandProgress={expandProgress}
                keepExpandedOnBlurRef={keepExpandedOnBlurRef}
                suppressArtefactFocusRef={suppressArtefactFocusRef}
                editable={!saving}
                textInputRef={(node) => {
                  inputRefs.current[index] = node;
                }}
              />
            </View>
          );
        }}
      />
    </CreateScreenChrome>
  );
};

export default CreatePrintScreen;
