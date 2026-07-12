import { randomUUID } from "expo-crypto";

import type { DraftInk } from "./ink";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import {
  deleteInkOverlayFile,
  deleteMediaFile,
  saveInkOverlayFile,
  saveMediaFile,
} from "../storage/files";
import { serializeAnnotations } from "./ink";
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
  artefacts: { text: string; imageUri: string; ink?: DraftInk | null }[];
}): Promise<void> {
  const count = params.artefacts.length;
  if (count < 1 || count > MAX_ARTEFACTS_PER_ENTRY) {
    throw new Error(`Print entry must have 1–${MAX_ARTEFACTS_PER_ENTRY} artefacts (got ${count})`);
  }

  // Copy media before the DB transaction so a failed copy doesn't leave a
  // half-written entry. Register each side effect in `prepared` immediately
  // so catch cleanup can always see the current artefact's files.
  const prepared: {
    id: string;
    text: string;
    imagePath: string;
    annotations: string | null;
  }[] = [];
  try {
    for (const artefact of params.artefacts) {
      const id = randomUUID();
      const ext = extensionFromUri(artefact.imageUri);
      const imagePath = await saveMediaFile(artefact.imageUri, id, ext);
      // Own the photo before the optional overlay copy so a later failure
      // still cleans it up.
      prepared.push({ id, text: artefact.text, imagePath, annotations: null });
      if (artefact.ink && artefact.ink.document.strokes.length > 0) {
        const annotations = serializeAnnotations(artefact.ink.document);
        await saveInkOverlayFile(artefact.ink.overlayUri, id);
        prepared[prepared.length - 1] = {
          id,
          text: artefact.text,
          imagePath,
          annotations,
        };
      }
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
        annotations: artefact.annotations,
      })),
    });
  } catch (error) {
    await Promise.allSettled(
      prepared.map(async (artefact) => {
        await deleteMediaFile(artefact.imagePath);
        await deleteInkOverlayFile(artefact.id);
      }),
    );
    throw error;
  }
}
