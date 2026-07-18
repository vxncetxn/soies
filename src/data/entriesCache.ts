import type { Entry } from "./entries";

export const DAY_ENTRIES_CACHE_LIMIT = 8;

/** Bounded LRU for complete Days; a read refreshes recency. */
export class DayEntriesCache {
  readonly #capacity: number;
  readonly #entries = new Map<string, Entry[]>();
  readonly #pending = new Map<string, Promise<Entry[]>>();

  constructor(capacity = DAY_ENTRIES_CACHE_LIMIT) {
    this.#capacity = Math.max(1, Math.floor(capacity));
  }

  get size(): number {
    return this.#entries.size;
  }

  has(day: string): boolean {
    return this.#entries.has(day);
  }

  get(day: string): Entry[] | undefined {
    const entries = this.#entries.get(day);
    if (!entries) {
      return undefined;
    }
    this.#entries.delete(day);
    this.#entries.set(day, entries);
    return entries;
  }

  set(day: string, entries: Entry[]): void {
    this.#entries.delete(day);
    this.#entries.set(day, entries);
    while (this.#entries.size > this.#capacity) {
      const oldestDay = this.#entries.keys().next().value;
      if (oldestDay === undefined) {
        break;
      }
      this.#entries.delete(oldestDay);
    }
  }

  load(day: string, loader: () => Promise<Entry[]>): Promise<Entry[]> {
    const cached = this.get(day);
    if (cached) {
      return Promise.resolve(cached);
    }

    const existing = this.#pending.get(day);
    if (existing) {
      return existing;
    }

    const request = loader()
      .then((entries) => {
        if (this.#pending.get(day) === request) {
          this.set(day, entries);
        }
        return entries;
      })
      .finally(() => {
        if (this.#pending.get(day) === request) {
          this.#pending.delete(day);
        }
      });
    this.#pending.set(day, request);
    return request;
  }

  invalidate(day: string): void {
    this.#entries.delete(day);
    this.#pending.delete(day);
  }

  clear(): void {
    this.#entries.clear();
    this.#pending.clear();
  }
}

const dayEntriesCache = new DayEntriesCache();

export function getCachedEntries(date: string): Entry[] | undefined {
  return dayEntriesCache.get(date);
}

export function setCachedEntries(date: string, entries: Entry[]): void {
  dayEntriesCache.set(date, entries);
}

export function hasCachedEntries(date: string): boolean {
  return dayEntriesCache.has(date);
}

export function invalidateEntriesCache(date: string): void {
  dayEntriesCache.invalidate(date);
}

export function loadEntriesCached(date: string, loader: () => Promise<Entry[]>): Promise<Entry[]> {
  return dayEntriesCache.load(date, loader);
}
