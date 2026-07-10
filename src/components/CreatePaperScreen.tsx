/**
 * CreatePaperScreen — author a multi-artefact Paper entry (up to 5 pages).
 *
 * Default: horizontal CreateArtefactPager + ScrollIndicator.
 * Type: scroll locked; Prev/Next jumps + focuses the target TextInput.
 * document-plus appends a blank page with entrance animation (no auto-focus).
 */
import { randomUUID } from "expo-crypto";
import { useCallback, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  runOnJS,
} from "react-native-reanimated";

import { savePaperEntry } from "../data/savePaperEntry";
import CreateArtefactPager, {
  type CreateArtefactPagerHandle,
} from "./CreateArtefactPager";
import { useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePaper from "./EditablePaper";

const PAPER_BOTTOM_GUTTER = 16;
const CHROME_CROSSFADE_END = 0.5;

type DraftPaper = { id: string; text: string };

type CreatePaperScreenProps = {
  progress: SharedValue<number>;
  date: string;
  onClose: () => void;
};

const CreatePaperScreen = ({ progress, date, onClose }: CreatePaperScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { width: windowWidth } = useWindowDimensions();

  const EXPANDED_WIDTH = windowWidth - 20;
  const EXPANDED_HEIGHT = (EXPANDED_WIDTH * 297) / 210;

  const [title, setTitle] = useState("");
  const [artefacts, setArtefacts] = useState<DraftPaper[]>(() => [
    { id: randomUUID(), text: "" },
  ]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [enteringIndex, setEnteringIndex] = useState<number | null>(null);
  const [typeState, setTypeState] = useState(false);

  const expandProgress = useSharedValue(0);
  const pagerRef = useRef<CreateArtefactPagerHandle>(null);
  const keepExpandedOnBlurRef = useRef(false);
  const suppressArtefactFocusRef = useRef(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const scrollRefs = useRef<(ScrollView | null)[]>([]);

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

  const scrollAnimatedProps = useAnimatedProps(() => {
    const inset = Math.max(0, -keyboardHeight.get()) + PAPER_BOTTOM_GUTTER;
    return {
      contentInset: { bottom: inset },
      scrollIndicatorInsets: { bottom: inset },
    };
  });

  const resetVerticalScroll = useCallback((index: number) => {
    scrollRefs.current[index]?.scrollTo({ y: 0, animated: false });
  }, []);

  const handleActiveIndexChange = useCallback(
    (index: number) => {
      setActiveIndex(index);
      resetVerticalScroll(index);
    },
    [resetVerticalScroll],
  );

  const focusArtefact = useCallback((index: number) => {
    keepExpandedOnBlurRef.current = true;
    pagerRef.current?.jumpToIndex(index, true);
    setActiveIndex(index);
    resetVerticalScroll(index);
    inputRefs.current[index]?.focus();
    requestAnimationFrame(() => {
      keepExpandedOnBlurRef.current = false;
    });
  }, [resetVerticalScroll]);

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

  const handleAddArtefact = () => {
    const nextIndex = artefacts.length;
    setArtefacts((prev) => [...prev, { id: randomUUID(), text: "" }]);
    setEnteringIndex(nextIndex);
    requestAnimationFrame(() => {
      pagerRef.current?.jumpToIndex(nextIndex, true);
      setActiveIndex(nextIndex);
      resetVerticalScroll(nextIndex);
    });
  };

  const handleSubmit = async () => {
    if (saving) {
      return;
    }

    const resolvedTitle = title.trim() || "Untitled";
    setSaving(true);
    await savePaperEntry({
      date,
      title: resolvedTitle,
      artefacts: artefacts.map((a) => ({ text: a.text })),
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

  return (
    <CreateScreenChrome
      progress={progress}
      expandProgress={expandProgress}
      typeLabel="PAPER"
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
      onAddArtefact={handleAddArtefact}
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
          return (
            <Animated.ScrollView
              ref={(node: ScrollView | null) => {
                scrollRefs.current[index] = node;
              }}
              style={{ flex: 1, width: EXPANDED_WIDTH }}
              contentContainerStyle={{ alignItems: "center" }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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
                  textInputRef={(node) => {
                    inputRefs.current[index] = node;
                  }}
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
