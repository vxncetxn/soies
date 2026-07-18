import {
  getEntryTypePresence,
  getRecentEntryPreviewPage,
  type EntryTypePresence,
  type RecentEntryCursor,
  type RecentEntryPreviewPage,
} from "../db/repositories/entries";
import { monthBounds, previousMonthId } from "./calendarBrowse";

export const RECENT_PREVIEW_PAGE_SIZE = 24;
const MONTH_MARKER_CACHE_LIMIT = 4;

let firstRecentPage: Promise<RecentEntryPreviewPage> | null = null;
const monthMarkers = new Map<string, Promise<EntryTypePresence[]>>();

export function loadRecentPreviewPage(
  cursor: RecentEntryCursor | null,
): Promise<RecentEntryPreviewPage> {
  if (cursor) {
    return getRecentEntryPreviewPage(cursor, RECENT_PREVIEW_PAGE_SIZE);
  }
  if (firstRecentPage) {
    return firstRecentPage;
  }

  const request = getRecentEntryPreviewPage(null, RECENT_PREVIEW_PAGE_SIZE).catch((error) => {
    if (firstRecentPage === request) {
      firstRecentPage = null;
    }
    throw error;
  });
  firstRecentPage = request;
  return request;
}

export function loadMonthTypePresence(monthId: string): Promise<EntryTypePresence[]> {
  const cached = monthMarkers.get(monthId);
  if (cached) {
    monthMarkers.delete(monthId);
    monthMarkers.set(monthId, cached);
    return cached;
  }

  const { startDay, endDay } = monthBounds(monthId);
  const request = getEntryTypePresence(startDay, endDay).catch((error) => {
    if (monthMarkers.get(monthId) === request) {
      monthMarkers.delete(monthId);
    }
    throw error;
  });
  monthMarkers.set(monthId, request);
  while (monthMarkers.size > MONTH_MARKER_CACHE_LIMIT) {
    const oldest = monthMarkers.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    monthMarkers.delete(oldest);
  }
  return request;
}

/** Warm only the small read models most likely to be shown on first open. */
export async function warmCalendarBrowseData(today: string): Promise<void> {
  const currentMonth = today.slice(0, 7);
  await Promise.allSettled([
    loadRecentPreviewPage(null),
    loadMonthTypePresence(currentMonth),
    loadMonthTypePresence(previousMonthId(currentMonth)),
  ]);
}

export function invalidateCalendarBrowseCaches(): void {
  firstRecentPage = null;
  monthMarkers.clear();
}
