import { createContext, PropsWithChildren, useContext, useState } from "react";

import { useEntryTransition } from "../entry-transition/EntryTransitionContext";

export type CreateMode = "paper" | "print" | null;
export type CreateDismissalReason = "cancel" | "save";

type OpenCreateOptions = {
  imageUri: string;
};

type CreateContextValue = {
  createMode: CreateMode;
  createDate: string;
  /** Pending picker URI while creating a Print; empty for Paper. */
  createImageUri: string;
  /**
   * True while a create screen is mid-save. Blocks hardware-back dismiss so a
   * cancel cannot race an in-flight persist.
   */
  createSessionBusy: boolean;
  createDismissal: { requestId: number; reason: CreateDismissalReason } | null;
  setCreateSessionBusy: (busy: boolean) => void;
  openCreate: (mode: Exclude<CreateMode, null>, date: string, options?: OpenCreateOptions) => void;
  closeCreate: (reason?: CreateDismissalReason) => void;
};

type EntriesVersionContextValue = {
  entriesVersion: number;
  bumpEntriesVersion: () => void;
};

const CreateContext = createContext<CreateContextValue | null>(null);
const EntriesVersionContext = createContext<EntriesVersionContextValue | null>(null);

// One open create session: mode, date, and optional imageUri move together on
// open/close so a single object avoids lockstep coupling. Derived fields below
// keep the context API flat for consumers.
type CreateState = {
  mode: Exclude<CreateMode, null>;
  date: string;
  imageUri?: string;
  dismissal: { requestId: number; reason: CreateDismissalReason } | null;
};

/**
 * Provides the create *reload signal* on its own context so only the screens
 * that actually re-fetch on save subscribe to it. The animation/mode/date
 * values live in `CreateContext` above; if `entriesVersion` stayed there, every
 * `useCreateContext` consumer (header, launchers, pager) would
 * re-render on every save even though none of them read the version. Splitting
 * the providers (and giving this one its own component) means a bump re-renders
 * only `useEntriesVersion` subscribers — currently Home, which refreshes the
 * Calendar browse cache after a successful Save hand-off — and leaves the rest
 * alone.
 */
const EntriesVersionProvider = ({ children }: PropsWithChildren) => {
  const [entriesVersion, setEntriesVersion] = useState(0);
  const bumpEntriesVersion = () => {
    setEntriesVersion((previous) => previous + 1);
  };

  return (
    <EntriesVersionContext.Provider value={{ entriesVersion, bumpEntriesVersion }}>
      {children}
    </EntriesVersionContext.Provider>
  );
};

export const CreateProvider = ({ children }: PropsWithChildren) => {
  const entryTransition = useEntryTransition();
  const [create, setCreate] = useState<CreateState | null>(null);
  const [createSessionBusy, setCreateSessionBusy] = useState(false);

  const createMode: CreateMode = create?.mode ?? null;
  const createDate: string = create?.date ?? "";
  const createImageUri: string = create?.imageUri ?? "";
  const createDismissal = create?.dismissal ?? null;

  // The source Create tree is deliberately retained throughout Home's entrance.
  // Once the coordinator completes, remove it during render so no Effect-driven
  // teardown can race the just-finished native transition.
  if (
    create?.dismissal &&
    entryTransition.state.phase === "idle" &&
    entryTransition.state.canonicalParticipant === "home"
  ) {
    setCreate(null);
  }

  const openCreate = (
    mode: Exclude<CreateMode, null>,
    date: string,
    options?: OpenCreateOptions,
  ) => {
    // Print create is gated on an acquired image — never open an empty Print
    // session (would fade Home chrome into a blank overlay).
    if (
      (mode === "print" && !options?.imageUri) ||
      create !== null ||
      entryTransition.state.phase !== "idle" ||
      entryTransition.state.canonicalParticipant !== "home"
    ) {
      return;
    }

    entryTransition.begin("home", "create", "immediate", "crossfade");
    setCreateSessionBusy(false);
    setCreate({
      mode,
      date,
      imageUri: mode === "print" ? options?.imageUri : undefined,
      dismissal: null,
    });
  };

  const closeCreate = (reason: CreateDismissalReason = "cancel") => {
    if (
      !create ||
      create.dismissal ||
      entryTransition.state.phase !== "idle" ||
      entryTransition.state.canonicalParticipant !== "create"
    ) {
      return;
    }

    const target = reason === "save" ? "prepared-home" : "home";
    const requestId = entryTransition.begin("create", target, "immediate", "crossfade");
    setCreateSessionBusy(false);
    setCreate((current) => {
      if (!current) {
        return current;
      }
      return { ...current, dismissal: { requestId, reason } };
    });

    if (reason === "cancel") {
      // Canonical Home never unmounted while Create was open, so it is a mounted,
      // already-rendered target. These events queue after begin in request order.
      entryTransition.targetMounted(requestId);
      entryTransition.targetReady(requestId);
    }
  };

  return (
    <CreateContext.Provider
      value={{
        createMode,
        createDate,
        createImageUri,
        createSessionBusy,
        createDismissal,
        setCreateSessionBusy,
        openCreate,
        closeCreate,
      }}
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
