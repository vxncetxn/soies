import type { Transition } from "react-native-ease";

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
import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { EaseView } from "react-native-ease";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

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
import { fixedTokens } from "../styles/tokens";
import { EaseMotionCompletionQueue } from "../utils/easeMotionCompletion";
import BloomBar from "./BloomBar";
import { Icon } from "./Icon";
import Tooltip from "./Tooltip";

const CONTROL_ICON_SIZE = 24;
const TITLE_FOCUS_BLUR_INTENSITY = 30;
const TITLE_FOCUS_FADE_MS = 180;
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;
const AUTHORING_BODY_TRAVEL = CREATE_HEADER_HEIGHT - EXPANDED_HEADER_HEIGHT;

const StyledBlurTargetView = withUnistyles(BlurTargetView);
const StyledEaseView = withUnistyles(EaseView);
const ThemedActivityIndicator = withUnistyles(ActivityIndicator, (theme) => ({
  color: theme.colors.icon.default,
}));
const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));
const ThemedTextInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.content.muted,
}));

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

type CreateTitleFieldProps = {
  authoringExpanded: boolean;
  defaultInteractive: boolean;
  inputRef: RefObject<TextInput | null>;
  isTitleFocused: boolean;
  onBlur: () => void;
  onChangeTitle: (title: string) => void;
  onFocus: () => void;
  saving: boolean;
  title: string;
  transition: Transition;
  typeLabel: CreateScreenChromeProps["typeLabel"];
};

/**
 * Keep the TextInput under a plain native View for its entire focus session.
 * The sibling Ease mask provides the same visual fade without making the
 * native responder a child of a phase-retargeted animation view.
 */
const CreateTitleField = ({
  authoringExpanded,
  defaultInteractive,
  inputRef,
  isTitleFocused,
  onBlur,
  onChangeTitle,
  onFocus,
  saving,
  title,
  transition,
  typeLabel,
}: CreateTitleFieldProps) => (
  <View
    style={styles.titleField}
    pointerEvents={defaultInteractive ? "auto" : "none"}
    accessibilityElementsHidden={!defaultInteractive}
    importantForAccessibility={defaultInteractive ? "auto" : "no-hide-descendants"}
  >
    <View style={styles.typeRow}>
      <View style={styles.typeMarker} />
      <Text style={styles.typeLabel}>{typeLabel}</Text>
    </View>
    <View>
      <ThemedTextInput
        ref={inputRef}
        value={title}
        onChangeText={onChangeTitle}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={!saving}
        placeholder="Title of entry"
        multiline
        scrollEnabled={false}
        style={[
          styles.titleInput,
          !isTitleFocused ? styles.titleInputIdle : null,
          isTitleFocused
            ? styles.titleInputFocused
            : title.length > 0
              ? styles.titleInputHidden
              : styles.titleInputPlaceholder,
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

    <StyledEaseView
      pointerEvents="none"
      style={styles.backgroundMask}
      initialAnimate={{ opacity: authoringExpanded ? 1 : 0 }}
      animate={{ opacity: authoringExpanded ? 1 : 0 }}
      transition={transition}
    />
  </View>
);

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
    <View style={styles.menuPanel}>
      <Text style={[styles.menuRow, styles.menuText]}>More options coming soon</Text>
    </View>
  );

  const panelNode = showAddBloomPanel && bloomConfig ? bloomConfig.panel : barMenuNode;
  const contentKey = showAddBloomPanel && bloomConfig ? bloomConfig.contentKey : barScreen;

  return (
    <View style={styles.flex}>
      <StyledBlurTargetView ref={createBlurTargetRef} style={styles.blurTarget}>
        <View style={styles.flex} pointerEvents={saving ? "none" : "auto"}>
          <EntrySurfaceMotion
            style={styles.entrySurface}
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
            <StyledEaseView
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
            </StyledEaseView>
          </EntrySurfaceMotion>
        </View>

        <EntryChromeMotion
          visible={createChromeIsVisible}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          <StyledEaseView
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
              style={styles.controlButton}
            >
              <ThemedIcon name="x-mark" size={CONTROL_ICON_SIZE} />
            </Pressable>

            <View style={styles.relative}>
              <BloomBar
                slots={[
                  {
                    node: <ThemedIcon name="line-squiggle" size={CONTROL_ICON_SIZE} />,
                    onPress: onEnterScribble,
                    accessibilityLabel: "Scribble",
                  },
                  {
                    node: <ThemedIcon name="document-plus" size={CONTROL_ICON_SIZE} />,
                    onPress: handleDocumentPlus,
                    opensPanel: addConfig.kind === "bloom" && !atMax && !saving,
                    accessibilityLabel: "Add page",
                  },
                  {
                    node: <ThemedIcon name="ellipsis-horizontal-circle" size={CONTROL_ICON_SIZE} />,
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
              style={styles.controlButton}
            >
              {saving ? (
                <ThemedActivityIndicator size="small" />
              ) : (
                <ThemedIcon name="arrow-right" size={CONTROL_ICON_SIZE} />
              )}
            </Pressable>
          </StyledEaseView>
        </EntryChromeMotion>
      </StyledBlurTargetView>

      <EntryChromeMotion
        visible={createChromeIsVisible}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        {scribbleActive && scribbleTools ? (
          <StyledEaseView
            initialAnimate={{ opacity: 0 }}
            animate={{ opacity: authoringExpanded ? 1 : 0 }}
            transition={chromeTransition}
            pointerEvents={expandedInteractive ? "box-none" : "none"}
            style={[styles.scribbleTools, { bottom: insets.bottom + 20 }]}
          >
            {scribbleTools}
          </StyledEaseView>
        ) : null}

        <StyledEaseView
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
        </StyledEaseView>

        {/* Focus removes this header's clipping. Preserve its native identity
          so Fabric cannot flatten/reparent the focused TextInput. */}
        <View
          collapsable={false}
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
          <StyledEaseView
            pointerEvents="none"
            style={[styles.expandedHeaderPlate, { height: topPad + EXPANDED_HEADER_HEIGHT }]}
            initialAnimate={{ opacity: authoringExpanded ? 1 : 0 }}
            animate={{ opacity: authoringExpanded ? 1 : 0 }}
            transition={chromeTransition}
          />
          <CreateTitleField
            authoringExpanded={authoringExpanded}
            defaultInteractive={defaultInteractive}
            inputRef={titleInputRef}
            isTitleFocused={isTitleFocused}
            onBlur={handleTitleBlur}
            onChangeTitle={onChangeTitle}
            onFocus={handleTitleFocus}
            saving={saving}
            title={title}
            transition={chromeTransition}
            typeLabel={typeLabel}
          />

          <StyledEaseView
            style={[styles.expandedHeader, { top: topPad, height: EXPANDED_HEADER_HEIGHT }]}
            initialAnimate={{ opacity: authoringExpanded ? 1 : 0 }}
            animate={{ opacity: authoringExpanded ? 1 : 0 }}
            transition={chromeTransition}
            pointerEvents={expandedInteractive && !saving ? "auto" : "none"}
            accessibilityElementsHidden={!expandedInteractive}
            importantForAccessibility={expandedInteractive ? "auto" : "no-hide-descendants"}
          >
            <View style={styles.expandedHeaderContent}>
              <Pressable
                onPress={onBack}
                accessibilityRole="button"
                accessibilityLabel={scribbleActive ? "Back to create form" : "Back to create form"}
                hitSlop={8}
              >
                <View style={styles.backIconFlip}>
                  <ThemedIcon name="arrow-right" size={24} />
                </View>
              </Pressable>
              <View style={styles.headerCounter} pointerEvents="none">
                <Text style={styles.headerCounterText}>
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
                  <Text style={styles.headerActionPrimary}>Save</Text>
                </Pressable>
              ) : (
                <View style={styles.pagerActions}>
                  <Pressable
                    onPress={onPrevArtefact}
                    disabled={!canPrev}
                    accessibilityRole="button"
                    accessibilityLabel="Previous artefact"
                    accessibilityState={{ disabled: !canPrev }}
                    hitSlop={8}
                  >
                    <Text style={[styles.headerActionSecondary, !canPrev && styles.disabledText]}>
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
                    <Text style={[styles.headerActionPrimary, !canNext && styles.disabledText]}>
                      Next
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          </StyledEaseView>
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

const styles = StyleSheet.create((theme) => ({
  authoringBody: {
    flex: 1,
  },
  backgroundMask: {
    ...StyleSheet.absoluteFill,
    backgroundColor: theme.colors.canvas.app,
  },
  backIconFlip: { transform: [{ scaleX: -1 }] },
  bottomControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 20,
    position: "absolute",
    right: 20,
  },
  blurTarget: {
    flex: 1,
  },
  controlButton: {
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderRadius: 999,
    borderWidth: 1,
    padding: 12,
  },
  disabledText: {
    color: theme.colors.content.disabled,
  },
  entrySurface: {
    backgroundColor: theme.colors.canvas.app,
    flex: 1,
    overflow: "hidden",
  },
  expandedHeader: {
    left: 0,
    position: "absolute",
    right: 0,
  },
  expandedHeaderContent: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  expandedHeaderPlate: {
    backgroundColor: theme.colors.canvas.app,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  flex: {
    flex: 1,
  },
  headerActionPrimary: {
    ...theme.typography.ui.bodyMedium,
    color: theme.colors.content.primary,
  },
  headerActionSecondary: {
    ...theme.typography.ui.bodyMedium,
    color: theme.colors.content.secondary,
  },
  headerCounter: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCounterText: {
    ...theme.typography.ui.label,
    color: theme.colors.content.secondary,
    fontFamily: theme.typography.calendar.year.fontFamily,
  },
  headerOverlay: {
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  maxTooltip: {
    alignSelf: "center",
    bottom: "100%",
    marginBottom: 8,
  },
  menuPanel: {
    paddingVertical: 8,
  },
  menuRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuText: {
    ...theme.typography.ui.body,
    color: theme.colors.content.secondary,
  },
  pagerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 24,
  },
  relative: {
    position: "relative",
  },
  scribbleTools: {
    left: 0,
    position: "absolute",
    right: 0,
  },
  titleField: {
    paddingHorizontal: 20,
  },
  titleInput: {
    ...theme.typography.authoring.title,
    margin: 0,
    padding: 0,
    textAlignVertical: "center",
  },
  titleInputFocused: {
    color: theme.colors.content.onAction,
  },
  titleInputHidden: {
    color: fixedTokens.common.transparent,
  },
  titleInputIdle: {
    maxHeight: theme.typography.authoring.title.lineHeight,
    overflow: "hidden",
  },
  titleInputPlaceholder: {
    color: theme.colors.content.muted,
  },
  titleIdleOverlay: {
    ...StyleSheet.absoluteFill,
    ...theme.typography.authoring.title,
    color: theme.colors.content.primary,
  },
  typeLabel: {
    ...theme.typography.ui.metadataCaps,
    color: theme.colors.content.secondary,
  },
  typeMarker: {
    backgroundColor: fixedTokens.artefactType.printCreate,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  typeRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
}));

export default CreateScreenChrome;
