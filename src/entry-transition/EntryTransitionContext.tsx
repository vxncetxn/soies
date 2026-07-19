import { createContext, type PropsWithChildren, useContext, useReducer, useRef } from "react";

import {
  createEntryTransitionState,
  entryTransitionReducer,
  type EntryChromeMode,
  type EntryExitGate,
  type EntryParticipant,
  type EntryTransitionState,
} from "./entryTransition";

type EntryTransitionContextValue = {
  state: EntryTransitionState;
  begin: (
    source: EntryParticipant,
    target: EntryParticipant,
    exitGate: EntryExitGate,
    chromeMode: EntryChromeMode,
  ) => number;
  allowExit: (requestId: number) => void;
  targetMounted: (requestId: number) => void;
  targetReady: (requestId: number) => void;
  sourceExitFinished: (requestId: number) => void;
  targetEnterFinished: (requestId: number) => void;
  complete: (requestId: number, canonicalParticipant: EntryParticipant) => void;
  abort: (requestId: number) => void;
};

const EntryTransitionContext = createContext<EntryTransitionContextValue | null>(null);

export function EntryTransitionProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(entryTransitionReducer, "home", createEntryTransitionState);
  // Request identity must remain monotonic even when a newer begin supersedes an
  // active session. A ref is the correctness seam; it is not a render cache.
  const nextRequestIdRef = useRef(0);

  const begin: EntryTransitionContextValue["begin"] = (source, target, exitGate, chromeMode) => {
    const requestId = nextRequestIdRef.current + 1;
    nextRequestIdRef.current = requestId;
    dispatch({ type: "begin", requestId, source, target, exitGate, chromeMode });
    return requestId;
  };

  return (
    <EntryTransitionContext.Provider
      value={{
        state,
        begin,
        allowExit: (requestId) => dispatch({ type: "allowExit", requestId }),
        targetMounted: (requestId) => dispatch({ type: "targetMounted", requestId }),
        targetReady: (requestId) => dispatch({ type: "targetReady", requestId }),
        sourceExitFinished: (requestId) => dispatch({ type: "sourceExitFinished", requestId }),
        targetEnterFinished: (requestId) => dispatch({ type: "targetEnterFinished", requestId }),
        complete: (requestId, canonicalParticipant) =>
          dispatch({ type: "complete", requestId, canonicalParticipant }),
        abort: (requestId) => dispatch({ type: "abort", requestId }),
      }}
    >
      {children}
    </EntryTransitionContext.Provider>
  );
}

export function useEntryTransition() {
  const context = useContext(EntryTransitionContext);
  if (!context) {
    throw new Error("useEntryTransition must be used within EntryTransitionProvider");
  }
  return context;
}
