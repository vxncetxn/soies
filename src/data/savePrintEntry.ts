import { randomUUID } from "expo-crypto";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import { deleteMediaFile, saveMediaFile } from "../storage/files";
import { persistNewEntry } from "./saveEntryCore";

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
    throw new Error(`Print entry must have 1–${MAX_ARTEFACTS_PER_ENTRY} artefacts (got ${count})`);
  }

  // Copy media before the DB transaction so a failed copy doesn't leave a
  // half-written entry. Track paths so any later failure can delete orphans.
  const prepared: { id: string; text: string; imagePath: string }[] = [];
  try {
    for (const artefact of params.artefacts) {
      const id = randomUUID();
      const ext = extensionFromUri(artefact.imageUri);
      const imagePath = await saveMediaFile(artefact.imageUri, id, ext);
      prepared.push({ id, text: artefact.text, imagePath });
    }

    await persistNewEntry({
      date: params.date,
      title: params.title,
      type: "print",
      artefacts: prepared.map((artefact) => ({
        id: artefact.id,
        data: JSON.stringify({
          text: artefact.text,
          imagePath: artefact.imagePath,
        }),
      })),
    });
  } catch (error) {
    await Promise.allSettled(prepared.map((artefact) => deleteMediaFile(artefact.imagePath)));
    throw error;
  }
}
