import type { Entry } from "./entries";

export type CalendarNavigationHandoff = {
  day: string;
  entryId: string | null;
  entries: Entry[];
};

type PendingNavigation = CalendarNavigationHandoff & {
  requestId: number;
  dataReady: boolean;
  sheetDismissed: boolean;
  exitFinished: boolean;
};

/** Coordinates Day readiness with the sequential sheet-dismissal and body-exit barriers. */
export class CalendarNavigationCoordinator {
  #nextRequestId = 0;
  #pending: PendingNavigation | null = null;

  begin(day: string, entryId: string | null): number {
    const requestId = this.#nextRequestId + 1;
    this.#nextRequestId = requestId;
    this.#pending = {
      requestId,
      day,
      entryId,
      entries: [],
      dataReady: false,
      sheetDismissed: false,
      exitFinished: false,
    };
    return requestId;
  }

  cancel(): void {
    this.#pending = null;
  }

  reject(requestId: number): boolean {
    if (!this.#pending || this.#pending.requestId !== requestId) {
      return false;
    }
    this.#pending = null;
    return true;
  }

  resolve(requestId: number, entries: Entry[]): CalendarNavigationHandoff | null {
    if (!this.#pending || this.#pending.requestId !== requestId) {
      return null;
    }
    this.#pending.entries = entries;
    this.#pending.dataReady = true;
    return this.#takeReady();
  }

  sheetDismissed(requestId: number): boolean {
    if (!this.#pending || this.#pending.requestId !== requestId || this.#pending.sheetDismissed) {
      return false;
    }
    this.#pending.sheetDismissed = true;
    return true;
  }

  exitFinished(requestId: number): CalendarNavigationHandoff | null {
    if (
      !this.#pending ||
      this.#pending.requestId !== requestId ||
      !this.#pending.sheetDismissed ||
      this.#pending.exitFinished
    ) {
      return null;
    }
    this.#pending.exitFinished = true;
    return this.#takeReady();
  }

  #takeReady(): CalendarNavigationHandoff | null {
    if (!this.#pending?.dataReady || !this.#pending.sheetDismissed || !this.#pending.exitFinished) {
      return null;
    }
    const { day, entryId, entries } = this.#pending;
    this.#pending = null;
    return { day, entryId, entries };
  }
}
