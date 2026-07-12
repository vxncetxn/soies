"use strict";

// Web / non-native fallback. Native platforms resolve to
// `SignatureInkView.native.tsx`, which re-exports the codegen
// component. This stub throws on import so misuse fails loudly
// instead of rendering an empty box.

export function SignatureInkView(_props) {
  throw new Error("'react-native-signature-ink' is only supported on native platforms.");
}
//# sourceMappingURL=SignatureInkView.js.map