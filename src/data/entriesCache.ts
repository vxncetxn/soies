import type { Entry } from "./entries";

const entriesCache = new Map<string, Entry[]>();

export function getCachedEntries(date: string): Entry[] | undefined {
  return entriesCache.get(date);
}

export function setCachedEntries(date: string, entries: Entry[]): void {
  entriesCache.set(date, entries);
}

export function hasCachedEntries(date: string): boolean {
  return entriesCache.has(date);
}

export function invalidateEntriesCache(date: string): void {
  entriesCache.delete(date);
}

export function seedEntriesCache(byDate: Map<string, Entry[]>): void {
  for (const [date, entries] of byDate) {
    if (!entriesCache.has(date)) {
      entriesCache.set(date, entries);
    }
  }
}
