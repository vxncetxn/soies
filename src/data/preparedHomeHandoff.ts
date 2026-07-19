import type { Entry } from "./entries";

/** Complete Day payload adopted behind the lightweight prepared-Home cover. */
export type PreparedHomeHandoff = {
  day: string;
  entryId: string | null;
  entries: Entry[];
};
