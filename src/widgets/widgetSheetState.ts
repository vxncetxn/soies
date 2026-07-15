/**
 * widgetSheetState — pure decisions shared by the native sheet controller.
 *
 * Map:
 * - picker action precedence keeps disabled copy deterministic;
 * - initial/selection transitions preserve one mounted sheet session;
 * - carousel targeting distinguishes a new centering command from rotation;
 * - management controls derive from the currently centered slot binding;
 * - reference controls intentionally return their input unchanged.
 */
import type {
  FeaturedWidgetSlot,
  FeaturedWidgetSlotIndex,
} from "../db/repositories/featuredWidgetSlots";

/** Short enough to read as one body changing content, not two sheets swapping. */
export const FEATURED_WIDGET_PHASE_FADE_MS = 200;

export type PickerActionState = {
  /** Feeds both Pressable interaction and accessibility state. */
  disabled: boolean;
  /** Lets UI copy distinguish duplicate/full/retry conditions. */
  status: "ready" | "busy" | "loading" | "error" | "full" | "duplicate" | "missing";
};

/** Resolve disable reasons in user-action precedence order. */
export function getPickerActionState({
  busy,
  loading,
  loadError,
  isFull,
  alreadyFeatured,
  hasSelection,
}: {
  busy: boolean;
  loading: boolean;
  loadError: boolean;
  isFull: boolean;
  alreadyFeatured: boolean;
  hasSelection: boolean;
}): PickerActionState {
  if (busy) return { disabled: true, status: "busy" };
  if (loading) return { disabled: true, status: "loading" };
  if (loadError) return { disabled: true, status: "error" };
  if (isFull) return { disabled: true, status: "full" };
  if (alreadyFeatured) return { disabled: true, status: "duplicate" };
  if (!hasSelection) return { disabled: true, status: "missing" };
  return { disabled: false, status: "ready" };
}

/** Merge target for the in-place 200 ms picker-to-featured cross-fade. */
export function featuredPhaseForSlot(slotIndex: FeaturedWidgetSlotIndex) {
  return { phase: "featured" as const, centeredSlot: slotIndex };
}

/** Full capacity bypasses the picker before the native sheet is presented. */
export function initialFeaturedWidgetSheetPhase(isFull: boolean): "picker" | "featured" {
  return isFull ? "featured" : "picker";
}

/**
 * A new controller command recentres the carousel. If only its snap geometry
 * changed (for example rotation), retain the page the user actually selected.
 */
export function featuredCarouselTarget({
  previousCenteredSlot,
  centeredSlot,
  selectedSlot,
}: {
  previousCenteredSlot: FeaturedWidgetSlotIndex;
  centeredSlot: FeaturedWidgetSlotIndex;
  selectedSlot: FeaturedWidgetSlotIndex;
}): FeaturedWidgetSlotIndex {
  return previousCenteredSlot === centeredSlot ? selectedSlot : centeredSlot;
}

export type FeaturedWidgetControl = {
  /** User-facing stub label; the selected slot decides which set is visible. */
  label: "Replace" | "Delete" | "Add Artefact";
  /** Existing Soies symbol paired with the action label. */
  icon: "pencil" | "trash" | "plus";
};

const EMPTY_SLOT_CONTROLS: readonly FeaturedWidgetControl[] = [
  { label: "Add Artefact", icon: "plus" },
];
const BOUND_SLOT_CONTROLS: readonly FeaturedWidgetControl[] = [
  { label: "Replace", icon: "pencil" },
  { label: "Delete", icon: "trash" },
];

/**
 * Empty positions can only add; both available and Recently Deleted bindings
 * already reserve an Artefact, so their reference controls remain replace/delete.
 */
export function featuredWidgetControlsForSelection(
  slots: readonly Pick<FeaturedWidgetSlot, "slotIndex" | "state">[],
  selectedSlot: FeaturedWidgetSlotIndex,
): readonly FeaturedWidgetControl[] {
  const state = slots.find((slot) => slot.slotIndex === selectedSlot)?.state ?? "empty";
  return state === "empty" ? EMPTY_SLOT_CONTROLS : BOUND_SLOT_CONTROLS;
}

/**
 * Compute the one native detent shared by both phases. Rotation may change the
 * detent, but a picker-to-featured transition has no phase input and therefore
 * cannot resize the sheet.
 */
export function featuredWidgetSheetGeometry(
  viewportHeight: number,
  topInset: number,
  bottomInset: number,
): { sheetHeight: number; bodyHeight: number } {
  const sheetHeight = Math.max(0, Math.min(720, viewportHeight - topInset - 12));
  return {
    sheetHeight,
    bodyHeight: Math.max(0, sheetHeight - Math.max(bottomInset, 12) - 52),
  };
}

/** Reference controls are enabled but must return the exact state unchanged. */
export function performFeaturedWidgetStubControl<T>(state: T): T {
  return state;
}
