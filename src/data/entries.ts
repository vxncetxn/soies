import { addDaysISO, todayISO } from "../utils/date";

export type Entry = {
  id: string;
  date: string;
  count: number;
};

const MOCK_ENTRIES: Entry[] = [
  { id: "entry-a", date: todayISO(), count: 5 },
  { id: "entry-b", date: todayISO(), count: 3 },
  { id: "entry-c", date: todayISO(), count: 4 },
  { id: "entry-d", date: addDaysISO(todayISO(), -1), count: 2 },
  { id: "entry-e", date: addDaysISO(todayISO(), 1), count: 3 },
];

export const getEntriesByDate = (date: string): Entry[] => {
  return MOCK_ENTRIES.filter((entry) => entry.date === date);
};
