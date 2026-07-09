import { BlurTargetView, BlurView } from "expo-blur";
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
  withTiming,
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
// Matches FocusOverlay's dark dim — title-focus reuses the same frosted
// backdrop so the create chrome and the entry long-press overlay feel related.
const TITLE_FOCUS_BLUR_INTENSITY = 30;
// Title-focus blur fades in/out quickly; no spring needed (unlike the paper
// expand morph) because the title itself doesn't move.
const TITLE_FOCUS_FADE_MS = 180;
// Gutter between the paper's bottom edge and the top of the keyboard when the
// user has scrolled to the very bottom (matches the expanded-entry feel).
const PAPER_BOTTOM_GUTTER = 16;
// Header *content* heights (below the top safe-area padding). The create header
// (PAPER label + title) is taller; the expanded header (back / 1·1 / Prev-Next)
// is a single row. The header box animates between them so the paper rises
// flush under the expanded header on paper-focus (no leftover gap). While the
// *title* is focused the fixed height is dropped so a wrapping second line can
// grow the header in place.
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
// Where in the expand transition the header/controls cross-fade completes.
const CHROME_CROSSFADE_END = 0.5;
// text-3xl is 30px / 36px line-height in Tailwind. Matching that keeps the
// caret vertically centered; fontSize === lineHeight (30/30) sat the caret low.
const TITLE_FONT_SIZE = 30;
const TITLE_LINE_HEIGHT = 36;

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
  // Local blur target for the create screen's paper + controls. The create
  // portal sits *outside* the root BlurTargetView in `_layout`, so sampling
  // that would frost Home (behind the portal) instead of this screen. A
  // dedicated target here makes the title-focus dim match the refs.
  const createBlurTargetRef = useRef<View>(null);

  // Top padding above the header content (status bar / dynamic island).
  const topPad = insets.top + 12;

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
  // Title-focus is a separate mode from paper-expand: the keyboard is up for
  // the title, the dark blur dims everything below the header, and the title
  // may wrap to a second line *over* the blur. The in-flow spacer stays at the
  // fixed create-header height so the paper does not jump when the title grows
  // or when multiline layout measures shorter than CREATE_HEADER_HEIGHT.
  // Kept as React state (not a shared value) because it also drives text color,
  // idle maxHeight, and the ellipsis overlay that can't be animated alone.
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  const textInputRef = useRef<TextInput>(null);
  // Title TextInput — blurred by the backdrop Pressable so taps on the frost
  // dismiss title-focus without falling through to EditablePaper.
  const titleInputRef = useRef<TextInput>(null);
  // 0 = collapsed (default), 1 = expanded (paper focused). Owned here so the
  // paper scale (EditablePaper), the header cross-fade, and the controls fade
  // all ride one value — the whole chrome transitions together on focus.
  const expandProgress = useSharedValue(0);
  // 0 = title idle, 1 = title focused. Drives only the blur backdrop opacity;
  // the title itself stays in place (no morph).
  const titleFocusProgress = useSharedValue(0);

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

  // Absolute header + in-flow spacer share this height so the paper sits flush
  // under the header. Includes topPad. Always applied — even while title-focused
  // — so the paper never jumps when the title wraps or when multiline layout
  // measures shorter than CREATE_HEADER_HEIGHT. Extra title lines grow *over*
  // the blur (header is absolute above it), not by pushing the paper down.
  const headerTotalHeightStyle = useAnimatedStyle(() => ({
    height:
      topPad +
      interpolate(
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

  // Title-focus blur: same dark BlurView recipe as FocusOverlay. Fades with
  // titleFocusProgress. When focused the backdrop Pressable intercepts taps
  // (dismisses title without focusing the paper underneath).
  const titleFocusBackdropStyle = useAnimatedStyle(() => ({
    opacity: titleFocusProgress.value,
  }));

  const handleTitleFocus = useCallback(() => {
    setIsTitleFocused(true);
    titleFocusProgress.value = withTiming(1, { duration: TITLE_FOCUS_FADE_MS });
  }, [titleFocusProgress]);

  const dismissTitleFocus = useCallback(() => {
    // Drive overlay state here — don't rely on TextInput onBlur alone. Toggling
    // multiline used to remount the native field and drop focus without firing
    // onBlur, leaving the frost stuck with no keyboard.
    setIsTitleFocused(false);
    titleFocusProgress.value = withTiming(0, { duration: TITLE_FOCUS_FADE_MS });
    titleInputRef.current?.blur();
  }, [titleFocusProgress]);

  const handleTitleBlur = useCallback(() => {
    // Sync overlay if focus was lost without going through dismissTitleFocus
    // (e.g. tapping into EditablePaper). Safe to call repeatedly — state/timing
    // are idempotent when already dismissed.
    setIsTitleFocused(false);
    titleFocusProgress.value = withTiming(0, { duration: TITLE_FOCUS_FADE_MS });
  }, [titleFocusProgress]);

  // Backdrop tap dismisses title-focus via state (not blur()-only), so a
  // stuck overlay after a silent native focus loss still clears.
  const handleTitleBackdropPress = useCallback(() => {
    dismissTitleFocus();
  }, [dismissTitleFocus]);

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

  // Layering for title-focus (bottom → top):
  //   1. Paper + bottom controls inside a local BlurTargetView (dimmed by the blur)
  //   2. Dark BlurView + dismiss Pressable (FocusOverlay recipe) sampling that target
  //   3. Header (PAPER label + title) — stays sharp; may grow over the blur
  // The header is absolute above the blur; an in-flow spacer reserves a *fixed*
  // create-header height so the paper never jumps when the title wraps.
  return (
    <Animated.View style={[screenEnterStyle, { flex: 1 }]} className="bg-background">
      {/* Everything that should frost on title-focus lives inside this target.
          The create portal is outside the root BlurTargetView, so we need a
          local one — otherwise the BlurView would sample Home behind the portal. */}
      <BlurTargetView ref={createBlurTargetRef} style={styles.blurTarget}>
        <View className="flex-1">
          {/* Spacer matching the absolute header's *fixed* create/expanded
              height so the paper sits below it. Never switches to a measured
              wrapping height — that was what made the paper jump on focus. */}
          <Animated.View style={headerTotalHeightStyle} />

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
            for the title-focus case. Sits under the title-focus blur. */}
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
      </BlurTargetView>

      {/* Title-focus blur: above paper + controls, below the header. Same
          BlurView recipe as FocusOverlay. While title-focused the Pressable
          intercepts taps and blurs the title — without this, taps fall through
          to EditablePaper and expand the paper (the old pointerEvents="none"
          path). Idle: pointerEvents none so the frost never blocks paper taps. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, titleFocusBackdropStyle]}
        pointerEvents={isTitleFocused ? "auto" : "none"}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleTitleBackdropPress}
          accessibilityRole="button"
          accessibilityLabel="Dismiss title editing"
        >
          <BlurView
            blurTarget={createBlurTargetRef}
            blurMethod="dimezisBlurViewSdk31Plus"
            tint="dark"
            intensity={TITLE_FOCUS_BLUR_INTENSITY}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      </Animated.View>

      {/* Header sits above the blur so the PAPER label + title stay sharp in
          the same relative position. Absolute so it doesn't participate in
          the paper column's flex (the spacer above reserves its layout height).
          While title-focused the box is content-sized so a wrapping title can
          grow *over* the blur; the spacer below stays fixed so the paper does
          not move. */}
      <Animated.View
        style={[
          styles.headerOverlay,
          { paddingTop: topPad },
          isTitleFocused ? undefined : headerTotalHeightStyle,
        ]}
        className={isTitleFocused ? undefined : "overflow-hidden"}
      >
        <Animated.View
          style={createHeaderStyle}
          className="px-5"
          pointerEvents={isExpanded ? "none" : "auto"}
        >
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-[#E879F9]" />
            <Text className="font-mono text-xs tracking-widest text-secondary">PAPER</Text>
          </View>
          {/* Always-mounted TextInput (padding:0 + shared lineHeight) so focus
              never swaps Text↔TextInput — that swap measured +5px taller
              (29.67 → 34.67) and looked like a downward jump. Idle + non-empty:
              transparent input text under a single-line Text overlay with
              ellipsis (TextInput can't ellipsize on iOS). Idle + empty: native
              placeholder. */}
          <View>
            <TextInput
              ref={titleInputRef}
              value={title}
              onChangeText={setTitle}
              onFocus={handleTitleFocus}
              onBlur={handleTitleBlur}
              placeholder="Title of entry"
              placeholderTextColor="#79716B"
              // Always multiline — toggling this on focus remounts the iOS
              // UITextField/UITextView and drops focus (keyboard flickers up
              // then down; onBlur never fires, so the frost stuck). Idle
              // single-line look comes from maxHeight + the Text overlay.
              multiline
              scrollEnabled={false}
              style={[
                styles.titleInput,
                !isTitleFocused ? styles.titleInputIdle : null,
                {
                  color: isTitleFocused
                    ? "#FFFFFF"
                    : title.length > 0
                      ? "transparent"
                      : "#79716B",
                },
              ]}
            />
            {!isTitleFocused && title.length > 0 ? (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                pointerEvents="none"
                style={styles.titleIdleOverlay}
              >
                {title}
              </Text>
            ) : null}
          </View>
        </Animated.View>

        {/* Overlay the expanded header so both share the same box; it fades
            in as the create header fades out. Horizontal padding matches the
            paper's 10px gutter; 1/1 is absolutely centered (left/right groups
            have unequal widths, so justify-between alone wouldn't center it);
            Prev-Next gap is 24px. Back arrow reuses arrow-right flipped (no
            arrow-left glyph in the set yet). top: topPad so it sits in the
            content band below the safe-area padding (absoluteFill would cover
            the padding region and mis-center the row). */}
        <Animated.View
          style={[styles.expandedHeader, expandedHeaderStyle, { top: topPad }]}
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
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Flip arrow-right to point left for the back button (no arrow-left glyph).
  backIconFlip: { transform: [{ scaleX: -1 }] },
  // Local blur target fills the screen so the title-focus BlurView samples
  // the paper + controls (not Home behind the create portal).
  blurTarget: {
    flex: 1,
  },
  // Header floats above the title-focus blur; left/right stretch to the
  // screen so px-5 gutters match the previous in-flow create header.
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  // Expanded header fills the content band under topPad (not the safe-area
  // padding itself).
  expandedHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Zero padding + text-3xl metrics (30/36) so the caret sits mid-glyph.
  // fontSize === lineHeight (30/30) pushed the caret toward the bottom.
  titleInput: {
    padding: 0,
    margin: 0,
    fontFamily: "Geist-Medium",
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    textAlignVertical: "center",
  },
  // Idle: clip to one line so always-on multiline doesn't grow the slot
  // under the ellipsis overlay (header overflow-hidden is the backstop).
  titleInputIdle: {
    maxHeight: TITLE_LINE_HEIGHT,
    overflow: "hidden",
  },
  // Idle ellipsis overlay sits on top of the transparent TextInput text.
  titleIdleOverlay: {
    ...StyleSheet.absoluteFill,
    fontFamily: "Geist-Medium",
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    color: "oklch(14.69% 0.004 49.25)",
  },
});

export default CreatePaperScreen;
