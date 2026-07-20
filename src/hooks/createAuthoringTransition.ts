export type CreateExpandMode = "default" | "type" | "scribble";

export type CreateAuthoringState =
  | { phase: "settled"; mode: CreateExpandMode; requestId: null }
  | {
      phase: "transitioning";
      fromMode: CreateExpandMode;
      targetMode: CreateExpandMode;
      requestId: number;
    }
  | { phase: "dismissing"; mode: "default"; requestId: null };

export type CreateAuthoringEvent =
  | { type: "requestMode"; mode: CreateExpandMode; requestId: number }
  | { type: "motionFinished"; requestId: number }
  | { type: "dismiss" };

export function createAuthoringState(): CreateAuthoringState {
  return { phase: "settled", mode: "default", requestId: null };
}

export function createAuthoringTargetMode(state: CreateAuthoringState): CreateExpandMode {
  return state.phase === "transitioning" ? state.targetMode : state.mode;
}

export function createAuthoringDisplayMode(state: CreateAuthoringState): CreateExpandMode {
  if (state.phase !== "transitioning") {
    return state.mode;
  }
  return state.targetMode === "default" ? state.fromMode : state.targetMode;
}

export function createAuthoringExpandedTarget(state: CreateAuthoringState): boolean {
  return createAuthoringTargetMode(state) !== "default";
}

export function createAuthoringReducer(
  state: CreateAuthoringState,
  event: CreateAuthoringEvent,
): CreateAuthoringState {
  if (event.type === "dismiss") {
    return { phase: "dismissing", mode: "default", requestId: null };
  }

  if (state.phase === "dismissing") {
    return state;
  }

  if (event.type === "requestMode") {
    const fromMode = state.phase === "settled" ? state.mode : state.targetMode;
    if (fromMode === event.mode) {
      return state;
    }
    return {
      phase: "transitioning",
      fromMode,
      targetMode: event.mode,
      requestId: event.requestId,
    };
  }

  if (state.phase !== "transitioning" || event.requestId !== state.requestId) {
    return state;
  }
  return { phase: "settled", mode: state.targetMode, requestId: null };
}
