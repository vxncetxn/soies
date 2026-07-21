/**
 * Source-level contracts for native animation ownership and retained exits.
 *
 * Node cannot execute the native Ease driver. These checks protect the seams
 * where an accidental conditional unmount or Reanimated writer would bypass a
 * native completion callback and make the device-only transition unsafe.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearShareActionToast,
  createShareActionToastState,
  showShareActionToast,
} from "../src/share/shareActionToastState.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the shared Entry primitive owns full-viewport Ease motion and reduced-motion completion", () => {
  const motion = readSource("src/entry-transition/EntryTransitionMotion.tsx");
  const constants = readSource("src/constants/animation.ts");
  const createContext = readSource("src/components/CreateContext.tsx");
  const createChrome = readSource("src/components/CreateScreenChrome.tsx");
  const dayPager = readSource("src/components/DayPager.tsx");
  const stackChrome = readSource("src/components/StackChromeMotion.tsx");

  assert.match(constants, /ENTRY_TRANSITION_DURATION_MS = 350/);
  assert.match(motion, /from "react-native-ease\/uniwind"/);
  assert.match(motion, /translateY: visible \? 0 : viewportHeight/);
  assert.match(motion, /easing: visible \? "easeOut" : "easeIn"/);
  assert.match(motion, /EaseMotionCompletionQueue/);
  assert.match(motion, /\{ type: "none" \}/);
  assert.doesNotMatch(motion, /useHardwareLayer/);
  assert.match(createChrome, /<EntrySurfaceMotion[\s\S]*?<EntryChromeMotion/);
  assert.match(createChrome, /<EntrySurfaceMotion[\s\S]{0,240}className="[^"]*bg-background[^"]*"/);
  assert.doesNotMatch(createChrome, /<View style=\{\{ flex: 1 \}\} className="bg-background">/);
  assert.match(stackChrome, /Opacity-only Stack companion/);
  assert.match(stackChrome, /EaseView/);
  assert.match(stackChrome, /stackChromeVisible/);
  for (const source of [createContext, createChrome, dayPager, stackChrome]) {
    assert.doesNotMatch(source, /createProgress|CREATE_HOME_SLIDE_DISTANCE|CREATE_SCREEN_OFFSET/);
  }
});

test("Calendar and Create gate entrance on mounted native content with mount-scoped watchdogs", () => {
  const home = readSource("src/app/index.tsx");
  const overlay = readSource("src/components/CreateOverlay.tsx");
  const paper = readSource("src/components/EditablePaper.tsx");
  const print = readSource("src/components/EditablePrint.tsx");
  const prepared = readSource("src/components/PreparedHomeEntry.tsx");
  const collapsed = readSource("src/components/CollapsedDeck.tsx");
  const printSource = readSource("src/components/Print.tsx");

  assert.match(home, /!targetMounted \|\| targetReady/);
  assert.match(home, /setTimeout\([\s\S]{0,120}targetReady\(requestId\)[\s\S]{0,40}1000/);
  assert.match(home, /onLayout=\{\(\) => \{[\s\S]{0,120}targetMounted/);
  assert.match(overlay, /!entryTransition\.state\.targetMounted/);
  assert.match(overlay, /setTimeout\([\s\S]{0,120}targetReady\(targetRequestId\)[\s\S]{0,40}1000/);
  assert.match(overlay, /onLayout=\{\(\) => \{[\s\S]{0,120}targetMounted/);
  assert.match(paper, /onContentReady=\{onContentReady\}/);
  assert.match(print, /onImageDisplay=\{onImageReady\}/);
  assert.match(print, /onImageError=\{onImageReady\}/);
  assert.match(prepared, /onPaperContentReady: onContentReady/);
  assert.match(prepared, /printContentReadinessRequestId: requestId/);
  assert.match(prepared, /onPrintContentReady: onContentReady/);
  assert.match(collapsed, /printContentReadinessRequestId: firstArtefactReadinessRequestId/);
  assert.match(collapsed, /onPrintContentReady:/);
  assert.match(printSource, /ContentReadinessLatch/);
  assert.match(printSource, /contentReadiness\.request\(imagePath, imageReadinessRequestId\)/);
  assert.match(home, /canonicalPreparedEntryNeedsReadiness/);
  assert.match(home, /calendarAdoptedRequestId !== handoff\.requestId/);
  assert.match(
    home,
    /setTimeout\(\(\) => \{[\s\S]{0,100}setCalendarCanonicalEntryReadyRequestId\(requestId\)[\s\S]{0,40}1000/,
  );
});

test("hardware Back uses the responder-freeze Create dismissal path", () => {
  const overlay = readSource("src/components/CreateOverlay.tsx");
  const paper = readSource("src/components/CreatePaperScreen.tsx");
  const print = readSource("src/components/CreatePrintScreen.tsx");

  assert.doesNotMatch(overlay, /useHardwareBackDismiss/);
  for (const source of [paper, print]) {
    assert.match(source, /useHardwareBackDismiss\(true/);
    assert.match(source, /if \(canDismissFromHardwareBack\)/);
    assert.match(source, /handleClose\("cancel"\)/);
  }
});

test("toast and tooltip stay mounted until their Ease exit completion", () => {
  const toast = readSource("src/share/ShareActionToast.tsx");
  const tooltip = readSource("src/components/Tooltip.tsx");

  for (const source of [toast, tooltip]) {
    assert.match(source, /from "react-native-ease"/);
    assert.match(source, /onTransitionEnd=/);
    assert.match(source, /\{ type: "none" \}/);
    assert.doesNotMatch(source, /react-native-reanimated/);
  }
  assert.match(toast, /const FADE_MS = 220/);
  assert.match(toast, /const RISE_Y = 8/);
  assert.match(toast, /key=\{cycleId\}/);
  assert.match(toast, /event\.finished && !cycle\.visible[\s\S]{0,60}onDone\(cycleId\)/);
  assert.match(tooltip, /const FADE_MS = 150/);
  assert.match(tooltip, /mounted: visible \|\| display\.mounted/);
  assert.match(tooltip, /!event\.finished \|\| display\.shown/);
  assert.match(tooltip, /mounted: false[\s\S]{0,60}onDismiss\(\)/);
  assert.doesNotMatch(tooltip, /<Pressable onPress=\{onDismiss\}/);
});

test("identical consecutive share toasts use distinct cycles and ignore stale exits", () => {
  const initial = createShareActionToastState();
  const first = showShareActionToast(initial, "copy", "Copied");
  const second = showShareActionToast(first, "copy", "Copied");

  assert.notEqual(second.cycleId, first.cycleId);
  assert.equal(clearShareActionToast(second, first.cycleId), second);
  assert.equal(clearShareActionToast(second, second.cycleId).message, null);
});

test("unknown startup Reduce Motion preference disables animation conservatively", () => {
  const reducedMotion = readSource("src/hooks/useReducedMotionPreference.ts");

  assert.match(reducedMotion, /useState<boolean \| null>\(null\)/);
  assert.match(reducedMotion, /return reduceMotionEnabled !== false/);
});

test("Calendar and Featured Widgets retain both phase trees under Ease opacity owners", () => {
  const calendar = readSource("src/components/CalendarSheet.tsx");
  const widgets = readSource("src/widgets/FeaturedWidgetsSheet.tsx");
  const widgetState = readSource("src/widgets/widgetSheetState.ts");

  for (const source of [calendar, widgets]) {
    assert.match(source, /EaseView/);
    assert.match(source, /StyleSheet\.absoluteFill/);
    assert.match(source, /pointerEvents=/);
    assert.match(source, /accessibilityElementsHidden=/);
    assert.match(source, /importantForAccessibility=/);
    assert.match(source, /\{ type: "none" \}/);
  }
  assert.match(calendar, /const TAB_FADE_MS = 160/);
  assert.match(calendar, /easing: EASE_CALENDAR_CURVE/);
  assert.doesNotMatch(calendar, /recentOpacity|monthlyOpacity|tabProgress/);
  assert.match(widgetState, /FEATURED_WIDGET_PHASE_FADE_MS = 200/);
  assert.match(widgets, /session\.phase === "picker" \? 1 : 0/);
  assert.match(widgets, /session\.phase === "featured" \? 1 : 0/);
});

test("Create phase-synchronizes Type and Scribble while keeping Print keyboard geometry local", () => {
  const pager = readSource("src/components/CreateArtefactPager.tsx");
  const chrome = readSource("src/components/CreateScreenChrome.tsx");
  const authoring = readSource("src/hooks/createAuthoringTransition.ts");
  const authoringHook = readSource("src/hooks/useCreateArtefactAuthoring.ts");
  const paper = readSource("src/components/EditablePaper.tsx");
  const print = readSource("src/components/EditablePrint.tsx");
  const paperScreen = readSource("src/components/CreatePaperScreen.tsx");
  const printScreen = readSource("src/components/CreatePrintScreen.tsx");

  assert.match(pager, /<EaseView/);
  assert.match(pager, /duration: 320/);
  assert.match(pager, /easing: EASE_APPENDED_ARTEFACT_CURVE/);
  assert.match(pager, /event\.finished && entering/);
  assert.match(authoring, /"settled"[\s\S]*?"transitioning"[\s\S]*?"dismissing"/);
  assert.match(authoring, /event\.requestId !== state\.requestId/);
  assert.match(authoringHook, /authoringMotionRequestId/);
  assert.doesNotMatch(authoringHook, /SharedValue|useSharedValue|expandProgress/);
  assert.match(chrome, /EaseMotionCompletionQueue<number>/);
  assert.match(chrome, /EASE_CREATE_EXPANSION_SPRING/);
  assert.match(chrome, /authoringPhase === "settled"/);
  assert.match(chrome, /paddingBottom: authoringExpanded \? 0 : AUTHORING_BODY_TRAVEL/);
  assert.match(chrome, /const TITLE_FOCUS_FADE_MS = 180/);
  assert.match(chrome, /animate=\{\{ opacity: isTitleFocused \? 1 : 0 \}\}/);
  assert.doesNotMatch(chrome, /titleFocusProgress|withTiming\(isTitleFocused|expandProgress/);

  for (const source of [paper, print]) {
    assert.match(source, /const scale = expanded \? 1 : collapsedPresentationScale/);
    assert.match(source, /EASE_CREATE_EXPANSION_SPRING/);
    assert.doesNotMatch(source, /expandProgress/);
  }
  assert.match(print, /const geometryProgress = useSharedValue/);
  assert.match(print, /This private companion is used only/);
  for (const screen of [paperScreen, printScreen]) {
    assert.match(screen, /authoringState\.phase === "settled" && scribbleActive/);
  }
});

test("Stack bloom uses phase-synchronized Ease endpoints around continuous paging", () => {
  const stack = readSource("src/components/Stack.tsx");
  const wrapper = readSource("src/components/ArtefactWrapper.tsx");
  const context = readSource("src/components/ExpandContext.tsx");
  const chrome = readSource("src/components/StackChromeMotion.tsx");

  assert.match(stack, /expansion\.phase === "preparing"/);
  assert.match(stack, /scrollEnabled=\{expandedControlsInteractive\}/);
  assert.match(stack, /motionRequestId/);
  assert.match(stack, /EaseMotionCompletionQueue<number>/);
  assert.match(stack, /handlePortalFrameMotionEnd/);
  assert.match(
    stack,
    /<EaseView[\s\S]*?className=\{deckClassName\(entry\.type\)\}[\s\S]*?onTransitionEnd=/,
  );
  assert.doesNotMatch(stack, /withSpring|chromeProgress|progress\.set/);
  assert.match(wrapper, /<Animated\.View[\s\S]*?<EaseView[\s\S]*?<EaseView/);
  assert.match(wrapper, /currentPage\.get\(\)/);
  assert.doesNotMatch(wrapper, /motionRequestId|onMotionEnd|EaseMotionCompletionQueue/);
  assert.doesNotMatch(wrapper, /interpolate|progress\.get\(\)/);
  assert.match(chrome, /EASE_STACK_CHROME_TIMING/);
  assert.match(chrome, /const interactive = state\.phase === "collapsed"/);
  assert.doesNotMatch(context, /SharedValue|useSharedValue|chromeProgress/);
  assert.match(stack, /accessibilityElementsHidden=\{[\s\S]{0,120}"collapsing"/);
});

test("Scribble controls crossfade against the retained Default controls", () => {
  const chrome = readSource("src/components/CreateScreenChrome.tsx");
  const scribbleStart = chrome.indexOf("{scribbleActive && scribbleTools");
  const scribbleLayer = chrome.slice(
    scribbleStart,
    chrome.indexOf("style={StyleSheet.absoluteFill}", scribbleStart),
  );

  assert.match(
    scribbleLayer,
    /<EaseView[\s\S]*?initialAnimate=\{\{ opacity: 0 \}\}[\s\S]*?animate=\{\{ opacity: authoringExpanded \? 1 : 0 \}\}/,
    "Scribble controls must not mount and unmount fully opaque",
  );
});

test("Create title input keeps a stable native responder island during its focus fade", () => {
  const chrome = readSource("src/components/CreateScreenChrome.tsx");
  const titleField = chrome.slice(
    chrome.indexOf("const CreateTitleField"),
    chrome.indexOf("const CreateScreenChrome"),
  );

  assert.match(
    chrome,
    /<CreateTitleField/,
    "the title input must not live in the retargeting Ease header wrapper",
  );
  assert.match(titleField, /=> \(\s*<View/);
  assert.match(
    chrome,
    /<View\s+collapsable=\{false\}\s+style=\{\[\s*styles\.headerOverlay/,
    "the focus-dependent clipping ancestor must not flatten and reparent the native input",
  );
  assert.ok(
    titleField.indexOf("<TextInput") < titleField.indexOf("<EaseView"),
    "Ease must mask the title as a sibling instead of owning its native responder",
  );
});

test("Stack commits its collapsed portal endpoint before beginning expansion", () => {
  const stack = readSource("src/components/Stack.tsx");
  const portalPreparation = stack.slice(
    stack.indexOf("const preparePortal"),
    stack.indexOf("const jumpToArtefact"),
  );

  assert.match(
    portalPreparation,
    /requestAnimationFrame\([\s\S]*?portalReady/,
    "the collapsed Ease endpoint must reach native before the portal targets expanded",
  );
});

test("Stack retains its canonical shell so collapse cannot reflow Home", () => {
  const stack = readSource("src/components/Stack.tsx");

  assert.doesNotMatch(
    stack,
    /\{canonicalDeckVisible \? \(/,
    "the canonical Stack shell must stay in layout while its portal is active",
  );
  assert.match(stack, /opacity: canonicalDeckVisible \? 1 : 0/);
});

test("Stack portal returns to the measured canonical deck origin before handoff", () => {
  const stack = readSource("src/components/Stack.tsx");

  assert.match(stack, /measure\(triggerRef\)/);
  assert.match(stack, /getCollapsedPortalOffset\(triggerLayout, viewport\)/);
  assert.match(stack, /collapsedPortalOffset/);
  assert.match(stack, /translateY: portalExpanded \? 0 : collapsedPortalOffset\.y/);
  assert.match(stack, /expansion\.phase === "preparing"[\s\S]{0,100}type: "none"/);
});

test("Stack measures its collapsed portal endpoint in the visual viewport coordinate space", () => {
  const stack = readSource("src/components/Stack.tsx");
  const measurement = stack.slice(
    stack.indexOf("const measureCollapsedPortalOffset"),
    stack.indexOf("type StackProps"),
  );

  assert.match(stack, /height: screenHeight/);
  assert.doesNotMatch(measurement, /portalLayout\.page[XY]/);
});

test("Stack completion accounts for preparation batches and dropped native callbacks", () => {
  const stack = readSource("src/components/Stack.tsx");

  assert.match(
    stack,
    /portalFrameCompletionQueue\.transition\(portalFrameTarget, motionRequestId\)/,
  );
  assert.match(stack, /STACK_MOTION_WATCHDOG_MS = 1000/);
  assert.match(stack, /portalFrameCompletionQueue\.reset\(portalFrameTarget\)/);
  assert.match(stack, /if \(finished && requestId !== null\)/);
});

test("expanded Stack controls fade with expansion phases instead of portal lifetime", () => {
  const stack = readSource("src/components/Stack.tsx");

  assert.match(stack, /stackExpandedControlsVisible\(expansion\)/);
  assert.match(
    stack,
    /<EaseView\s+initialAnimate=\{\{ opacity: 0 \}\}\s+animate=\{\{ opacity: expandedControlsVisible \? 1 : 0 \}\}\s+transition=\{expandedControlsTransition\}[\s\S]{0,500}<ScrollIndicator/,
  );
});

test("Stack freezes expanded interaction before awaiting collapse geometry", () => {
  const stack = readSource("src/components/Stack.tsx");
  const collapse = stack.slice(
    stack.indexOf("const collapse ="),
    stack.indexOf("const preparePortal"),
  );

  assert.ok(
    collapse.indexOf("setCollapseMeasurementPending(true)") <
      collapse.indexOf("measureCollapsePortal(PORTAL_MEASUREMENT_RETRIES)"),
    "interaction must freeze before the asynchronous UI-thread measurement",
  );
  assert.match(
    stack,
    /const expandedControlsInteractive =[\s\S]{0,160}!collapseMeasurementPending/,
  );
  assert.match(stack, /scrollEnabled=\{expandedControlsInteractive\}/);
  assert.match(stack, /pointerEvents=\{expandedControlsInteractive \? "auto" : "none"\}/);
});

test("Stack never starts portal motion from a missing measurement", () => {
  const stack = readSource("src/components/Stack.tsx");
  const collapseMeasurement = stack.slice(
    stack.indexOf("const measureCollapsePortal"),
    stack.indexOf("const collapse ="),
  );
  const portalPreparation = stack.slice(
    stack.indexOf("const preparePortal"),
    stack.indexOf("const restoreScroll"),
  );

  assert.match(collapseMeasurement, /offset === null[\s\S]*?retriesRemaining > 0/);
  assert.match(
    collapseMeasurement,
    /if \(offset === null\)[\s\S]*?finishCollapseMeasurement\(\);[\s\S]*?return;/,
  );
  assert.ok(
    collapseMeasurement.indexOf("setCollapsedPortalOffset(offset)") <
      collapseMeasurement.indexOf("requestCollapse(entry.id)"),
  );
  assert.match(
    portalPreparation,
    /if \(offset === null\)[\s\S]*?abort\(entry.id, requestId\);[\s\S]*?return;/,
  );
});

test("Focus phase-synchronizes its Ease shell around Reanimated measurement geometry", () => {
  const focus = readSource("src/components/FocusOverlay.tsx");
  const focusTransition = readSource("src/components/focusOverlayTransition.ts");
  const constants = readSource("src/constants/animation.ts");

  assert.match(focus, /const MENU_ITEM_DURATION_MS = 220/);
  assert.match(focus, /const MENU_CLOSE_DURATION_MS = 150/);
  assert.match(focus, /const MENU_BASE_DELAY_MS = 120/);
  assert.match(focus, /const MENU_STAGGER_MS = 70/);
  assert.match(focus, /<EaseView[\s\S]{0,420}MENU_BASE_DELAY_MS \+ index \* MENU_STAGGER_MS/);
  assert.match(focus, /measure\(triggerRef\)/);
  assert.match(focus, /useAnimatedStyle[\s\S]*?origin\.get\(\)\.x/);
  assert.match(focus, /EaseMotionCompletionQueue<FocusShellCompletion>/);
  assert.match(focus, /animate=\{\{ opacity: targetVisible \? 1 : 0 \}\}/);
  assert.match(focusTransition, /"closed" \| "opening" \| "open" \| "closing"/);
  assert.match(focusTransition, /event\.requestId <= state\.latestRequestId/);
  assert.match(constants, /EASE_FOCUS_BACKDROP_TIMING/);
  assert.match(constants, /EASE_FOCUS_CLONE_TIMING/);
  assert.doesNotMatch(focus, /progress|withSpring|interpolate/);
  assert.match(focus, /reduceMotionEnabled[\s\S]{0,60}\{ type: "none" \}/);
});

test("ScrollIndicator retains the Ease scrubber shell until close completion", () => {
  const indicator = readSource("src/components/ScrollIndicator.tsx");
  const constants = readSource("src/constants/animation.ts");
  const collapse = indicator.slice(
    indicator.indexOf("const collapseScrub"),
    indicator.indexOf("const expandScrub"),
  );

  assert.match(indicator, /const \[scrubberMounted, setScrubberMounted\] = useState\(false\)/);
  assert.match(indicator, /from "react-native-ease\/uniwind"/);
  assert.match(indicator, /setScrubberMounted\(true\)[\s\S]{0,60}setExpanded\(true\)/);
  assert.doesNotMatch(collapse, /setScrubberMounted\(false\)/);
  assert.match(indicator, /\{scrubberMounted \? \([\s\S]*?<EaseView/);
  assert.match(indicator, /event\.finished && !expanded[\s\S]{0,60}setScrubberMounted\(false\)/);
  assert.match(indicator, /expanded[\s\S]{0,80}EASE_LEGACY_SPRING[\s\S]{0,80}EASE_DEFAULT_TIMING/);
  assert.match(indicator, /reduceMotionEnabled[\s\S]{0,60}\{ type: "none" \}/);
  assert.match(constants, /damping: 120,[\s\S]{0,60}stiffness: 900,[\s\S]{0,60}mass: 4/);
});
