import { createContext, PropsWithChildren, useCallback, useContext, useState } from "react";
import { useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { CREATE_SPRING } from "../constants/animation";

export type CreateMode = "paper" | null;

type CreateContextValue = {
  createProgress: SharedValue<number>;
  createMode: CreateMode;
  createDate: string;
  openCreate: (mode: Exclude<CreateMode, null>, date: string) => void;
  closeCreate: () => void;
};

type EntriesVersionContextValue = {
  entriesVersion: number;
  bumpEntriesVersion: () => void;
};

const CreateContext = createContext<CreateContextValue | null>(null);
const EntriesVersionContext = createContext<EntriesVersionContextValue | null>(null);

// One open create session: mode and date are set together on open and cleared
// together on close, so a single object avoids the two-states-that-must-move-
// in-lockstep coupling. `createMode`/`createDate` are derived from it for the
// context API below (derive, don't duplicate state).
type CreateState = { mode: Exclude<CreateMode, null>; date: string };

/**
 * Provides the create *reload signal* on its own context so only the screens
 * that actually re-fetch on save subscribe to it. The animation/mode/date
 * values live in `CreateContext` above; if `entriesVersion` stayed there, every
 * `useCreateContext` consumer (header, tab bar, create button, pager) would
 * re-render on every save even though none of them read the version. Splitting
 * the providers (and giving this one its own component) means a bump re-renders
 * only `useEntriesVersion` subscribers — Home (to reload) and the create screen
 * (which calls `bumpEntriesVersion` on submit) — and leaves the rest alone.
 */
const EntriesVersionProvider = ({ children }: PropsWithChildren) => {
  const [entriesVersion, setEntriesVersion] = useState(0);
  const bumpEntriesVersion = useCallback(() => {
    setEntriesVersion((previous) => previous + 1);
  }, []);

  return (
    <EntriesVersionContext.Provider value={{ entriesVersion, bumpEntriesVersion }}>
      {children}
    </EntriesVersionContext.Provider>
  );
};

export const CreateProvider = ({ children }: PropsWithChildren) => {
  const createProgress = useSharedValue(0);
  const [create, setCreate] = useState<CreateState | null>(null);

  const createMode: CreateMode = create?.mode ?? null;
  const createDate = create?.date ?? "";

  const finishClose = useCallback(() => {
    setCreate(null);
  }, []);

  const openCreate = useCallback(
    (mode: Exclude<CreateMode, null>, date: string) => {
      setCreate({ mode, date });
      scheduleOnUI(() => {
        "worklet";
        createProgress.value = withSpring(1, CREATE_SPRING);
      });
    },
    [createProgress],
  );

  const closeCreate = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      createProgress.value = withSpring(0, CREATE_SPRING, (finished) => {
        if (finished) {
          scheduleOnRN(finishClose);
        }
      });
    });
  }, [createProgress, finishClose]);

  return (
    <CreateContext.Provider
      value={{ createProgress, createMode, createDate, openCreate, closeCreate }}
    >
      <EntriesVersionProvider>{children}</EntriesVersionProvider>
    </CreateContext.Provider>
  );
};

export const useCreateContext = () => {
  const context = useContext(CreateContext);
  if (!context) {
    throw new Error("useCreateContext must be used within CreateProvider");
  }
  return context;
};

export const useEntriesVersion = () => {
  const context = useContext(EntriesVersionContext);
  if (!context) {
    throw new Error("useEntriesVersion must be used within CreateProvider");
  }
  return context;
};
