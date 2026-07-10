/**
 * CreateScreenChrome — shared shell for Create Paper / Create Print.
 *
 * Owns the create-screen chrome that both entry types share:
 *   - Stage-2 enter fade (`createProgress`)
 *   - Type label + title field (idle ellipsis / focus wrap + dark blur)
 *   - Header cross-fade between create header and expanded Back · 1/1 · Prev/Next
 *   - Bottom Cancel / BloomBar / Submit (fade out when artefact is expanded;
 *     stay put on title focus so the keyboard covers them)
 *
 * The artefact editor (EditablePaper / EditablePrint) is passed as `children`
 * inside the paper-slide region. Paper wraps children in a ScrollView itself;
 * Print does not — chrome stays agnostic to that layout difference.
 *
 * Behavior must stay identical to the pre-extract CreatePaperScreen chrome.
 */
import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  runOnJS,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CREATE_HOME_EXIT_END } from "../constants/animation";
import BloomBar from "./BloomBar";
import { Icon } from "./Icon";

const CONTROL_ICON_COLOR = "#79716B";
const CONTROL_ICON_SIZE = 24;
const TITLE_FOCUS_BLUR_INTENSITY = 30;
const TITLE_FOCUS_FADE_MS = 180;
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
const CHROME_CROSSFADE_END = 0.5;
const TITLE_FONT_SIZE = 30;
const TITLE_LINE_HEIGHT = 36;

export type CreateScreenChromeProps = {
  progress: SharedValue<number>;
  /** 0 = default, 1 = artefact Type state — drives header/controls cross-fade. */
  expandProgress: SharedValue<number>;
  typeLabel: "PAPER" | "PRINT";
  title: string;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  /** Expanded-header Back — typically blurs the artefact TextInput. */
  onBack: () => void;
  children: ReactNode;
};

const CreateScreenChrome = ({
  progress,
  expandProgress,
  typeLabel,
  title,
  onChangeTitle,
  onClose,
  onSubmit,
  saving,
  onBack,
  children,
}: CreateScreenChromeProps) => {
  const insets = useSafeAreaInsets();
  const createBlurTargetRef = useRef<View>(null);
  const topPad = insets.top + 12;

  const [barOpen, setBarOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const titleFocusProgress = useSharedValue(0);

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
        runOnJS(setIsExpanded)(v > CHROME_CROSSFADE_END);
      }
    },
  );

  const screenEnterStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [CREATE_HOME_EXIT_END, 1], [0, 1], "clamp"),
  }));

  const paperStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(progress.get(), [CREATE_HOME_EXIT_END, 1], [40, 0], "clamp"),
      },
    ],
  }));

  const headerTotalHeightStyle = useAnimatedStyle(() => ({
    height:
      topPad +
      interpolate(
        expandProgress.get(),
        [0, 1],
        [CREATE_HEADER_HEIGHT, EXPANDED_HEADER_HEIGHT],
        "clamp",
      ),
  }));

  const createHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.get(), [0, CHROME_CROSSFADE_END], [1, 0], "clamp"),
  }));
  const expandedHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.get(), [CHROME_CROSSFADE_END, 1], [0, 1], "clamp"),
  }));
  // Solid plate only in Type/expanded state — covers the artefact under the
  // chrome. Default + title-focus stay transparent so the artefact/blur show
  // through (no gray band over the title-focus frost).
  const headerPlateStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.get(), [0, CHROME_CROSSFADE_END], [0, 1], "clamp"),
  }));

  // Collapsed controls fade out when the artefact is focused. They stay at a
  // fixed bottom inset — the keyboard covers them on title-focus (do not lift).
  const controlsFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expandProgress.get(), [0, CHROME_CROSSFADE_END], [1, 0], "clamp"),
  }));

  const titleFocusBackdropStyle = useAnimatedStyle(() => ({
    opacity: titleFocusProgress.get(),
  }));

  const handleTitleFocus = () => {
    setIsTitleFocused(true);
    titleFocusProgress.set(withTiming(1, { duration: TITLE_FOCUS_FADE_MS }));
  };

  const dismissTitleFocus = () => {
    setIsTitleFocused(false);
    titleFocusProgress.set(withTiming(0, { duration: TITLE_FOCUS_FADE_MS }));
    titleInputRef.current?.blur();
  };

  const handleTitleBlur = () => {
    setIsTitleFocused(false);
    titleFocusProgress.set(withTiming(0, { duration: TITLE_FOCUS_FADE_MS }));
  };

  const handleTitleBackdropPress = () => {
    dismissTitleFocus();
  };

  const barMenuNode = (
    <View className="py-2">
      <Text className="px-4 py-3 text-base text-secondary">More options coming soon</Text>
    </View>
  );

  return (
    <Animated.View style={[screenEnterStyle, { flex: 1 }]} className="bg-background">
      <BlurTargetView ref={createBlurTargetRef} style={styles.blurTarget}>
        <View className="flex-1">
          <Animated.View style={headerTotalHeightStyle} />

          <Animated.View style={[paperStyle, { flex: 1 }]}>{children}</Animated.View>
        </View>

        <Animated.View
          style={[
            controlsFadeStyle,
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
            onPress={onSubmit}
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
            {...(Platform.OS === "android"
              ? {
                  blurTarget: createBlurTargetRef,
                  blurMethod: "dimezisBlurViewSdk31Plus" as const,
                }
              : {})}
            tint="dark"
            intensity={TITLE_FOCUS_BLUR_INTENSITY}
            style={StyleSheet.absoluteFill}
          />
        </Pressable>
      </Animated.View>

      <Animated.View
        style={[
          styles.headerOverlay,
          { paddingTop: topPad },
          isTitleFocused ? undefined : headerTotalHeightStyle,
        ]}
        className={isTitleFocused ? undefined : "overflow-hidden"}
      >
        {/* Plate fades in only for Type/expanded — not default, not title-focus. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, headerPlateStyle]}
          className="bg-background"
        />
        <Animated.View
          style={createHeaderStyle}
          className="px-5"
          pointerEvents={isExpanded ? "none" : "auto"}
        >
          <View className="mb-3 flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-[#E879F9]" />
            <Text className="font-mono text-xs tracking-widest text-secondary">{typeLabel}</Text>
          </View>
          <View>
            <TextInput
              ref={titleInputRef}
              value={title}
              onChangeText={onChangeTitle}
              onFocus={handleTitleFocus}
              onBlur={handleTitleBlur}
              placeholder="Title of entry"
              placeholderTextColor="#79716B"
              multiline
              scrollEnabled={false}
              style={[
                styles.titleInput,
                !isTitleFocused ? styles.titleInputIdle : null,
                {
                  color: isTitleFocused ? "#FFFFFF" : title.length > 0 ? "transparent" : "#79716B",
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

        <Animated.View
          style={[styles.expandedHeader, expandedHeaderStyle, { top: topPad }]}
          pointerEvents={isExpanded ? "auto" : "none"}
        >
          <View
            className="flex-1 flex-row items-center justify-between"
            style={{ paddingHorizontal: 10 }}
          >
            <Pressable
              onPress={onBack}
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
  backIconFlip: { transform: [{ scaleX: -1 }] },
  blurTarget: {
    flex: 1,
  },
  headerOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  expandedHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  titleInput: {
    padding: 0,
    margin: 0,
    fontFamily: "Geist-Medium",
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    textAlignVertical: "center",
  },
  titleInputIdle: {
    maxHeight: TITLE_LINE_HEIGHT,
    overflow: "hidden",
  },
  titleIdleOverlay: {
    ...StyleSheet.absoluteFill,
    fontFamily: "Geist-Medium",
    fontSize: TITLE_FONT_SIZE,
    lineHeight: TITLE_LINE_HEIGHT,
    color: "oklch(14.69% 0.004 49.25)",
  },
});

export default CreateScreenChrome;
