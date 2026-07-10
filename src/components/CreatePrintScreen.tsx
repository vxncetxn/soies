/**
 * CreatePrintScreen — author a multi-artefact Print entry (up to 5).
 *
 * Starts with the image from Create Entry. document-plus blooms the shared
 * Print media panel; on successful pick, appends with entrance animation.
 * Type: scroll locked; Prev/Next jumps + focuses caption.
 */
import { Image } from "expo-image";
import { randomUUID } from "expo-crypto";
import { useCallback, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
  useSharedValue,
} from "react-native-reanimated";
import { withUniwind } from "uniwind";

import { savePrintEntry } from "../data/savePrintEntry";
import {
  pickPrintImage,
  type PickPrintImageSource,
} from "../media/pickPrintImage";
import CreateArtefactPager, {
  type CreateArtefactPagerHandle,
} from "./CreateArtefactPager";
import { useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePrint from "./EditablePrint";
import {
  PrintMediaBloomPanel,
  type PrintMediaBloomScreen,
} from "./PrintMediaBloomPanel";

const StyledImage = withUniwind(Image);
const CHROME_CROSSFADE_END = 0.5;

type DraftPrint = { id: string; text: string; imageUri: string };

type CreatePrintScreenProps = {
  progress: SharedValue<number>;
  date: string;
  imageUri: string;
  onClose: () => void;
};

const CreatePrintScreen = ({
  progress,
  date,
  imageUri,
  onClose,
}: CreatePrintScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPrint[]>(() => [
    { id: randomUUID(), text: "", imageUri },
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [enteringIndex, setEnteringIndex] = useState<number | null>(null);
  const [typeState, setTypeState] = useState(false);

  const [mediaScreen, setMediaScreen] = useState<PrintMediaBloomScreen>("media");
  const [permissionSource, setPermissionSource] =
    useState<PickPrintImageSource>("camera");
  const [errorMessage, setErrorMessage] = useState("Couldn’t get that image.");
  const [picking, setPicking] = useState(false);
  const [barOpen, setBarOpen] = useState(false);

  const expandProgress = useSharedValue(0);
  const pagerRef = useRef<CreateArtefactPagerHandle>(null);
  const keepExpandedOnBlurRef = useRef(false);
  const suppressArtefactFocusRef = useRef(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useAnimatedReaction(
    () => expandProgress.get(),
    (v, prev) => {
      if (prev === null) {
        return;
      }
      if (
        (prev <= CHROME_CROSSFADE_END && v > CHROME_CROSSFADE_END) ||
        (prev > CHROME_CROSSFADE_END && v <= CHROME_CROSSFADE_END)
      ) {
        runOnJS(setTypeState)(v > CHROME_CROSSFADE_END);
      }
    },
  );

  const handleActiveIndexChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const focusArtefact = useCallback((index: number) => {
    keepExpandedOnBlurRef.current = true;
    pagerRef.current?.jumpToIndex(index, true);
    setActiveIndex(index);
    inputRefs.current[index]?.focus();
    requestAnimationFrame(() => {
      keepExpandedOnBlurRef.current = false;
    });
  }, []);

  const handlePrev = () => {
    if (activeIndex <= 0) {
      return;
    }
    focusArtefact(activeIndex - 1);
  };

  const handleNext = () => {
    if (activeIndex >= artefacts.length - 1) {
      return;
    }
    focusArtefact(activeIndex + 1);
  };

  const appendPrint = (uri: string) => {
    const nextIndex = artefacts.length;
    setArtefacts((prev) => [...prev, { id: randomUUID(), text: "", imageUri: uri }]);
    setEnteringIndex(nextIndex);
    requestAnimationFrame(() => {
      pagerRef.current?.jumpToIndex(nextIndex, true);
      setActiveIndex(nextIndex);
    });
  };

  const handlePick = async (source: PickPrintImageSource) => {
    if (picking) {
      return;
    }

    // Close bloom before system UI (same as CreateEntryButton).
    setBarOpen(false);
    setPicking(true);
    const result = await pickPrintImage(source)
      .catch(() => ({
        status: "error" as const,
        message: "Couldn’t get that image.",
      }))
      .finally(() => {
        setPicking(false);
      });

    if (result.status === "success") {
      setMediaScreen("media");
      appendPrint(result.uri);
      return;
    }

    if (result.status === "cancelled") {
      setMediaScreen("media");
      return;
    }

    if (result.status === "permission_denied") {
      setPermissionSource(result.source);
      setMediaScreen("permission");
      setBarOpen(true);
      return;
    }

    setErrorMessage(result.message || "Couldn’t get that image.");
    setMediaScreen("error");
    setBarOpen(true);
  };

  const handleSubmit = async () => {
    if (saving || artefacts.length === 0) {
      return;
    }

    const resolvedTitle = title.trim() || "Untitled";
    setSaving(true);
    await savePrintEntry({
      date,
      title: resolvedTitle,
      artefacts: artefacts.map((a) => ({ text: a.text, imageUri: a.imageUri })),
    })
      .then(() => {
        bumpEntriesVersion();
        onClose();
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const handleBack = () => {
    inputRefs.current[activeIndex]?.blur();
  };

  const updateText = (index: number, text: string) => {
    setArtefacts((prev) =>
      prev.map((item, i) => (i === index ? { ...item, text } : item)),
    );
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
      onBackToMedia={() => setMediaScreen("media")}
      onDismiss={() => {
        setMediaScreen("media");
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
      onSubmit={handleSubmit}
      saving={saving}
      onBack={handleBack}
      activeArtefactIndex={activeIndex}
      artefactCount={artefacts.length}
      onPrevArtefact={handlePrev}
      onNextArtefact={handleNext}
      onAddArtefact={() => {}}
      addBloomPanel={addBloomPanel}
      addBloomContentKey={mediaScreen}
      onAddBloomOpen={() => setMediaScreen("media")}
      barOpen={barOpen}
      onBarOpenChange={setBarOpen}
    >
      <CreateArtefactPager
        ref={pagerRef}
        count={artefacts.length}
        pageKeys={artefacts.map((a) => a.id)}
        scrollEnabled={!typeState}
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
