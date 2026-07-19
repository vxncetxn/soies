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

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("the shared Entry primitive owns full-viewport Ease motion and reduced-motion completion", () => {
  const motion = readSource("src/entry-transition/EntryTransitionMotion.tsx");
  const constants = readSource("src/constants/animation.ts");
  const createContext = readSource("src/components/CreateContext.tsx");
  const createChrome = readSource("src/components/CreateScreenChrome.tsx");
  const dayPager = readSource("src/components/DayPager.tsx");
  const homeChrome = readSource("src/hooks/useHomeChromeFade.ts");

  assert.match(constants, /ENTRY_TRANSITION_DURATION_MS = 350/);
  assert.match(motion, /from "react-native-ease\/uniwind"/);
  assert.match(motion, /translateY: visible \? 0 : viewportHeight/);
  assert.match(motion, /easing: visible \? "easeOut" : "easeIn"/);
  assert.match(motion, /\{ type: "none" \}/);
  assert.doesNotMatch(motion, /useHardwareLayer/);
  assert.match(createChrome, /<EntrySurfaceMotion[\s\S]*?<EntryChromeMotion/);
  assert.match(
    homeChrome,
    /Stack-expansion opacity; Entry navigation owns its separate Ease wrapper/,
  );
  for (const source of [createContext, createChrome, dayPager, homeChrome]) {
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
  assert.match(prepared, /onPrintContentReady: \(\) => onContentReady\(requestId\)/);
  assert.match(collapsed, /onPrintContentReady:/);
  assert.match(collapsed, /onFirstArtefactReady\(firstArtefactReadinessRequestId\)/);
  assert.match(home, /canonicalPreparedEntryNeedsReadiness/);
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
  assert.match(toast, /event\.finished && !cycle\.visible[\s\S]{0,60}onDone\(\)/);
  assert.match(tooltip, /const FADE_MS = 150/);
  assert.match(tooltip, /mounted: visible \|\| display\.mounted/);
  assert.match(tooltip, /!event\.finished \|\| display\.shown/);
  assert.match(tooltip, /mounted: false[\s\S]{0,60}onDismiss\(\)/);
  assert.doesNotMatch(tooltip, /<Pressable onPress=\{onDismiss\}/);
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

test("Create append and title-focus transitions moved only their discrete wrappers", () => {
  const pager = readSource("src/components/CreateArtefactPager.tsx");
  const chrome = readSource("src/components/CreateScreenChrome.tsx");

  assert.match(pager, /<EaseView/);
  assert.match(pager, /duration: 320/);
  assert.match(pager, /easing: EASE_APPENDED_ARTEFACT_CURVE/);
  assert.match(pager, /event\.finished && entering/);
  assert.match(chrome, /const TITLE_FOCUS_FADE_MS = 180/);
  assert.match(chrome, /animate=\{\{ opacity: isTitleFocused \? 1 : 0 \}\}/);
  assert.doesNotMatch(chrome, /titleFocusProgress|withTiming\(isTitleFocused/);
});

test("Focus menu rows preserve the existing stagger while measured morph motion stays Reanimated", () => {
  const focus = readSource("src/components/FocusOverlay.tsx");

  assert.match(focus, /const MENU_ITEM_DURATION_MS = 220/);
  assert.match(focus, /const MENU_CLOSE_DURATION_MS = 150/);
  assert.match(focus, /const MENU_BASE_DELAY_MS = 120/);
  assert.match(focus, /const MENU_STAGGER_MS = 70/);
  assert.match(focus, /<EaseView[\s\S]{0,420}MENU_BASE_DELAY_MS \+ index \* MENU_STAGGER_MS/);
  assert.match(focus, /useSharedValue|withSpring|measure\(/);
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
