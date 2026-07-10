import { randomUUID } from "expo-crypto";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { withTransaction } from "../db/executor";
import { insertArtefact } from "../db/repositories/artefacts";
import { getNextSortOrder, insertEntry } from "../db/repositories/entries";
import { invalidateEntriesCache } from "./entriesCache";

/**
 * Shared transactional persistence for a new Paper/Print entry.
 *
 * Callers prepare artefact rows (ids + JSON `data`) first — Print copies media
 * before this so a failed copy never leaves a half-written entry. Cap is
 * enforced here as a save-path guard (ADR-0007); the DB stays unconstrained.
 */
export async function persistNewEntry(params: {
  date: string;
  title: string;
  type: "paper" | "print";
  artefacts: { id: string; data: string }[];
}): Promise<void> {
  const count = params.artefacts.length;
  if (count < 1 || count > MAX_ARTEFACTS_PER_ENTRY) {
    const label = params.type === "paper" ? "Paper" : "Print";
    throw new Error(
      `${label} entry must have 1–${MAX_ARTEFACTS_PER_ENTRY} artefacts (got ${count})`,
    );
  }

  const entryId = randomUUID();
  const now = Date.now();

  await withTransaction(undefined, async (tx) => {
    // Compute sort_order inside the transaction so MAX() + INSERT are atomic.
    const sortOrder = await getNextSortOrder(params.date, tx);

    await insertEntry(
      {
        id: entryId,
        title: params.title,
        type: params.type,
        date: params.date,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );

    for (let i = 0; i < params.artefacts.length; i++) {
      const artefact = params.artefacts[i];
      await insertArtefact(
        {
          id: artefact.id,
          entryId,
          type: params.type,
          sortOrder: i,
          data: artefact.data,
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
    }
  });

  invalidateEntriesCache(params.date);
}
