export type FocusOverlayTransitionState = {
  phase: "closed" | "opening" | "open" | "closing";
  requestId: number | null;
  /** Rejects an older UI-thread measurement that returns after a newer target. */
  latestRequestId: number;
};

export type FocusOverlayTransitionEvent =
  | { type: "request"; target: "open" | "closed"; requestId: number }
  | { type: "motionFinished"; requestId: number };

export function focusOverlayTransitionState(): FocusOverlayTransitionState {
  return { phase: "closed", requestId: null, latestRequestId: 0 };
}

export function focusOverlayTargetVisible(state: FocusOverlayTransitionState): boolean {
  return state.phase === "opening" || state.phase === "open";
}

export function focusOverlayTransitionReducer(
  state: FocusOverlayTransitionState,
  event: FocusOverlayTransitionEvent,
): FocusOverlayTransitionState {
  if (event.type === "request") {
    if (event.requestId <= state.latestRequestId) {
      return state;
    }

    if (event.target === "open") {
      return state.phase === "open"
        ? { phase: "open", requestId: null, latestRequestId: event.requestId }
        : { phase: "opening", requestId: event.requestId, latestRequestId: event.requestId };
    }

    return state.phase === "closed"
      ? { phase: "closed", requestId: null, latestRequestId: event.requestId }
      : { phase: "closing", requestId: event.requestId, latestRequestId: event.requestId };
  }

  if (state.requestId !== event.requestId) {
    return state;
  }

  return state.phase === "opening"
    ? { phase: "open", requestId: null, latestRequestId: state.latestRequestId }
    : state.phase === "closing"
      ? { phase: "closed", requestId: null, latestRequestId: state.latestRequestId }
      : state;
}
