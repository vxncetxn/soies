"use strict";

// Public entry point.
//   • `SignatureInk` — recommended. High-level wrapper with a ref-based
//     imperative API (`toBase64`, `undo`, `replay`, …).
//   • `SignatureInkView` — advanced. Raw codegen Fabric component if
//     you prefer to drive props/commands yourself.
export { SignatureInk } from "./SignatureInk.js";
export { default as SignatureInkView } from './SignatureInkViewNativeComponent';
// Toolbar item model + typo-proof id/icon constants and presets.
export { ToolbarAction, ToolbarIcon, DefaultToolbarItems, DEFAULT_TOOLBAR_BUTTONS } from "./toolbar.js";
//# sourceMappingURL=index.js.map