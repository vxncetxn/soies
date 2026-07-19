export type ShareActionToastAnchor = "copy" | "download" | "instagram" | "facebook" | "others";

export type ShareActionToastState = {
  cycleId: number;
  anchor: ShareActionToastAnchor | null;
  message: string | null;
};

export function createShareActionToastState(): ShareActionToastState {
  return { cycleId: 0, anchor: null, message: null };
}

/** Start a distinct toast even when consecutive actions produce identical text. */
export function showShareActionToast(
  state: ShareActionToastState,
  anchor: ShareActionToastAnchor,
  message: string,
): ShareActionToastState {
  return { cycleId: state.cycleId + 1, anchor, message };
}

/** Ignore an exit callback from a toast that a newer action already replaced. */
export function clearShareActionToast(
  state: ShareActionToastState,
  cycleId: number,
): ShareActionToastState {
  return state.cycleId === cycleId ? { ...state, anchor: null, message: null } : state;
}

/** Hide the toast and invalidate any completion still queued by its native view. */
export function resetShareActionToast(state: ShareActionToastState): ShareActionToastState {
  return { cycleId: state.cycleId + 1, anchor: null, message: null };
}
