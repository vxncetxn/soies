import { randomUUID } from "expo-crypto";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { withTransaction } from "../db/executor";
import { insertArtefact } from "../db/repositories/artefacts";
import { getNextSortOrder, insertEntry } from "../db/repositories/entries";
import { invalidateEntriesCache } from "./entriesCache";

export async function savePaperEntry(params: {
  date: string;
  title: string;
  artefacts: { text: string }[];
}): Promise<void> {
  const count = params.artefacts.length;
  if (count < 1 || count > MAX_ARTEFACTS_PER_ENTRY) {
    throw new Error(
      `Paper entry must have 1–${MAX_ARTEFACTS_PER_ENTRY} artefacts (got ${count})`,
    );
  }

  const entryId = randomUUID();
  const now = Date.now();

  await withTransaction(undefined, async (tx) => {
    // Compute the next sort_order INSIDE the transaction so the MAX() read and
    // the INSERT are atomic. Reading it outside the tx let two concurrent saves
    // for the same date both read MAX = N and both insert at N+1 (duplicate
    // sort_order). `getNextSortOrder` accepts the executor for exactly this.
    const sortOrder = await getNextSortOrder(params.date, tx);

    await insertEntry(
      {
        id: entryId,
        title: params.title,
        type: "paper",
        date: params.date,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );

    for (let i = 0; i < params.artefacts.length; i++) {
      await insertArtefact(
        {
          id: randomUUID(),
          entryId,
          type: "paper",
          sortOrder: i,
          data: JSON.stringify({ text: params.artefacts[i].text }),
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
    }
  });

  invalidateEntriesCache(params.date);
}
