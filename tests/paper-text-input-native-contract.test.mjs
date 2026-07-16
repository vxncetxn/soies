/**
 * Native Paper guardrails that can run in the repository's platform-neutral suite.
 *
 * TextKit geometry itself is verified by the Xcode build and physical-device
 * pass. These source-level assertions protect two easy-to-regress seams that
 * JavaScript tests cannot execute: trailing empty paragraph measurement and
 * precise repair of IME/dictation edits that bypass `shouldChangeTextIn`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const nativeViewSource = readFileSync(
  new URL("../modules/paper-text-input/ios/PaperTextInputView.swift", import.meta.url),
  "utf8",
);
const editablePaperSource = readFileSync(
  new URL("../src/components/EditablePaper.tsx", import.meta.url),
  "utf8",
);
const artefactWrapperSource = readFileSync(
  new URL("../src/components/ArtefactWrapper.tsx", import.meta.url),
  "utf8",
);

test("focused Paper authoring reaches screen space through one identity scale", () => {
  const scaleTransforms = editablePaperSource.match(/transform:\s*\[\s*\{\s*scale:/g) ?? [];

  assert.equal(
    scaleTransforms.length,
    1,
    "nested inverse scales still rasterize the native glyph and caret layers",
  );
  assert.match(
    editablePaperSource,
    /interpolate\([\s\S]*?expandProgress\.get\(\)[\s\S]*?\[0, 1\][\s\S]*?\[collapsedPresentationScale, 1\]/,
  );
});

test("expanded Home artefact text reaches screen space through one device-sized identity scale", () => {
  assert.doesNotMatch(
    artefactWrapperSource,
    /transform:\s*\[\s*\{\s*scale:\s*paperCollapsedScale\s*\}\s*\]/,
    "an inverse child scale can rasterize Paper before the parent enlarges it",
  );
  assert.match(
    artefactWrapperSource,
    /interpolate\([\s\S]*?\[0, 1\][\s\S]*?\[collapsedPresentationScale, 1\]/,
    "Paper and Print must animate from collapsed size to identity at the device's expanded size",
  );
  assert.match(
    artefactWrapperSource,
    /width:\s*EXPANDED_WIDTH/,
    "the backing surface must follow the actual device width, including large iPads",
  );
  assert.match(
    artefactWrapperSource,
    /ArtefactPresentationScaleProvider presentationScale=\{presentationScale\}/,
    "both renderers must receive the same high-resolution presentation scale",
  );
});

test("unknown future artefacts retain the legacy non-text presentation path", () => {
  assert.match(
    artefactWrapperSource,
    /hasCanonicalTextPresentation = type === "paper" \|\| type === "print"/,
  );
  assert.match(
    artefactWrapperSource,
    /hasCanonicalTextPresentation \? \([\s\S]*?<ArtefactPresentationScaleProvider/,
    "the sharp native-text backing must be opt-in for known authored-text types",
  );
});

test("canonical measurement reserves the selected style of a trailing empty paragraph", () => {
  const candidateFits = nativeViewSource.match(
    /private func candidateFits[\s\S]*?(?=\/\*\* Binary-search paste)/,
  );
  assert.ok(candidateFits, "candidateFits implementation must remain discoverable");
  assert.match(candidateFits[0], /document\.text\.hasSuffix\("\\n"\)/);
  assert.match(candidateFits[0], /trailingEmptyParagraphProbe/);
  assert.match(candidateFits[0], /document\.paragraphPresets\.last/);
});

test("delegate-bypass repair preserves accepted text and never trusts length alone", () => {
  const didChange = nativeViewSource.match(
    /func textViewDidChange\(_ textView: UITextView\)[\s\S]*?(?=func textViewDidChangeSelection)/,
  );
  assert.ok(didChange, "textViewDidChange implementation must remain discoverable");
  assert.match(didChange[0], /longestFittingReplacementPrefix/);
  assert.match(didChange[0], /if candidateFits\(candidate\)/);
  assert.doesNotMatch(didChange[0], /isLegacyRecoveryDeletion|isPureDeletion|isShrinking/);
});

test("Paper placeholder is laid out at the canonical text origin, not centered in the page", () => {
  assert.doesNotMatch(
    nativeViewSource,
    /placeholderLabel\.frame = bounds\.insetBy/,
    "a full-page UILabel frame vertically centers its text by default",
  );
  assert.match(nativeViewSource, /placeholderLabel\.sizeThatFits/);
  assert.match(nativeViewSource, /placeholderBounds\.minY/);
});
