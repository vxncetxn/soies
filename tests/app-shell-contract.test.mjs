/**
 * App-shell release contracts that are otherwise only observable through the
 * native Expo Router and Image Picker adapters.
 *
 * The Node suite cannot mount those native adapters, so these checks protect
 * the route/configuration seams that determine the shipped navigator,
 * boundaries, overlay lifetime, and Android recovery behavior.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const rootLayoutUrl = new URL("../src/app/_layout.tsx", import.meta.url);
const homeRouteUrl = new URL("../src/app/index.tsx", import.meta.url);
const legacyTabsLayoutUrl = new URL("../src/app/(tabs)/_layout.tsx", import.meta.url);
const legacyTabsHomeUrl = new URL("../src/app/(tabs)/index.tsx", import.meta.url);
const stackUrl = new URL("../src/components/Stack.tsx", import.meta.url);
const focusOverlayUrl = new URL("../src/components/FocusOverlay.tsx", import.meta.url);
const createOverlayUrl = new URL("../src/components/CreateOverlay.tsx", import.meta.url);
const createPaperUrl = new URL("../src/components/CreatePaperScreen.tsx", import.meta.url);
const createPrintUrl = new URL("../src/components/CreatePrintScreen.tsx", import.meta.url);
const featureBoundaryUrl = new URL("../src/components/feature-error-boundary.tsx", import.meta.url);
const pickerUrl = new URL("../src/media/pickPrintImage.ts", import.meta.url);
const pickerFlowUrl = new URL("../src/hooks/usePrintImagePickFlow.ts", import.meta.url);
const shareContextUrl = new URL("../src/share/ShareContext.tsx", import.meta.url);
const widgetsContextUrl = new URL("../src/widgets/FeaturedWidgetsContext.ios.tsx", import.meta.url);
const appConfigUrl = new URL("../app.json", import.meta.url);

test("Home is the root Stack route and no tab navigator ships", () => {
  assert.equal(existsSync(homeRouteUrl), true);
  assert.equal(existsSync(legacyTabsLayoutUrl), false);
  assert.equal(existsSync(legacyTabsHomeUrl), false);

  const rootLayout = readFileSync(rootLayoutUrl, "utf8");
  const homeRoute = readFileSync(homeRouteUrl, "utf8");
  assert.match(rootLayout, /<Stack\.Screen name="index"/);
  assert.doesNotMatch(rootLayout, /\(tabs\)|TabSlot|TabList|TabTrigger/);
  assert.match(homeRoute, /<ExpandProvider>/);
  assert.match(homeRoute, /<FeaturedArtefactsButton \/>/);
  assert.match(homeRoute, /<CreateEntryButton \/>/);
});

test("root and Home routes expose graceful retry boundaries", () => {
  const rootLayout = readFileSync(rootLayoutUrl, "utf8");
  const homeRoute = readFileSync(homeRouteUrl, "utf8");
  for (const route of [rootLayout, homeRoute]) {
    assert.match(route, /export function ErrorBoundary/);
    assert.match(route, /<AppErrorFallback/);
  }
});

test("Create, Share, and widget surfaces isolate render failures inside their state owners", () => {
  const createOverlay = readFileSync(createOverlayUrl, "utf8");
  const createPaper = readFileSync(createPaperUrl, "utf8");
  const createPrint = readFileSync(createPrintUrl, "utf8");
  const featureBoundary = readFileSync(featureBoundaryUrl, "utf8");
  const shareContext = readFileSync(shareContextUrl, "utf8");
  const widgetsContext = readFileSync(widgetsContextUrl, "utf8");

  assert.doesNotMatch(createOverlay, /FeatureErrorBoundary/);
  for (const screen of [createPaper, createPrint]) {
    assert.match(screen, /<FeatureErrorBoundary[\s\S]*?<CreateScreenChrome/);
    assert.match(screen, /onDismiss=\{saving \|\| scribbleSaving \? undefined : handleClose\}/);
  }
  assert.match(shareContext, /\{session \? \([\s\S]*?<FeatureErrorBoundary[\s\S]*?<ShareSheet/);
  assert.match(featureBoundary, /onDismiss\?: \(\) => void/);
  assert.match(widgetsContext, /<FeatureErrorBoundary[\s\S]*?<FeaturedWidgetsSheet/);
  assert.match(featureBoundary, /componentDidCatch/);
  assert.match(featureBoundary, /onDismiss/);
  assert.match(featureBoundary, /onRetry/);
});

test("Focus stages blur at native foreground scale and releases it after closing", () => {
  const stack = readFileSync(stackUrl, "utf8");
  const focusOverlay = readFileSync(focusOverlayUrl, "utf8");
  const openFocus = stack.match(/const openFocus = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  const cloneStyle =
    focusOverlay.match(
      /const cloneStyle = useAnimatedStyle\(\(\) => \(\{[\s\S]*?\n  \}\)\);/,
    )?.[0] ?? "";

  assert.match(stack, /const \[focusMounted, setFocusMounted\] = useState\(false\)/);
  assert.match(openFocus, /setFocusMounted\(true\)/);
  assert.doesNotMatch(openFocus, /setFocusOpen\(true\)/);
  assert.match(stack, /onNativeReady=\{openMountedFocus\}/);
  assert.match(focusOverlay, /onLayout=\{signalNativeReady\}/);
  assert.match(focusOverlay, /nativeReadySignalledRef\.current/);
  assert.notEqual(cloneStyle, "");
  assert.doesNotMatch(cloneStyle, /\bscale:/);
  assert.match(stack, /const finishFocusClose = \(\) => \{[\s\S]*?setFocusMounted\(false\)/);
  assert.match(stack, /\{focusMounted \? \([\s\S]*?<FocusOverlay/);
});

test("Image Picker avoids read permission and recovers Android pending results", () => {
  const picker = readFileSync(pickerUrl, "utf8");
  const pickerFlow = readFileSync(pickerFlowUrl, "utf8");
  const appConfig = JSON.parse(readFileSync(appConfigUrl, "utf8"));

  assert.doesNotMatch(picker, /requestMediaLibraryPermissionsAsync/);
  assert.match(picker, /ImagePicker\.getPendingResultAsync\(\)/);
  assert.match(pickerFlow, /AppState\.addEventListener/);
  assert.match(pickerFlow, /recoverPendingPrintImage/);

  const android = appConfig.expo.android;
  assert.deepEqual(android.permissions, ["android.permission.CAMERA"]);
  for (const permission of [
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_AUDIO",
    "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
    "android.permission.READ_EXTERNAL_STORAGE",
  ]) {
    assert.ok(android.blockedPermissions.includes(permission));
  }

  const mediaLibraryPlugin = appConfig.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "expo-media-library",
  );
  assert.deepEqual(mediaLibraryPlugin[1].granularPermissions, []);
});
