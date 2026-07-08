import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  runOnJS,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CREATE_HOME_EXIT_END } from "../constants/animation";
import { savePaperEntry } from "../data/savePaperEntry";
import BloomBar from "./BloomBar";
import { useEntriesVersion } from "./CreateContext";
import EditablePaper from "./EditablePaper";
import { Icon } from "./Icon";

const CONTROL_ICON_COLOR = "#79716B";
const CONTROL_ICON_SIZE = 24;
// Gutter between the paper's bottom edge and the top of the keyboard when the
// user has scrolled to the very bottom (matches the expanded-entry feel).
const PAPER_BOTTOM_GUTTER = 16;
// Header heights for the two states. The create header (PAPER label + title)
// is taller; the expanded header (back / 1·1 / Prev-Next) is a single row. The
// header box animates between them so the paper rises flush under the expanded
// header on focus (no leftover gap).
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
// Where in the expand transition the header/controls cross-fade completes.
const CHROME_CROSSFADE_END = 0.5;

type CreatePaperScreenProps = {
  progress: SharedValue<number>;
  date: string;
  onClose: () => void;
};

const CreatePaperScreen = ({ progress, date, onClose }: CreatePaperScreenProps) => {
  const insets = useSafeAreaInsets();
  const { bumpEntriesVersion } = useEntriesVersion();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const { width: windowWidth } = useWindowDimensions();

  // The scroll content is sized to the *expanded* artefact (screen - 20px gutter
  // × A4). The EditablePaper sheet itself lays out at the collapsed size and
  // scales up on focus; this wrapper matches the scaled-up visual so the
  // ScrollView's scroll range covers the full expanded sheet (otherwise the
  // sheet's scaled height would exceed its layout box and the bottom would be
  // unreachable behind the keyboard).
  const EXPANDED_WIDTH = windowWidth - 20;
  const EXPANDED_HEIGHT = (EXPANDED_WIDTH * 297) / 210;

  const [title, setTitle] = useState("");
  const [paperText, setPaperText] = useState("");
  const [barOpen, setBarOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // JS mirror of expandProgress > 0.5, used only to flip pointerEvents between
  // the two headers and to disable the collapsed controls (can't be animated).
  const [isExpanded, setIsExpanded] = useState(false);

  const textInputRef = useRef<TextInput>(null);
  // 0 = collapsed (default), 1 = expanded (paper focused). Owned here so the
  // paper scale (EditablePaper), the header cross-fade, and the controls fade
  // all ride one value — the whole chrome transitions together on focus.
  const expandProgress = useSharedValue(0);

  // Mirror expandProgress past the cross-fade midpoint into a JS boolean so we
  // can flip pointerEvents (which can't be animated) on the two headers and the
  // collapsed controls. Only fires on threshold crossings, not every frame.
  useAnimatedReaction(
    () => expandProgress.value,
    (v, prev) => {
      if (prev === null) {
        return;
      }
      if (
        (prev <= CHROME_CROSSFADE_END && v > CHROME_CROSSFADE_END) ||
        (prev > CHROME_CROSSFADE_END && v <= CHROME_CROSSFADE_END)
      ) {
        runOnJS(setIsExpanded)(v > CHROME_CROSSFADE_END);
      }
    },
  );

  // Stage-2 enter: the whole screen (background + content) fades in over the
  // second slice of `progress` ([CREATE_HOME_EXIT_END, 1]). During Stage 1 the
  // root is at opacity 0, so Home's exit animation shows through. Child
  // elements don't need their own opacity fades — they ride the root's — which
  // avoids a compounded (parent × child) fade that would slow/delay content.
  const screenEnterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [CREATE_HOME_EXIT_END, 1], [0, 1], "clamp"),
  }));

  // The paper additionally slides up as it appears. Opacity is left to the root
  // fade above; this style only carries the translate.
  const paperStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(progress.value, [CREATE_HOME_EXIT_END, 1], [40, 0], "clamp"),
      },
    ],
  }));

  // Keyboard avoidance for the paper: animate the ScrollView's bottom content
  // inset to the keyboard height + a small gutter, so the sheet's bottom can
  // scroll to `PAPER_BOTTOM_GUTTER` px above the keyboard (UI-thread, no
  // re-renders). `keyboardHeight` is negative while the keyboard is open (it
  // represents the upward translation), so we negate it back to a positive
  // inset and clamp at 0.
  const scrollAnimatedProps = useAnimatedProps(() => {
    const inset = Math.max(0, -keyboardHeight.value) + PAPER_BOTTOM_GUTTER;
    return {
      contentInset: { bottom: inset },
      scrollIndicatorInsets: { bottom: inset },
    };
  });

  // Header cross-fade + height. The create header (title + PAPER label) fades
  // out and the box shrinks to the single-row expanded header as the paper
  // focuses; the expanded header (back / 1·1 / Prev-Next) fades in. Height is
  // animated so the paper rises flush under the expanded header (no gap).
  const headerHeightStyle = useAnimatedStyle(() => ({
    height: interpolate(
      expandProgress.value,
      [0, 1],
      [CREATE_HEADER_HEIGHT, EXPANDED_HEADER_HEIGHT],
      "clamp",
    ),
  }));
  const createHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0, CHROME_CROSSFADE_END], [1, 0], "clamp"),
  }));
  const expandedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [CHROME_CROSSFADE_END, 1], [0, 1], "clamp"),
  }));

  // Collapsed controls (Cancel / BloomBar / Submit) fade out when the paper is
  // focused — the expanded state shows no floating controls over the paper.
  const controlsFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.value, [0, CHROME_CROSSFADE_END], [1, 0], "clamp"),
  }));
  // Controls lift above the keyboard for the title-focus case (keyboard open,
  // paper not focused). `keyboardHeight` is negative when open, so
  // `translateY: keyboardHeight.value` moves them UP — negating it (the old
  // code) pushed them down off-screen.
  const controlsLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboardHeight.value }],
  }));

  const handleSubmit = useCallback(async () => {
    if (saving) {
      return;
    }

    setSaving(true);

    try {
      await savePaperEntry({
        date,
        title: title.trim() || "Untitled",
        text: paperText,
      });
      bumpEntriesVersion();
      onClose();
    } finally {
      setSaving(false);
    }
  }, [bumpEntriesVersion, date, onClose, paperText, saving, title]);

  const handleBack = useCallback(() => {
    // Back from the expanded header = leave the paper: blur the text input,
    // which fires EditablePaper's onBlur → collapses the sheet (expandProgress
    // → 0) and dismisses the keyboard. The chrome cross-fades back to the
    // create header + controls.
    textInputRef.current?.blur();
  }, []);

  const barMenuNode = (
    <View className="py-2">
      <Text className="px-4 py-3 text-base text-secondary">More options coming soon</Text>
    </View>
  );

  return (
    <Animated.View style={[screenEnterStyle, { flex: 1 }]} className="bg-background">
      <View className="flex-1" style={{ paddingTop: insets.top + 12 }}>
        {/* Header: cross-fade between the create header (PAPER label + title)
            and the expanded header (back / 1·1 / Prev-Next). px-5 aligns header
            content to the 20px gutter; the paper area below is full-width so
            the expanded sheet's 10px gutter matches the expanded entry. */}
        <Animated.View style={headerHeightStyle} className="overflow-hidden">
          <Animated.View
            style={createHeaderStyle}
            className="px-5"
            pointerEvents={isExpanded ? "none" : "auto"}
          >
            <View className="mb-3 flex-row items-center gap-2">
              <View className="h-2.5 w-2.5 rounded-full bg-[#E879F9]" />
              <Text className="font-mono text-xs tracking-widest text-secondary">PAPER</Text>
            </View>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title of entry"
              placeholderTextColor="#79716B"
              className="font-sans-medium text-3xl text-primary"
            />
          </Animated.View>

          {/* Overlay the expanded header so both share the same box; it fades
              in as the create header fades out. Horizontal padding matches the
              paper's 10px gutter; 1/1 is absolutely centered (left/right groups
              have unequal widths, so justify-between alone wouldn't center it);
              Prev-Next gap is 24px. Back arrow reuses arrow-right flipped (no
              arrow-left glyph in the set yet). */}
          <Animated.View
            style={[StyleSheet.absoluteFill, expandedHeaderStyle]}
            pointerEvents={isExpanded ? "auto" : "none"}
          >
            <View
              className="flex-1 flex-row items-center justify-between"
              style={{ paddingHorizontal: 10 }}
            >
              <Pressable
                onPress={handleBack}
                accessibilityRole="button"
                accessibilityLabel="Back to create form"
                hitSlop={8}
              >
                <View style={styles.backIconFlip}>
                  <Icon name="arrow-right" size={24} color={CONTROL_ICON_COLOR} />
                </View>
              </Pressable>
              <View
                style={StyleSheet.absoluteFill}
                className="items-center justify-center"
                pointerEvents="none"
              >
                <Text className="font-mono text-sm text-secondary">1/1</Text>
              </View>
              <View className="flex-row items-center" style={{ gap: 24 }}>
                <Text className="font-sans-medium text-base text-secondary">Prev</Text>
                <Text className="font-sans-medium text-base text-primary">Next</Text>
              </View>
            </View>
          </Animated.View>
        </Animated.View>

        {/* Paper area. Full-width ScrollView (no px-5) so the expanded paper's
            10px gutter matches the expanded entry; the wrapper/sheet handle
            their own gutters. */}
        <Animated.View style={[paperStyle, { flex: 1 }]}>
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
        </Animated.View>
      </View>

      {/* Collapsed controls (Cancel / BloomBar / Submit). Absolutely positioned
          at the bottom; fade out + disable when the paper is focused so the
          expanded state shows no floating controls. Lifts above the keyboard
          for the title-focus case. */}
      <Animated.View
        style={[
          controlsFadeStyle,
          controlsLiftStyle,
          {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: insets.bottom + 20,
          },
        ]}
        className="flex-row items-center justify-between"
        pointerEvents={isExpanded ? "none" : "box-none"}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel create entry"
          className="rounded-full border border-controls-border bg-controls-background p-3"
        >
          <Icon name="x-mark" size={CONTROL_ICON_SIZE} color={CONTROL_ICON_COLOR} />
        </Pressable>

        <BloomBar
          slots={[
            {
              node: (
                <Icon name="line-squiggle" size={CONTROL_ICON_SIZE} color={CONTROL_ICON_COLOR} />
              ),
              onPress: () => {},
              accessibilityLabel: "Drawing tools",
            },
            {
              node: (
                <Icon name="document-plus" size={CONTROL_ICON_SIZE} color={CONTROL_ICON_COLOR} />
              ),
              onPress: () => {},
              accessibilityLabel: "Add page",
            },
            {
              node: (
                <Icon
                  name="ellipsis-horizontal-circle"
                  size={CONTROL_ICON_SIZE}
                  color={CONTROL_ICON_COLOR}
                />
              ),
              accessibilityLabel: "More options",
            },
          ]}
          bloomTriggerIndex={2}
          open={barOpen}
          onOpenChange={setBarOpen}
          panelNode={barMenuNode}
          portalHostName="create"
          originOffset={{ x: insets.left, y: insets.top }}
        />

        <Pressable
          onPress={handleSubmit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save entry"
          className="rounded-full border border-controls-border bg-controls-background p-3"
        >
          {saving ? (
            <ActivityIndicator size="small" color={CONTROL_ICON_COLOR} />
          ) : (
            <Icon name="arrow-right" size={CONTROL_ICON_SIZE} color={CONTROL_ICON_COLOR} />
          )}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Flip arrow-right to point left for the back button (no arrow-left glyph).
  backIconFlip: { transform: [{ scaleX: -1 }] },
});

export default CreatePaperScreen;
