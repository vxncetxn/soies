import { randomUUID } from "expo-crypto";

import { withTransaction } from "../db/executor";
import { insertArtefact } from "../db/repositories/artefacts";
import { getNextSortOrder, insertEntry } from "../db/repositories/entries";
import { invalidateEntriesCache } from "./entriesCache";

export async function savePaperEntry(params: {
  date: string;
  title: string;
  text: string;
}): Promise<void> {
  const entryId = randomUUID();
  const artefactId = randomUUID();
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

    await insertArtefact(
      {
        id: artefactId,
        entryId,
        type: "paper",
        sortOrder: 0,
        data: JSON.stringify({ text: params.text }),
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );
  });

  invalidateEntriesCache(params.date);
}
