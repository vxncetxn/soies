import { todayISO } from "../utils/date";
import { getEntriesByDate, getEntryDates } from "./repositories/entries";
import { searchEntries } from "./repositories/search";
import { findTagIdByName } from "./repositories/tags";
import { getUserCreationDay } from "./repositories/users";

const SAMPLE_TAG_NAME = "Japan 2026";

export async function verifySeedData(): Promise<void> {
  if ((await getUserCreationDay()) !== "2026-01-01") {
    throw new Error("verifySeedData: expected January 1, 2026 User Creation Day");
  }

  const dates = await getEntryDates();
  if (dates.size === 0) {
    throw new Error("verifySeedData: expected seeded entry dates");
  }

  const todayEntries = await getEntriesByDate(todayISO());
  if (todayEntries.length === 0) {
    throw new Error("verifySeedData: expected entries for today");
  }

  const titleMatches = await searchEntries({ query: "kiyomizudera" });
  if (!titleMatches.some((entry) => entry.title === "kiyomizudera")) {
    throw new Error("verifySeedData: search by title failed for kiyomizudera");
  }

  const textMatches = await searchEntries({ query: "Print 1" });
  if (!textMatches.some((entry) => entry.title === "kiyomizudera")) {
    throw new Error("verifySeedData: search by artefact text failed for kiyomizudera");
  }

  const tagId = await findTagIdByName(SAMPLE_TAG_NAME);
  if (!tagId) {
    throw new Error(`verifySeedData: expected tag ${SAMPLE_TAG_NAME}`);
  }

  const tagMatches = await searchEntries({ tagIds: [tagId] });
  if (!tagMatches.some((entry) => entry.title === "kiyomizudera")) {
    throw new Error("verifySeedData: tag filter failed for kiyomizudera");
  }
}
