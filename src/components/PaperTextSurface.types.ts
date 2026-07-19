/**
 * PaperTextSurface contracts shared by the iOS TextKit view and fallbacks.
 *
 * The React boundary exchanges an atomic `PaperDocument`, never independent
 * text and style props. This prevents a render from pairing accepted text with
 * stale paragraph presets. The imperative handle extends the create pager's
 * minimal responder seam only where Paper's keyboard toolbar needs it.
 */
import type { PaperDocument } from "../data/paperDocument";
import type {
  BoundedTextSelectionState,
  BoundedTextSurfaceHandle,
} from "./BoundedTextSurface.types";

export type PaperSelectionState = BoundedTextSelectionState;

export type PaperTextSurfaceHandle = BoundedTextSurfaceHandle;

export type PaperTextSurfaceProps = {
  /** Parent-owned durable document mirrored atomically into the native view. */
  document: PaperDocument;
  /** Receives only text/style states synchronously accepted by TextKit. */
  onChangeDocument?: (document: PaperDocument) => void;
  /** Drives selected/disabled states in the keyboard preset toolbar. */
  onSelectionStateChange?: (state: PaperSelectionState) => void;
  /** Read surfaces omit this; editable surfaces use it to enter Type mode. */
  onFocus?: () => void;
  /** Read surfaces omit this; editable surfaces use it to leave Type mode. */
  onBlur?: () => void;
  /** Fires after the controlled document has entered the platform text layout. */
  onContentReady?: () => void;
  /** False uses the same TextKit renderer without responder/selection behavior. */
  editable?: boolean;
  /** Authoring uses a high-resolution proportional surface; output uses 1. */
  presentationScale?: number;
  /** Empty final output has no placeholder; authoring supplies the Paper prompt. */
  placeholder?: string;
};
