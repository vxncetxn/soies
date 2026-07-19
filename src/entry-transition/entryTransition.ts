export type EntryParticipant = "home" | "prepared-home" | "create";
export type EntryTransitionPhase =
  | "idle"
  | "preparing"
  | "exiting"
  | "awaiting-target"
  | "entering"
  | "settling";
export type EntryExitGate = "immediate" | "manual";
export type EntryChromeMode = "fixed" | "crossfade";

export type EntryTransitionState = {
  phase: EntryTransitionPhase;
  requestId: number | null;
  source: EntryParticipant | null;
  target: EntryParticipant | null;
  exitGate: EntryExitGate | null;
  chromeMode: EntryChromeMode | null;
  canonicalParticipant: EntryParticipant;
  targetMounted: boolean;
  targetReady: boolean;
  sourceExitFinished: boolean;
};

export type EntryTransitionEvent =
  | {
      type: "begin";
      requestId: number;
      source: EntryParticipant;
      target: EntryParticipant;
      exitGate: EntryExitGate;
      chromeMode: EntryChromeMode;
    }
  | { type: "allowExit"; requestId: number }
  | { type: "targetMounted"; requestId: number }
  | { type: "targetReady"; requestId: number }
  | { type: "sourceExitFinished"; requestId: number }
  | { type: "targetEnterFinished"; requestId: number }
  | {
      type: "complete";
      requestId: number;
      canonicalParticipant: EntryParticipant;
    }
  | { type: "abort"; requestId: number };

export function createEntryTransitionState(
  canonicalParticipant: EntryParticipant,
): EntryTransitionState {
  return {
    phase: "idle",
    requestId: null,
    source: null,
    target: null,
    exitGate: null,
    chromeMode: null,
    canonicalParticipant,
    targetMounted: false,
    targetReady: false,
    sourceExitFinished: false,
  };
}

export function entrySurfaceMotion(
  state: EntryTransitionState,
  participant: EntryParticipant,
): { visible: boolean; instant: boolean } {
  if (state.phase === "idle") {
    return { visible: state.canonicalParticipant === participant, instant: false };
  }

  // A prepared Home cover stays opaque while the complete canonical Day adopts
  // final geometry behind it. That reset must not create a second visible enter.
  if (participant === "home" && state.target === "prepared-home" && state.phase === "settling") {
    return { visible: true, instant: true };
  }

  if (state.source === participant) {
    return { visible: state.phase === "preparing", instant: false };
  }
  if (state.target === participant) {
    return {
      visible: state.phase === "entering" || state.phase === "settling",
      instant: false,
    };
  }
  return { visible: false, instant: false };
}

export function entryChromeVisible(
  state: EntryTransitionState,
  participant: Exclude<EntryParticipant, "prepared-home">,
): boolean {
  if (state.phase === "idle") {
    return state.canonicalParticipant === participant;
  }
  if (state.chromeMode === "fixed" && participant === "home") {
    return true;
  }

  const targetMatches =
    state.target === participant || (participant === "home" && state.target === "prepared-home");
  if (targetMatches) {
    return state.phase === "entering" || state.phase === "settling";
  }
  return state.source === participant && state.phase === "preparing";
}

export function entryTransitionReducer(
  state: EntryTransitionState,
  event: EntryTransitionEvent,
): EntryTransitionState {
  if (event.type === "begin") {
    return {
      phase: event.exitGate === "manual" ? "preparing" : "exiting",
      requestId: event.requestId,
      source: event.source,
      target: event.target,
      exitGate: event.exitGate,
      chromeMode: event.chromeMode,
      canonicalParticipant: state.canonicalParticipant,
      targetMounted: false,
      targetReady: false,
      sourceExitFinished: false,
    };
  }

  if (event.requestId !== state.requestId || state.phase === "idle") {
    return state;
  }

  switch (event.type) {
    case "allowExit":
      return state.phase === "preparing" && state.exitGate === "manual"
        ? { ...state, phase: "exiting" }
        : state;
    case "targetMounted":
      return state.targetMounted ? state : { ...state, targetMounted: true };
    case "targetReady":
      if (state.targetReady) {
        return state;
      }
      return {
        ...state,
        phase: state.phase === "awaiting-target" ? "entering" : state.phase,
        targetReady: true,
      };
    case "sourceExitFinished":
      if (state.phase !== "exiting") {
        return state;
      }
      return {
        ...state,
        phase: state.targetReady ? "entering" : "awaiting-target",
        sourceExitFinished: true,
      };
    case "targetEnterFinished":
      return state.phase === "entering" ? { ...state, phase: "settling" } : state;
    case "complete":
      return state.phase === "settling"
        ? createEntryTransitionState(event.canonicalParticipant)
        : state;
    case "abort":
      return createEntryTransitionState(state.source ?? state.canonicalParticipant);
  }
}
