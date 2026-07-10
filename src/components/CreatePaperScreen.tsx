import { useRef, useState } from "react";
import { TextInput, View, useWindowDimensions } from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
} from "react-native-reanimated";

import { savePaperEntry } from "../data/savePaperEntry";
import { useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePaper from "./EditablePaper";

// Gutter between the paper's bottom edge and the top of the keyboard when the
// user has scrolled to the very bottom (matches the expanded-entry feel).
const PAPER_BOTTOM_GUTTER = 16;

type CreatePaperScreenProps = {
  progress: SharedValue<number>;
  date: string;
  onClose: () => void;
};

const CreatePaperScreen = ({ progress, date, onClose }: CreatePaperScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { width: windowWidth } = useWindowDimensions();

  // The scroll content is sized to the *expanded* artefact (screen - 20px gutter
  // × A4). The EditablePaper sheet itself lays out at the collapsed size and
  // scales up on focus; this wrapper matches the scaled-up visual so the
  // ScrollView's scroll range covers the full expanded sheet.
  const EXPANDED_WIDTH = windowWidth - 20;
  const EXPANDED_HEIGHT = (EXPANDED_WIDTH * 297) / 210;

  const [title, setTitle] = useState("");
  const [paperText, setPaperText] = useState("");
  const [saving, setSaving] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  // 0 = collapsed (default), 1 = expanded (paper focused). Owned here so the
  // paper scale (EditablePaper), the header cross-fade, and the controls fade
  // all ride one value — the whole chrome transitions together on focus.
  const expandProgress = useSharedValue(0);

  // Keyboard avoidance for the paper: animate the ScrollView's bottom content
  // inset to the keyboard height + a small gutter.
  const scrollAnimatedProps = useAnimatedProps(() => {
    const inset = Math.max(0, -keyboardHeight.get()) + PAPER_BOTTOM_GUTTER;
    return {
      contentInset: { bottom: inset },
      scrollIndicatorInsets: { bottom: inset },
    };
  });

  const handleSubmit = async () => {
    if (saving) {
      return;
    }

    // No TryStatement: React Compiler 1.0 cannot lower try/finally, and is
    // limited inside try/catch, under panicThreshold: 'all_errors'. Promise
    // chaining preserves success / error / cleanup without a try block.
    const resolvedTitle = title.trim() || "Untitled";
    setSaving(true);
    await savePaperEntry({
      date,
      title: resolvedTitle,
      text: paperText,
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
    textInputRef.current?.blur();
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
    >
      <Animated.ScrollView
        style={{ flex: 1 }}
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
            value={paperText}
            onChangeText={setPaperText}
            expandProgress={expandProgress}
            textInputRef={textInputRef}
          />
        </View>
      </Animated.ScrollView>
    </CreateScreenChrome>
  );
};

export default CreatePaperScreen;
