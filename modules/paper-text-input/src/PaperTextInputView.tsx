/**
 * PaperTextInputView — typed React wrapper around the local Expo native view.
 *
 * `requireNativeView` installs Expo's generated props, direct events, and async
 * view functions. The explicit ref cast preserves those native commands for
 * `PaperTextSurface.ios` without exposing the untyped host component elsewhere.
 */
import { requireNativeView } from "expo";
import { forwardRef, type ComponentType, type RefAttributes } from "react";

import type { PaperTextInputViewHandle, PaperTextInputViewProps } from "./PaperTextInput.types";

type NativePaperTextInput = ComponentType<
  PaperTextInputViewProps & RefAttributes<PaperTextInputViewHandle>
>;

/** Resolve once; a missing native registration fails at this narrow integration seam. */
const NativeView = requireNativeView<PaperTextInputViewProps>(
  "PaperTextInput",
) as NativePaperTextInput;

const PaperTextInputView = forwardRef<PaperTextInputViewHandle, PaperTextInputViewProps>(
  function PaperTextInputView(props, ref) {
    return <NativeView ref={ref} {...props} />;
  },
);

export default PaperTextInputView;
