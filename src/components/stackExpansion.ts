export type StackExpansionPhase =
  | "collapsed"
  | "preparing"
  | "expanding"
  | "expanded"
  | "collapsing";

export type StackExpansionState = {
  phase: StackExpansionPhase;
  ownerEntryId: string | null;
  requestId: number | null;
  /** Keeps Home chrome hidden while a widget replaces another portal owner. */
  retainHiddenChrome: boolean;
};

export type StackExpansionEvent =
  | {
      type: "requestExpand";
      entryId: string;
      requestId: number;
      retainHiddenChrome: boolean;
    }
  | { type: "requestCollapse"; entryId: string; requestId: number }
  | { type: "portalReady"; entryId: string; requestId: number }
  | { type: "motionFinished"; requestId: number }
  | { type: "abort"; entryId: string; requestId: number }
  | { type: "ownerUnmounted"; entryId: string };

export function createStackExpansionState(): StackExpansionState {
  return {
    phase: "collapsed",
    ownerEntryId: null,
    requestId: null,
    retainHiddenChrome: false,
  };
}

export function stackChromeVisible(state: StackExpansionState): boolean {
  return (
    state.phase === "collapsed" ||
    state.phase === "collapsing" ||
    (state.phase === "preparing" && !state.retainHiddenChrome)
  );
}

/** Expanded controls crossfade against Home chrome at the animated phases. */
export function stackExpandedControlsVisible(state: StackExpansionState): boolean {
  return state.phase === "expanding" || state.phase === "expanded";
}

export function stackExpansionReducer(
  state: StackExpansionState,
  event: StackExpansionEvent,
): StackExpansionState {
  if (event.type === "requestExpand") {
    if (state.ownerEntryId === event.entryId && state.phase === "collapsing") {
      return {
        ...state,
        phase: "expanding",
        requestId: event.requestId,
        retainHiddenChrome: false,
      };
    }
    return {
      phase: "preparing",
      ownerEntryId: event.entryId,
      requestId: event.requestId,
      retainHiddenChrome: event.retainHiddenChrome,
    };
  }

  if (event.type === "requestCollapse") {
    if (event.entryId !== state.ownerEntryId) {
      return state;
    }
    if (state.phase === "preparing") {
      return createStackExpansionState();
    }
    if (state.phase !== "expanding" && state.phase !== "expanded") {
      return state;
    }
    return {
      ...state,
      phase: "collapsing",
      requestId: event.requestId,
      retainHiddenChrome: false,
    };
  }

  if (event.type === "abort") {
    return event.entryId === state.ownerEntryId && event.requestId === state.requestId
      ? createStackExpansionState()
      : state;
  }

  if (event.type === "ownerUnmounted") {
    return event.entryId === state.ownerEntryId ? createStackExpansionState() : state;
  }

  if (
    event.requestId !== state.requestId ||
    ("entryId" in event && event.entryId !== state.ownerEntryId)
  ) {
    return state;
  }

  if (event.type === "portalReady" && state.phase === "preparing") {
    return { ...state, phase: "expanding", retainHiddenChrome: false };
  }

  if (event.type === "motionFinished" && state.phase === "expanding") {
    return { ...state, phase: "expanded", requestId: null };
  }

  if (event.type === "motionFinished" && state.phase === "collapsing") {
    return createStackExpansionState();
  }

  return state;
}
