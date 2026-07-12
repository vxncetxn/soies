import { randomUUID } from "expo-crypto";

import type { DraftInk } from "./ink";

import { deleteInkOverlayFile, saveInkOverlayFile } from "../storage/files";
import { serializeAnnotations } from "./ink";
import { persistNewEntry } from "./saveEntryCore";

export async function savePaperEntry(params: {
  date: string;
  title: string;
  artefacts: { text: string; ink?: DraftInk | null }[];
}): Promise<void> {
  const prepared: { id: string; data: string; annotations: string | null }[] = [];

  try {
    for (const artefact of params.artefacts) {
      const id = randomUUID();
      // Register cleanup ownership before the optional copy. File.copy can
      // create its destination and then reject, so waiting until success would
      // make that partial output invisible to the catch path.
      prepared.push({
        id,
        data: JSON.stringify({ text: artefact.text }),
        annotations: null,
      });
      if (artefact.ink && artefact.ink.document.strokes.length > 0) {
        const annotations = serializeAnnotations(artefact.ink.document);
        await saveInkOverlayFile(artefact.ink.overlayUri, id);
        prepared[prepared.length - 1] = {
          id,
          data: JSON.stringify({ text: artefact.text }),
          annotations,
        };
      }
    }

    await persistNewEntry({
      date: params.date,
      title: params.title,
      type: "paper",
      artefacts: prepared.map((artefact) => ({
        id: artefact.id,
        data: artefact.data,
        annotations: artefact.annotations,
      })),
    });
  } catch (error) {
    await Promise.allSettled(
      prepared.map(async (artefact) => {
        await deleteInkOverlayFile(artefact.id);
      }),
    );
    throw error;
  }
}
