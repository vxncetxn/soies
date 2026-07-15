import { Asset } from "expo-asset";
import * as Crypto from "expo-crypto";

import { saveMediaFile } from "../storage/files";
import { addDaysISO, todayISO } from "../utils/date";
import { withTransaction } from "./executor";
import { insertArtefact } from "./repositories/artefacts";
import { insertEntry } from "./repositories/entries";
import { createTag, setEntryTags } from "./repositories/tags";
import { getOrCreateUser } from "./repositories/users";

type SeedArtefact = {
  text: string;
  bundledImage?: boolean;
};

type SeedEntry = {
  title: string;
  type: "paper" | "print";
  artefacts: SeedArtefact[];
};

type SeedDay = {
  date: string;
  entries: SeedEntry[];
};

const SEED_DATA: SeedDay[] = [
  {
    date: todayISO(),
    entries: [
      {
        title: "An example entry that is very long",
        type: "paper",
        artefacts: [
          {
            text: "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since 1966, when designers at Letraset and James Mosley, the librarian at St Bride Printing Library in London, took a 1914 Cicero translation and scrambled it to make dummy text for Letraset's Body Type sheets.",
          },
          { text: "Paper 2" },
          { text: "Paper 3" },
          { text: "Paper 4" },
          { text: "Paper 5" },
        ],
      },
      {
        title: "kiyomizudera",
        type: "print",
        artefacts: [{ text: "Print 1", bundledImage: true }],
      },
    ],
  },
  {
    date: addDaysISO(todayISO(), -1),
    entries: [
      {
        title: "day in retro",
        type: "paper",
        artefacts: [{ text: "Paper 1" }, { text: "Paper 2" }],
      },
    ],
  },
];

const SAMPLE_TAG_NAME = "Japan 2026";

// A fully-prepared artefact: every id/timestamp/data field is resolved (image
// file already copied) so the DB write phase is pure SQL with no awaits on file
// I/O — which lets the whole seed commit atomically inside one transaction.
type PreparedArtefact = {
  id: string;
  type: "paper" | "print";
  sortOrder: number;
  data: string;
  createdAt: number;
  updatedAt: number;
};

type PreparedEntry = {
  id: string;
  title: string;
  type: "paper" | "print";
  date: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  artefacts: PreparedArtefact[];
  tagNames: string[];
};

/**
 * Seed a clean database with mock data.
 *
 * Two phases keep file I/O out of the DB transaction:
 *   1. Prepare — generate UUIDs/timestamps, materialise the bundled mock image
 *      once, and copy it per artefact into the file store. Builds a list of
 *      {@link PreparedEntry}s with every field resolved.
 *   2. Commit — run every insert (user, entries, artefacts, and tags) inside a
 *      single transaction, passing the transaction through
 *      to the repositories so their row+FTS writes are atomic too.
 *
 * If anything fails mid-seed the whole transaction rolls back, leaving the DB
 * clean so the next launch re-seeds from scratch instead of getting stuck with
 * partial data (the empty-DB gate in `initDatabase` would otherwise see the
 * user row and skip re-seeding).
 */
export async function seed(): Promise<void> {
  // ---- Phase 1: prepare (file I/O allowed here) ----
  const imageAsset = Asset.fromModule(require("../data/mock-image.png"));
  await imageAsset.downloadAsync();
  const imageLocalUri = imageAsset.localUri ?? null;

  const now = Date.now();
  const preparedEntries: PreparedEntry[] = [];

  for (const day of SEED_DATA) {
    for (let entryIndex = 0; entryIndex < day.entries.length; entryIndex += 1) {
      const seedEntry = day.entries[entryIndex];
      const entryId = Crypto.randomUUID();
      const entryTimestamp = now + entryIndex;
      const tagNames = seedEntry.title === "kiyomizudera" ? [SAMPLE_TAG_NAME] : [];

      const preparedArtefacts: PreparedArtefact[] = [];
      for (let artefactIndex = 0; artefactIndex < seedEntry.artefacts.length; artefactIndex += 1) {
        const seedArtefact = seedEntry.artefacts[artefactIndex];
        const artefactId = Crypto.randomUUID();
        const artefactTimestamp = entryTimestamp + artefactIndex;

        let data: string;
        if (seedEntry.type === "paper") {
          data = JSON.stringify({ text: seedArtefact.text });
        } else {
          let imagePath = "";
          if (seedArtefact.bundledImage && imageLocalUri) {
            imagePath = await saveMediaFile(imageLocalUri, artefactId, "png");
          }
          data = JSON.stringify({ text: seedArtefact.text, imagePath });
        }

        preparedArtefacts.push({
          id: artefactId,
          type: seedEntry.type,
          sortOrder: artefactIndex,
          data,
          createdAt: artefactTimestamp,
          updatedAt: artefactTimestamp,
        });
      }

      preparedEntries.push({
        id: entryId,
        title: seedEntry.title,
        type: seedEntry.type,
        date: day.date,
        sortOrder: entryIndex,
        createdAt: entryTimestamp,
        updatedAt: entryTimestamp,
        artefacts: preparedArtefacts,
        tagNames,
      });
    }
  }

  // ---- Phase 2: commit (single transaction, no file I/O) ----
  await withTransaction(undefined, async (tx) => {
    await getOrCreateUser(tx);

    for (const entry of preparedEntries) {
      await insertEntry(
        {
          id: entry.id,
          title: entry.title,
          type: entry.type,
          date: entry.date,
          sortOrder: entry.sortOrder,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        },
        tx,
      );

      for (const artefact of entry.artefacts) {
        await insertArtefact(
          {
            id: artefact.id,
            entryId: entry.id,
            type: artefact.type,
            sortOrder: artefact.sortOrder,
            data: artefact.data,
            createdAt: artefact.createdAt,
            updatedAt: artefact.updatedAt,
          },
          tx,
        );
      }

      for (const tagName of entry.tagNames) {
        const tag = await createTag(tagName, tx);
        await setEntryTags(entry.id, [tag.id], tx);
      }
    }
  });
}
