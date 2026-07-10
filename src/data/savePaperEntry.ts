import { randomUUID } from "expo-crypto";

import { persistNewEntry } from "./saveEntryCore";

export async function savePaperEntry(params: {
  date: string;
  title: string;
  artefacts: { text: string }[];
}): Promise<void> {
  await persistNewEntry({
    date: params.date,
    title: params.title,
    type: "paper",
    artefacts: params.artefacts.map((artefact) => ({
      id: randomUUID(),
      data: JSON.stringify({ text: artefact.text }),
    })),
  });
}
