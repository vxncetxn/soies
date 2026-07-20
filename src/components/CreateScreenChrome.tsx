/**
 * CreateScreenChrome — shared shell for Create Paper / Create Print.
 *
 * Owns the create-screen chrome that both entry types share:
 *   - Entry body surface transition plus opacity-only chrome transition (Ease)
 *   - Type label + title field (idle ellipsis / focus wrap + dark blur)
 *   - Header cross-fade between create header and expanded Back · n/N · Prev/Next
 *     (Scribble: Back · Save, no pager nav)
 *   - Bottom Cancel / BloomBar / Submit (fade out when artefact is expanded;
 *     stay put on title focus so the keyboard covers them)
 *   - Scribble tool strip while drawing
 *   - document-plus add via discriminated `addConfig` + max-cap Tooltip
 *   - Optional Type accessory rendered last in this root stacking context
 *
 * The artefact editor (pager + EditablePaper / EditablePrint) is passed as
 * `children` inside the paper-slide region.
 */
import { BlurTargetView, BlurView } from "expo-blur";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { EaseView } from "react-native-ease/uniwind";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { CreateAuthoringState } from "../hooks/createAuthoringTransition";

import {
  EASE_CREATE_CHROME_TIMING,
  EASE_CREATE_EXPANSION_SPRING,
  EASE_DEFAULT_TIMING,
} from "../constants/animation";
import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import {
  entryChromeVisible,
  entrySurfaceMotion,
  type EntryMotionCompletion,
} from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion, EntrySurfaceMotion } from "../entry-transition/EntryTransitionMotion";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { EaseMotionCompletionQueue } from "../utils/easeMotionCompletion";
import BloomBar from "./BloomBar";
import { Icon } from "./Icon";
import Tooltip from "./Tooltip";

const CONTROL_ICON_COLOR = "#79716B";
const CONTROL_ICON_SIZE = 24;
const TITLE_FOCUS_BLUR_INTENSITY = 30;
const TITLE_FOCUS_FADE_MS = 180;
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
const AUTHORING_BODY_TRAVEL = CREATE_HEADER_HEIGHT - EXPANDED_HEADER_HEIGHT;
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
  authoringExpanded: boolean;
  authoringPhase: CreateAuthoringState["phase"];
  authoringMotionRequestId: number | null;
  onAuthoringMotionEnd: (requestId: number) => void;
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
  /** Type-only keyboard accessory; parent owns whether the node exists. */
  floatingAccessory?: ReactNode;
  children: ReactNode;
};

const CreateScreenChrome = ({
  authoringExpanded,
  authoringPhase,
  authoringMotionRequestId,
  onAuthoringMotionEnd,
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
  floatingAccessory,
  children,
}: CreateScreenChromeProps) => {
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const entryTransition = useEntryTransition();
  const reduceMotionEnabled = useReducedMotionPreference();
  const createBlurTargetRef = useRef<View>(null);
  const topPad = insets.top + 12;

  const [barOpenInternal, setBarOpenInternal] = useState(false);
  const bloomConfig = addConfig.kind === "bloom" ? addConfig : null;
  const barOpen = bloomConfig?.barOpen ?? barOpenInternal;
  const setBarOpen = bloomConfig?.onBarOpenChange ?? setBarOpenInternal;
  const [barScreen, setBarScreen] = useState<"menu" | "add">("menu");
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [maxTooltipVisible, setMaxTooltipVisible] = useState(false);
  const titleInputRef = useRef<TextInput>(null);
  const createBodyMotion = entrySurfaceMotion(entryTransition.state, "create");
  const createChromeIsVisible = entryChromeVisible(entryTransition.state, "create");

  const atMax = artefactCount >= MAX_ARTEFACTS_PER_ENTRY;
  const canPrev = activeArtefactIndex > 0;
  const canNext = activeArtefactIndex < artefactCount - 1;
  const counterLabel = `${activeArtefactIndex + 1}/${artefactCount}`;

  const showAddBloomPanel =
    bloomConfig != null && (barScreen === "add" || Boolean(bloomConfig.forceAddPanel));
  const defaultInteractive = authoringPhase === "settled" && !authoringExpanded;
  const expandedInteractive = authoringPhase === "settled" && authoringExpanded;
  const bodyValues = { translateY: authoringExpanded ? 0 : AUTHORING_BODY_TRAVEL };
  const authoringTarget = authoringExpanded ? "expanded" : "default";
  const [completionQueue] = useState(() => new EaseMotionCompletionQueue<number>(authoringTarget));

  useLayoutEffect(() => {
    completionQueue.transition(authoringTarget, authoringMotionRequestId);
  }, [authoringMotionRequestId, authoringTarget, completionQueue]);

  const handleEntryBodyMotionEnd = (completion: EntryMotionCompletion) => {
    if (completion.kind === "source-exit") {
      entryTransition.sourceExitFinished(completion.requestId);
      return;
    }
    entryTransition.targetEnterFinished(completion.requestId);
    entryTransition.complete(completion.requestId, "create");
  };

  const authoringTransition =
    reduceMotionEnabled || authoringPhase === "dismissing"
      ? ({ type: "none" } as const)
      : EASE_CREATE_EXPANSION_SPRING;
  const chromeTransition =
    reduceMotionEnabled || authoringPhase === "dismissing"
      ? ({ type: "none" } as const)
      : EASE_CREATE_CHROME_TIMING;

  const handleTitleFocus = () => {
    if (saving) {
      return;
    }
    setIsTitleFocused(true);
  };

  const dismissTitleFocus = () => {
    setIsTitleFocused(false);
    titleInputRef.current?.blur();
  };

  const handleTitleBlur = () => {
    setIsTitleFocused(false);
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
    <View style={{ flex: 1 }}>
      <BlurTargetView ref={createBlurTargetRef} style={styles.blurTarget}>
        <View className="flex-1" pointerEvents={saving ? "none" : "auto"}>
          <EntrySurfaceMotion
            className="flex-1 overflow-hidden bg-background"
            visible={createBodyMotion.visible}
            instant={createBodyMotion.instant}
            completion={createBodyMotion.completion}
            viewportHeight={viewportHeight}
            onMotionEnd={handleEntryBodyMotionEnd}
          >
            <View style={{ height: topPad + EXPANDED_HEADER_HEIGHT }} />
            {/* The body keeps expanded layout height so Ease can translate it.
                Default reserves the former 40-point header delta at the bottom,
                preserving pager/indicator geometry at both settled endpoints. */}
            <EaseView
              style={[
                styles.authoringBody,
                { paddingBottom: authoringExpanded ? 0 : AUTHORING_BODY_TRAVEL },
              ]}
              initialAnimate={bodyValues}
              animate={bodyValues}
              transition={authoringTransition}
              onTransitionEnd={(event) => {
                const requestId = completionQueue.finish(event.finished);
                if (requestId !== null) {
                  onAuthoringMotionEnd(requestId);
                }
              }}
            >
              {children}
            </EaseView>
          </EntrySurfaceMotion>
        </View>

        <EntryChromeMotion
          visible={createChromeIsVisible}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <EaseView
            style={[styles.bottomControls, { bottom: insets.bottom + 20 }]}
            initialAnimate={{ opacity: authoringExpanded ? 0 : 1 }}
            animate={{ opacity: authoringExpanded ? 0 : 1 }}
            transition={chromeTransition}
            pointerEvents={defaultInteractive && !saving ? "box-none" : "none"}
            accessibilityElementsHidden={!defaultInteractive}
            importantForAccessibility={defaultInteractive ? "auto" : "no-hide-descendants"}
          >
            <Pressable
              onPress={() => onClose()}
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
                portalHostName="bloom"
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
          </EaseView>
        </EntryChromeMotion>
      </BlurTargetView>

      <EntryChromeMotion
        visible={createChromeIsVisible}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        {scribbleActive && scribbleTools ? (
          <View
            pointerEvents={expandedInteractive ? "box-none" : "none"}
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

        <EaseView
          style={StyleSheet.absoluteFill}
          initialAnimate={{ opacity: 0 }}
          animate={{ opacity: isTitleFocused ? 1 : 0 }}
          transition={
            reduceMotionEnabled
              ? { type: "none" }
              : { ...EASE_DEFAULT_TIMING, duration: TITLE_FOCUS_FADE_MS }
          }
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
        </EaseView>

        <View
          style={[
            styles.headerOverlay,
            { paddingTop: topPad },
            isTitleFocused
              ? undefined
              : { height: topPad + CREATE_HEADER_HEIGHT, overflow: "hidden" },
          ]}
          pointerEvents={saving ? "none" : "box-none"}
        >
          {/* Plate fades in only for Type/expanded — not default, not title-focus. */}
          <EaseView
            pointerEvents="none"
            style={[styles.expandedHeaderPlate, { height: topPad + EXPANDED_HEADER_HEIGHT }]}
            className="bg-background"
            initialAnimate={{ opacity: authoringExpanded ? 1 : 0 }}
            animate={{ opacity: authoringExpanded ? 1 : 0 }}
            transition={chromeTransition}
          />
          <EaseView
            className="px-5"
            initialAnimate={{ opacity: authoringExpanded ? 0 : 1 }}
            animate={{ opacity: authoringExpanded ? 0 : 1 }}
            transition={chromeTransition}
            pointerEvents={defaultInteractive ? "auto" : "none"}
            accessibilityElementsHidden={!defaultInteractive}
            importantForAccessibility={defaultInteractive ? "auto" : "no-hide-descendants"}
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
          </EaseView>

          <EaseView
            style={[styles.expandedHeader, { top: topPad, height: EXPANDED_HEADER_HEIGHT }]}
            initialAnimate={{ opacity: authoringExpanded ? 1 : 0 }}
            animate={{ opacity: authoringExpanded ? 1 : 0 }}
            transition={chromeTransition}
            pointerEvents={expandedInteractive && !saving ? "auto" : "none"}
            accessibilityElementsHidden={!expandedInteractive}
            importantForAccessibility={expandedInteractive ? "auto" : "no-hide-descendants"}
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
          </EaseView>
        </View>

        {/* Rendered after every chrome layer so a keyboard-following accessory
          remains visible above the Paper and headers. Paper mounts this node
          only in Type; it no longer needs an opacity-hidden lifetime workaround
          because Create itself is not a native Portal. */}
        {floatingAccessory ? (
          <View pointerEvents={expandedInteractive ? "box-none" : "none"}>{floatingAccessory}</View>
        ) : null}
      </EntryChromeMotion>
    </View>
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
  },
  expandedHeaderPlate: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  authoringBody: {
    flex: 1,
  },
  bottomControls: {
    position: "absolute",
    left: 20,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
