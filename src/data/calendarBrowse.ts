import type { Artefact } from "./entries";

const ENGLISH_MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
] as const;

function daysForMonth(year: number, month: number): number {
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function monthIdsBetween(startDay: string, endDay: string): string[] {
  const [startYear, startMonth] = startDay.split("-").map(Number);
  const [endYear, endMonth] = endDay.split("-").map(Number);
  const startIndex = startYear * 12 + startMonth - 1;
  const endIndex = endYear * 12 + endMonth - 1;
  const months: string[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    months.push(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`);
  }
  return months;
}

export function monthBounds(monthId: string): { startDay: string; endDay: string } {
  const [year, month] = monthId.split("-").map(Number);
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return {
    startDay: `${prefix}-01`,
    endDay: `${prefix}-${String(daysForMonth(year, month)).padStart(2, "0")}`,
  };
}

function shiftedMonthId(monthId: string, delta: number): string {
  const [year, month] = monthId.split("-").map(Number);
  const index = year * 12 + month - 1 + delta;
  const shiftedMonth = ((index % 12) + 12) % 12;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String(shiftedMonth + 1).padStart(2, "0")}`;
}

export function previousMonthId(monthId: string): string {
  return shiftedMonthId(monthId, -1);
}

export function nextMonthId(monthId: string): string {
  return shiftedMonthId(monthId, 1);
}

export function mondayFirstWeekCount(monthId: string): number {
  const [year, month] = monthId.split("-").map(Number);
  const sundayFirstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const mondayFirstWeekday = (sundayFirstWeekday + 6) % 7;
  return Math.ceil((mondayFirstWeekday + daysForMonth(year, month)) / 7);
}

export type CalendarHeading = {
  text: string;
  year: string;
};

export type PeriodFrame = {
  id: string;
  start: number;
  end: number;
};

/** Resolve the period crossing the viewport's reading line without boundary flicker. */
export function resolveFocusedPeriod(
  frames: readonly PeriodFrame[],
  scrollOffset: number,
  viewportHeight: number,
  previousId: string | null,
  hysteresis: number,
): string | null {
  if (frames.length === 0) {
    return null;
  }

  const readingLine = scrollOffset + viewportHeight * 0.4;
  const previous = previousId ? frames.find((frame) => frame.id === previousId) : undefined;
  if (
    previous &&
    readingLine >= previous.start - hysteresis &&
    readingLine <= previous.end + hysteresis
  ) {
    return previous.id;
  }

  const focused = frames.find((frame) => readingLine >= frame.start && readingLine < frame.end);
  if (focused) {
    return focused.id;
  }
  if (readingLine < frames[0].start) {
    return frames[0].id;
  }

  const nextIndex = frames.findIndex((frame) => frame.start > readingLine);
  if (nextIndex > 0) {
    const before = frames[nextIndex - 1];
    const after = frames[nextIndex];
    return readingLine - before.end <= after.start - readingLine ? before.id : after.id;
  }
  return frames.at(-1)?.id ?? null;
}

export function formatRecentHeading(dayId: string): CalendarHeading {
  const [year, month, day] = dayId.split("-");
  return {
    text: `${Number(day)} ${ENGLISH_MONTHS[Number(month) - 1]}`,
    year,
  };
}

export function formatRecentDayLabel(dayId: string): string {
  const [year, month, day] = dayId.split("-");
  return `${Number(day)} ${formatMonthIndicator(`${year}-${month}`)} ${year}`;
}

/** Fixed-English compact label used by the agreed calendar mockups. */
export function formatMonthIndicator(monthId: string): string {
  const [, month] = monthId.split("-");
  return ENGLISH_MONTHS[Number(month) - 1].slice(0, 3).toUpperCase();
}

/**
 * Space the final month so its item start, rather than an arbitrary point
 * inside it, is the list's last reachable resting position.
 */
export function finalMonthTrailingPadding(
  viewportHeight: number,
  contentInset: number,
  finalMonthHeight: number,
): number {
  return Math.max(0, viewportHeight - contentInset - finalMonthHeight);
}

export function formatMonthlyHeading(monthId: string): CalendarHeading {
  const [year, month] = monthId.split("-");
  return {
    text: ENGLISH_MONTHS[Number(month) - 1],
    year,
  };
}

export type CalendarEntryPreview = {
  id: string;
  date: string;
  title: string;
  type: string;
  sortOrder: number;
  artefactCount: number;
  firstArtefact: Artefact | null;
};

export type RecentEntryRow = {
  id: string;
  day: string;
  entries: CalendarEntryPreview[];
};

export type StableRecentPage = {
  items: CalendarEntryPreview[];
  hasMore: boolean;
};

/**
 * Choose a page boundary that never leaves half of a known same-Day pair.
 * Callers fetch `limit + 2`: one lookahead may complete the pair and the second
 * tells us whether another page remains after consuming that lookahead.
 */
export function takeStableRecentPage(
  fetched: readonly CalendarEntryPreview[],
  limit: number,
): StableRecentPage {
  if (limit < 1) {
    return { items: [], hasMore: fetched.length > 0 };
  }

  const items = fetched.slice(0, limit);
  if (items.length < limit) {
    return { items, hasMore: false };
  }

  const lastDay = items.at(-1)?.date;
  let trailingDayCount = 0;
  for (let index = items.length - 1; index >= 0 && items[index].date === lastDay; index -= 1) {
    trailingDayCount += 1;
  }

  const lookahead = fetched[limit];
  if (trailingDayCount % 2 === 1 && lookahead?.date === lastDay) {
    items.push(lookahead);
  }

  return { items, hasMore: fetched.length > items.length };
}

/** Pack ordered previews into stable one/two-card rows owned by one Day. */
export function packRecentEntryRows(entries: readonly CalendarEntryPreview[]): RecentEntryRow[] {
  const rows: RecentEntryRow[] = [];

  for (let index = 0; index < entries.length; ) {
    const first = entries[index];
    const second = entries[index + 1];
    const rowEntries = second?.date === first.date ? [first, second] : [first];
    rows.push({
      id: `${first.date}:${first.id}`,
      day: first.date,
      entries: rowEntries,
    });
    index += rowEntries.length;
  }

  return rows;
}
