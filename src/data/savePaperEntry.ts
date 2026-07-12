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
  const prepared: { id: string; data: string; annotations: string | null; overlayUri?: string }[] =
    [];

  try {
    for (const artefact of params.artefacts) {
      const id = randomUUID();
      let annotations: string | null = null;
      let overlayUri: string | undefined;
      if (artefact.ink && artefact.ink.document.strokes.length > 0) {
        annotations = serializeAnnotations(artefact.ink.document);
        overlayUri = await saveInkOverlayFile(artefact.ink.overlayUri, id);
      }
      prepared.push({
        id,
        data: JSON.stringify({ text: artefact.text }),
        annotations,
        overlayUri,
      });
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
        if (artefact.overlayUri) {
          await deleteInkOverlayFile(artefact.id);
        }
      }),
    );
    throw error;
  }
}
