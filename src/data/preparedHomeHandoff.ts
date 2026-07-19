import type { Entry } from "./entries";

/** Complete Day payload adopted behind the lightweight prepared-Home cover. */
export type PreparedHomeHandoff = {
  day: string;
  entryId: string | null;
  entries: Entry[];
};

export type PreparedHomeTransition = PreparedHomeHandoff & {
  requestId: number;
  origin: "calendar" | "save";
  error: Error | null;
};

type PreparedHomeLoadResult =
  | {
      requestId: number;
      day: string;
      origin: "calendar" | "save";
      entries: Entry[];
      /** Calendar's exact selection; Save intentionally selects the newest Entry. */
      entryId?: string | null;
    }
  | {
      requestId: number;
      day: string;
      origin: "calendar" | "save";
      error: Error;
    };

/** Convert an adapter load result into the one retained prepared-Home payload. */
export function buildPreparedHomeTransition(
  result: PreparedHomeLoadResult,
): PreparedHomeTransition {
  if ("error" in result) {
    return {
      requestId: result.requestId,
      day: result.day,
      origin: result.origin,
      entryId: null,
      entries: [],
      error: result.error,
    };
  }

  return {
    requestId: result.requestId,
    day: result.day,
    origin: result.origin,
    entryId:
      result.origin === "save" ? (result.entries.at(-1)?.id ?? null) : (result.entryId ?? null),
    entries: result.entries,
    error: null,
  };
}

/** Resolve an exact target when it exists, otherwise use the Day's first Entry. */
export function resolvePreparedHomeEntry(handoff: PreparedHomeHandoff): Entry | null {
  return (
    handoff.entries.find((entry) => entry.id === handoff.entryId) ?? handoff.entries[0] ?? null
  );
}
