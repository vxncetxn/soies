import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useReducer,
  useRef,
} from "react";

import {
  createStackExpansionState,
  stackExpansionReducer,
  type StackExpansionState,
} from "./stackExpansion";

type ExpandContextValue = {
  state: StackExpansionState;
  requestExpand: (entryId: string, replaceOwner?: boolean) => number;
  requestCollapse: (entryId: string) => number;
  portalReady: (entryId: string, requestId: number) => void;
  motionFinished: (requestId: number) => void;
  abort: (entryId: string, requestId: number) => void;
  releaseOwner: (entryId: string) => void;
};

const ExpandContext = createContext<ExpandContextValue | null>(null);

export const ExpandProvider = ({ children }: PropsWithChildren) => {
  const [state, dispatch] = useReducer(stackExpansionReducer, undefined, createStackExpansionState);
  const nextRequestIdRef = useRef(0);

  const requestExpand: ExpandContextValue["requestExpand"] = useCallback(
    (entryId, replaceOwner = false) => {
      nextRequestIdRef.current += 1;
      const requestId = nextRequestIdRef.current;
      dispatch({
        type: "requestExpand",
        entryId,
        requestId,
        retainHiddenChrome: replaceOwner,
      });
      return requestId;
    },
    [],
  );

  const requestCollapse: ExpandContextValue["requestCollapse"] = useCallback((entryId) => {
    nextRequestIdRef.current += 1;
    const requestId = nextRequestIdRef.current;
    dispatch({ type: "requestCollapse", entryId, requestId });
    return requestId;
  }, []);

  const portalReady: ExpandContextValue["portalReady"] = useCallback((entryId, requestId) => {
    dispatch({ type: "portalReady", entryId, requestId });
  }, []);
  const motionFinished: ExpandContextValue["motionFinished"] = useCallback((requestId) => {
    dispatch({ type: "motionFinished", requestId });
  }, []);
  const abort: ExpandContextValue["abort"] = useCallback((entryId, requestId) => {
    dispatch({ type: "abort", entryId, requestId });
  }, []);
  const releaseOwner: ExpandContextValue["releaseOwner"] = useCallback((entryId) => {
    dispatch({ type: "ownerUnmounted", entryId });
  }, []);

  return (
    <ExpandContext.Provider
      value={{
        state,
        requestExpand,
        requestCollapse,
        portalReady,
        motionFinished,
        abort,
        releaseOwner,
      }}
    >
      {children}
    </ExpandContext.Provider>
  );
};

export const useExpandContext = () => {
  const context = useContext(ExpandContext);

  if (!context) {
    throw new Error("useExpandContext must be used within ExpandProvider");
  }

  return context;
};
