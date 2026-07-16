/**
 * Native-module platform guard.
 *
 * Web/Android Paper uses `src/components/PaperTextSurface.tsx` and should never
 * import this host view. Throwing here makes an accidental direct import fail
 * loudly instead of silently producing a non-WYSIWYG empty surface.
 */
import type { PaperTextInputViewProps } from "./PaperTextInput.types";

export default function PaperTextInputView(_props: PaperTextInputViewProps) {
  throw new Error("PaperTextInputView is available only in the native iOS build.");
}
