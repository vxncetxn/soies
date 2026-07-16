/**
 * Cross-language guardrails for Print's bounded caption adapter.
 *
 * UIKit geometry itself is covered by the native build and physical-device
 * pass. These assertions protect the architectural seams that previously let
 * Print use an approximate hidden mirror and post-paint character truncation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editablePrintSource = readFileSync(
  new URL("../src/components/EditablePrint.tsx", import.meta.url),
  "utf8",
);
const printSource = readFileSync(new URL("../src/components/Print.tsx", import.meta.url), "utf8");
const createPrintSource = readFileSync(
  new URL("../src/components/CreatePrintScreen.tsx", import.meta.url),
  "utf8",
);
const printCaptionSource = readFileSync(
  new URL("../src/components/PrintCaptionSurface.tsx", import.meta.url),
  "utf8",
);
const paperTextSource = readFileSync(
  new URL("../src/components/PaperTextSurface.tsx", import.meta.url),
  "utf8",
);
const boundedIosSource = readFileSync(
  new URL("../src/components/BoundedTextSurface.ios.tsx", import.meta.url),
  "utf8",
);
const boundedFallbackSource = readFileSync(
  new URL("../src/components/BoundedTextSurface.tsx", import.meta.url),
  "utf8",
);
const nativeViewSource = readFileSync(
  new URL("../modules/paper-text-input/ios/PaperTextInputView.swift", import.meta.url),
  "utf8",
);

test("Print read and edit surfaces share the bounded native caption adapter", () => {
  assert.match(editablePrintSource, /PrintCaptionSurface/);
  assert.match(printSource, /PrintCaptionSurface/);
  assert.doesNotMatch(editablePrintSource, /onTextLayout|maxLength|PRINT_TEXT_HARD_LIMIT/);
  assert.match(
    editablePrintSource,
    /inkOverlayPath=\{scribbleActive \? undefined/,
    "the committed Ink cache must not double-render beneath the live Scribble canvas",
  );
});

test("Print has one fixed one-line policy with no authoring experiment state", () => {
  assert.match(printCaptionSource, /maximumVisibleLines:\s*PRINT_MAX_CAPTION_LINES/);
  assert.doesNotMatch(createPrintSource, /lineLimit|PrintCaptionLineToolbar/);
  assert.doesNotMatch(nativeViewSource, /trySetMaximumVisibleLines|onPaperLineLimitStateChange/);
});

test("Print center-aligns its caption without changing Paper's natural writing direction", () => {
  assert.match(printCaptionSource, /horizontalAlignment:\s*"center"/);
  assert.match(paperTextSource, /horizontalAlignment:\s*"natural"/);
  assert.match(boundedIosSource, /horizontalTextAlignment=\{configuration\.horizontalAlignment\}/);
  assert.match(nativeViewSource, /paragraph\.alignment = horizontalTextAlignment/);
  assert.match(nativeViewSource, /placeholderLabel\.textAlignment = horizontalTextAlignment/);
  assert.match(
    boundedFallbackSource,
    /configuration\.horizontalAlignment === "center" \? "center" : "auto"/,
  );
});

test("Print vertically centers the live native text block without a rasterizing transform", () => {
  assert.match(printCaptionSource, /verticalAlignment:\s*"center"/);
  assert.match(nativeViewSource, /centersTextVertically/);
  assert.match(nativeViewSource, /private func displayedTextBlockHeight/);
  assert.match(nativeViewSource, /private func verticalTextOffset/);
  assert.match(nativeViewSource, /height: bounds\.height \+ verticalOffset/);
  assert.match(nativeViewSource, /top: padding \+ verticalOffset/);
  assert.doesNotMatch(nativeViewSource, /textView\.transform\s*=/);
});
