/**
 * CreateScreenChrome — shared shell for Create Paper / Create Print.
 *
 * Owns the create-screen chrome that both entry types share:
 *   - Stage-2 enter fade (`createProgress`)
 *   - Type label + title field (idle ellipsis / focus wrap + dark blur)
 *   - Header cross-fade between create header and expanded Back · n/N · Prev/Next
 *     (Scribble: Back · Save, no pager nav)
 *   - Bottom Cancel / BloomBar / Submit (fade out when artefact is expanded;
 *     stay put on title focus so the keyboard covers them)
 *   - Scribble tool strip while drawing
 *   - document-plus add via discriminated `addConfig` + max-cap Tooltip
 *
 * The artefact editor (pager + EditablePaper / EditablePrint) is passed as
 * `children` inside the paper-slide region.
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
import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import BloomBar from "./BloomBar";
import { Icon } from "./Icon";
import Tooltip from "./Tooltip";

const CONTROL_ICON_COLOR = "#79716B";
const CONTROL_ICON_SIZE = 24;
const TITLE_FOCUS_BLUR_INTENSITY = 30;
const TITLE_FOCUS_FADE_MS = 180;
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
const CHROME_CROSSFADE_END = 0.5;
const TITLE_FONT_SIZE = 30;
const TITLE_LINE_HEIGHT = 36;

/** Paper: append immediately. Print: open bloom media panel. */
export type CreateAddConfig =
  | { kind: "immediate"; onAdd: () => void }
  | {
      kind: "bloom";
      panel: ReactNode;
      /** Drives BloomBar cross-fade; parent owns pick/alert screen id. */
      contentKey: string | number;
      onOpen?: () => void;
      /** When true, bloom should show the add panel (permission/error reopen). */
      forceAddPanel?: boolean;
      barOpen?: boolean;
      onBarOpenChange?: (open: boolean) => void;
    };

export type CreateScreenChromeProps = {
  progress: SharedValue<number>;
  /** 0 = default, 1 = artefact Type/Scribble — drives header/controls cross-fade. */
  expandProgress: SharedValue<number>;
  typeLabel: "PAPER" | "PRINT";
  title: string;
  onChangeTitle: (title: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  /** Expanded-header Back — blurs Type input or exits Scribble. */
  onBack: () => void;
  /** 0-based active artefact index. */
  activeArtefactIndex: number;
  artefactCount: number;
  onPrevArtefact: () => void;
  onNextArtefact: () => void;
  addConfig: CreateAddConfig;
  /** Enter Scribble from Default (BloomBar squiggle). */
  onEnterScribble: () => void;
  /** When true, expanded header shows Back + Save (no Prev/Next). */
  scribbleActive: boolean;
  onScribbleSave: () => void;
  /** Tool strip rendered above the faded bottom controls while Scribbling. */
  scribbleTools?: ReactNode;
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
  activeArtefactIndex,
  artefactCount,
  onPrevArtefact,
  onNextArtefact,
  addConfig,
  onEnterScribble,
  scribbleActive,
  onScribbleSave,
  scribbleTools,
  children,
}: CreateScreenChromeProps) => {
  const insets = useSafeAreaInsets();
  const createBlurTargetRef = useRef<View>(null);
  const topPad = insets.top + 12;

  const [barOpenInternal, setBarOpenInternal] = useState(false);
  const bloomConfig = addConfig.kind === "bloom" ? addConfig : null;
  const barOpen = bloomConfig?.barOpen ?? barOpenInternal;
  const setBarOpen = bloomConfig?.onBarOpenChange ?? setBarOpenInternal;
  const [barScreen, setBarScreen] = useState<"menu" | "add">("menu");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [maxTooltipVisible, setMaxTooltipVisible] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const titleFocusProgress = useSharedValue(0);

  const atMax = artefactCount >= MAX_ARTEFACTS_PER_ENTRY;
  const canPrev = activeArtefactIndex > 0;
  const canNext = activeArtefactIndex < artefactCount - 1;
  const counterLabel = `${activeArtefactIndex + 1}/${artefactCount}`;

  const showAddBloomPanel =
    bloomConfig != null && (barScreen === "add" || Boolean(bloomConfig.forceAddPanel));

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
    if (saving) {
      return;
    }
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

  const handleDocumentPlus = () => {
    if (saving) {
      return;
    }
    if (atMax) {
      setMaxTooltipVisible(true);
      return;
    }
    if (addConfig.kind === "bloom") {
      setBarScreen("add");
      addConfig.onOpen?.();
      return;
    }
    addConfig.onAdd();
  };

  const barMenuNode = (
    <View className="py-2">
      <Text className="px-4 py-3 text-base text-secondary">More options coming soon</Text>
    </View>
  );

  const panelNode = showAddBloomPanel && bloomConfig ? bloomConfig.panel : barMenuNode;
  const contentKey = showAddBloomPanel && bloomConfig ? bloomConfig.contentKey : barScreen;

  return (
    <Animated.View style={[screenEnterStyle, { flex: 1 }]} className="bg-background">
      <BlurTargetView ref={createBlurTargetRef} style={styles.blurTarget}>
        <View className="flex-1" pointerEvents={saving ? "none" : "auto"}>
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
          pointerEvents={isExpanded || saving ? "none" : "box-none"}
        >
          <Pressable
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Cancel create entry"
            accessibilityState={{ disabled: saving }}
            className="rounded-full border border-controls-border bg-controls-background p-3"
          >
            <Icon name="x-mark" size={CONTROL_ICON_SIZE} color={CONTROL_ICON_COLOR} />
          </Pressable>

          <View className="relative">
            <BloomBar
              slots={[
                {
                  node: (
                    <Icon
                      name="line-squiggle"
                      size={CONTROL_ICON_SIZE}
                      color={CONTROL_ICON_COLOR}
                    />
                  ),
                  onPress: onEnterScribble,
                  accessibilityLabel: "Scribble",
                },
                {
                  node: (
                    <Icon
                      name="document-plus"
                      size={CONTROL_ICON_SIZE}
                      color={CONTROL_ICON_COLOR}
                    />
                  ),
                  onPress: handleDocumentPlus,
                  opensPanel: addConfig.kind === "bloom" && !atMax && !saving,
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
                  onPress: () => setBarScreen("menu"),
                  accessibilityLabel: "More options",
                },
              ]}
              bloomTriggerIndex={2}
              open={barOpen}
              onOpenChange={(open) => {
                if (saving) {
                  return;
                }
                setBarOpen(open);
                if (!open) {
                  setBarScreen("menu");
                }
              }}
              panelNode={panelNode}
              contentKey={contentKey}
              portalHostName="create"
              originOffset={{ x: insets.left, y: insets.top }}
            />
            <Tooltip
              visible={maxTooltipVisible}
              message="Maximum of 5 per entry."
              onDismiss={() => setMaxTooltipVisible(false)}
              style={styles.maxTooltip}
            />
          </View>

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

      {scribbleActive && scribbleTools ? (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: insets.bottom + 20,
          }}
        >
          {scribbleTools}
        </View>
      ) : null}

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
        pointerEvents={saving ? "none" : "box-none"}
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
              editable={!saving}
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
          pointerEvents={isExpanded && !saving ? "auto" : "none"}
        >
          <View
            className="flex-1 flex-row items-center justify-between"
            style={{ paddingHorizontal: 10 }}
          >
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={scribbleActive ? "Back to create form" : "Back to create form"}
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
              <Text className="font-mono text-sm text-secondary">
                {scribbleActive ? "Scribble" : counterLabel}
              </Text>
            </View>
            {scribbleActive ? (
              <Pressable
                onPress={onScribbleSave}
                accessibilityRole="button"
                accessibilityLabel="Save ink"
                hitSlop={8}
              >
                <Text className="font-sans-medium text-base text-primary">Save</Text>
              </Pressable>
            ) : (
              <View className="flex-row items-center" style={{ gap: 24 }}>
                <Pressable
                  onPress={onPrevArtefact}
                  disabled={!canPrev}
                  accessibilityRole="button"
                  accessibilityLabel="Previous artefact"
                  accessibilityState={{ disabled: !canPrev }}
                  hitSlop={8}
                >
                  <Text
                    className={`font-sans-medium text-base ${canPrev ? "text-secondary" : "text-controls-border"}`}
                  >
                    Prev
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onNextArtefact}
                  disabled={!canNext}
                  accessibilityRole="button"
                  accessibilityLabel="Next artefact"
                  accessibilityState={{ disabled: !canNext }}
                  hitSlop={8}
                >
                  <Text
                    className={`font-sans-medium text-base ${canNext ? "text-primary" : "text-controls-border"}`}
                  >
                    Next
                  </Text>
                </Pressable>
              </View>
            )}
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
  maxTooltip: {
    bottom: "100%",
    alignSelf: "center",
    marginBottom: 8,
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
