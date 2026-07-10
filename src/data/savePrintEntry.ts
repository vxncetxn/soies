import { randomUUID } from "expo-crypto";

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
  text: string;
  /** Temp / picker URI — copied into Documents/artefacts on save. */
  imageUri: string;
}): Promise<void> {
  const entryId = randomUUID();
  const artefactId = randomUUID();
  const now = Date.now();
  const ext = extensionFromUri(params.imageUri);
  const imagePath = await saveMediaFile(params.imageUri, artefactId, ext);

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

    await insertArtefact(
      {
        id: artefactId,
        entryId,
        type: "print",
        sortOrder: 0,
        data: JSON.stringify({ text: params.text, imagePath }),
        createdAt: now,
        updatedAt: now,
      },
      tx,
    );
  });

  invalidateEntriesCache(params.date);
}
