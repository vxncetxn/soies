/**
 * Create Paper lifecycle contracts for native responder and Fabric teardown.
 *
 * These source-level checks cover the cross-thread seam that the Node suite
 * cannot execute: a closing portaled screen must first freeze focus-driven
 * mutations while its native TextKit view is still mounted. Keeping the
 * keyboard toolbar structurally stable prevents a blur update and the later
 * portal removal from issuing overlapping child-unmount transactions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const createPaperSource = readFileSync(
  new URL("../src/components/CreatePaperScreen.tsx", import.meta.url),
  "utf8",
);
const authoringSource = readFileSync(
  new URL("../src/hooks/useCreateArtefactAuthoring.ts", import.meta.url),
  "utf8",
);
const createOverlaySource = readFileSync(
  new URL("../src/components/CreateOverlay.tsx", import.meta.url),
  "utf8",
);
const createChromeSource = readFileSync(
  new URL("../src/components/CreateScreenChrome.tsx", import.meta.url),
  "utf8",
);
const rootLayoutSource = readFileSync(new URL("../src/app/_layout.tsx", import.meta.url), "utf8");
const tabsLayoutSource = readFileSync(
  new URL("../src/app/(tabs)/_layout.tsx", import.meta.url),
  "utf8",
);
const toolbarSource = readFileSync(
  new URL("../src/components/PaperTextPresetToolbar.tsx", import.meta.url),
  "utf8",
);
const sharedToolbarSource = readFileSync(
  new URL("../src/components/KeyboardSegmentedToolbar.tsx", import.meta.url),
  "utf8",
);
const dismissalSource = readFileSync(
  new URL("../src/hooks/useCreateScreenDismissal.ts", import.meta.url),
  "utf8",
);

test("Paper dismissal prepares native responders before starting overlay close", () => {
  assert.match(authoringSource, /const prepareForDismiss = useCallback/);
  assert.match(authoringSource, /suppressArtefactFocusRef\.current = true/);
  assert.match(authoringSource, /inputRefs\.current\.forEach/);

  assert.match(createPaperSource, /useCreateScreenDismissal\(onClose, prepareForDismiss\)/);
  const handleClose = dismissalSource.match(
    /const handleClose = useCallback\([\s\S]*?(?=return \{ closing, handleClose \})/,
  );
  assert.ok(handleClose, "the shared Create dismissal hook must own a two-phase close handler");
  assert.match(handleClose[0], /prepareForDismiss\(\)/);
  assert.match(handleClose[0], /requestAnimationFrame/);
  assert.match(handleClose[0], /onClose\(\)/);
});

test("StrictMode effect rehearsal cannot leave Paper authoring permanently dismissing", () => {
  assert.match(
    authoringSource,
    /useEffect\(\s*\(\) => \{[\s\S]*?dismissingRef\.current = false;[\s\S]*?return \(\) => \{[\s\S]*?dismissingRef\.current = true;/,
  );
});

test("Create owns one Fabric hierarchy instead of natively teleporting the complete screen", () => {
  assert.doesNotMatch(createOverlaySource, /from "react-native-teleport"/);
  assert.doesNotMatch(createOverlaySource, /<Portal\b/);
  assert.match(rootLayoutSource, /<CreateProvider>/);
  assert.match(rootLayoutSource, /<CreateOverlay \/>/);
  assert.doesNotMatch(rootLayoutSource, /PortalHost name="create"/);
  assert.doesNotMatch(tabsLayoutSource, /CreateProvider|CreateOverlay/);
  assert.doesNotMatch(createChromeSource, /portalHostName="create"/);
});

test("root Create UI shares the blur-target context without gaining a native wrapper", () => {
  const blurTargetProvider = rootLayoutSource.match(
    /<BlurTargetViewProvider[\s\S]*?<\/BlurTargetViewProvider>/,
  );

  assert.ok(blurTargetProvider, "the root layout must expose the app blur target through context");
  assert.match(blurTargetProvider[0], /<BlurTargetView ref=\{blurTargetRef\}/);
  assert.match(blurTargetProvider[0], /<CreateOverlay \/>/);
  assert.match(blurTargetProvider[0], /<StyledPortalHost name="bloom"/);
});

test("Paper keyboard toolbar mounts visibly in Create chrome's Type-only floating layer", () => {
  assert.match(createChromeSource, /floatingAccessory\?: ReactNode/);
  assert.match(createChromeSource, /\{floatingAccessory\}/);
  assert.match(
    createPaperSource,
    /floatingAccessory=\{\s*typeState && !closing \? \(\s*<PaperTextPresetToolbar/,
  );
  assert.doesNotMatch(toolbarSource, /visible: boolean|styles\.hidden|opacity: 0/);
});

test("Paper keyboard toolbar gives its animated sticky layer non-zero native bounds", () => {
  const stickyLayerStyle = sharedToolbarSource.match(/stickyLayer:\s*\{[\s\S]*?\n\s*\},/);

  assert.match(toolbarSource, /KeyboardSegmentedToolbar/);
  assert.ok(stickyLayerStyle, "the shared keyboard toolbar must define its sticky native layer");
  assert.match(sharedToolbarSource, /const TOOLBAR_HEIGHT = \d+/);
  assert.match(stickyLayerStyle[0], /height: TOOLBAR_HEIGHT/);
});
