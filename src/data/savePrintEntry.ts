import { randomUUID } from "expo-crypto";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { withTransaction } from "../db/executor";
import { insertArtefact } from "../db/repositories/artefacts";
import { getNextSortOrder, insertEntry } from "../db/repositories/entries";
import { saveMediaFile } from "../storage/files";
import { invalidateEntriesCache } from "./entriesCache";

function extensionFromUri(uri: string): string {
  const path = uri.split("?")[0] ?? uri;
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  const ext = match?.[1]?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "heic" || ext === "webp") {
    return ext === "jpg" ? "jpeg" : ext;
  }
  return "jpeg";
}

export async function savePrintEntry(params: {
  date: string;
  title: string;
  artefacts: { text: string; imageUri: string }[];
}): Promise<void> {
  const count = params.artefacts.length;
  if (count < 1 || count > MAX_ARTEFACTS_PER_ENTRY) {
    throw new Error(
      `Print entry must have 1–${MAX_ARTEFACTS_PER_ENTRY} artefacts (got ${count})`,
    );
  }

  const entryId = randomUUID();
  const now = Date.now();

  // Copy media before the DB transaction so a failed copy doesn't leave a
  // half-written entry. Each artefact gets its own id / file.
  const prepared: { id: string; text: string; imagePath: string }[] = [];
  for (const artefact of params.artefacts) {
    const id = randomUUID();
    const ext = extensionFromUri(artefact.imageUri);
    const imagePath = await saveMediaFile(artefact.imageUri, id, ext);
    prepared.push({ id, text: artefact.text, imagePath });
  }

  await withTransaction(undefined, async (tx) => {
    const sortOrder = await getNextSortOrder(params.date, tx);

    await insertEntry(
      {
        id: entryId,
        title: params.title,
        type: "print",
        date: params.date,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );

    for (let i = 0; i < prepared.length; i++) {
      const artefact = prepared[i];
      await insertArtefact(
        {
          id: artefact.id,
          entryId,
          type: "print",
          sortOrder: i,
          data: JSON.stringify({ text: artefact.text, imagePath: artefact.imagePath }),
          createdAt: now,
          updatedAt: now,
        },
        tx,
      );
    }
  });

  invalidateEntriesCache(params.date);
}
