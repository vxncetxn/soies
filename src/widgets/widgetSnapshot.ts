/**
 * widgetSnapshot — serializable boundary between app state and WidgetKit.
 *
 * Every publication contains `slot1` through `slot5`, even when repository
 * input is missing. The mapper adds exact URLs and localized accessibility copy
 * while keeping derived image lookup injectable. Entry metadata is not sent as
 * separate display fields because the frame now owns the whole widget surface.
 *
 * Map:
 * - slot-key helpers constrain AppIntent configuration to 1–5;
 * - URL helpers implement occupied versus slot-only navigation contracts;
 * - `buildFeaturedWidgetSnapshot` exhaustively maps all five slot states.
 */
import type {
  FeaturedWidgetSlotIndex,
  FeaturedWidgetSlot,
} from "../db/repositories/featuredWidgetSlots";

import { formatDisplayDate } from "../utils/date";

export type FeaturedWidgetSlotKey = `slot${FeaturedWidgetSlotIndex}`;
export type FeaturedWidgetSnapshotState = "empty" | "featured" | "unavailable";

export type FeaturedWidgetSlotSnapshot = {
  /** Drives one of the three complete widget presentations. */
  state: FeaturedWidgetSnapshotState;
  /** Shared-container URI; omitted when capture is unavailable or stale. */
  frameUri?: string;
  /** Full-widget tap destination. */
  url: string;
  /** One semantic label replaces the decorative SwiftUI subtree. */
  accessibilityLabel: string;
};

export type FeaturedArtefactWidgetSnapshot = {
  slots: Record<FeaturedWidgetSlotKey, FeaturedWidgetSlotSnapshot>;
};

export function featuredWidgetSlotKey(slotIndex: FeaturedWidgetSlotIndex): FeaturedWidgetSlotKey {
  return `slot${slotIndex}`;
}

/** Invalid/missing native configuration safely falls back to Slot 1. */
export function parseFeaturedWidgetSlotKey(value: unknown): FeaturedWidgetSlotIndex {
  const match = typeof value === "string" ? /^slot([1-5])$/.exec(value) : null;
  return (match ? Number(match[1]) : 1) as FeaturedWidgetSlotIndex;
}

function slotOnlyUrl(slotIndex: FeaturedWidgetSlotIndex): string {
  return `soies:///?widgetSlot=${slotIndex}`;
}

export function occupiedWidgetUrl(
  slotIndex: FeaturedWidgetSlotIndex,
  entryDate: string,
  entryId: string,
  artefactId: string,
): string {
  return `${slotOnlyUrl(slotIndex)}&date=${encodeURIComponent(entryDate)}&widgetEntryId=${encodeURIComponent(entryId)}&widgetArtefactId=${encodeURIComponent(artefactId)}`;
}

/**
 * Convert durable slot state into the single five-key payload consumed by all
 * installed widget configurations. Image lookup is injected because paths are
 * derived cache state, not part of the database row or snapshot mapper.
 */
export function buildFeaturedWidgetSnapshot(
  slots: FeaturedWidgetSlot[],
  frameUriForSlot: (slot: FeaturedWidgetSlot) => string | undefined,
  formatDate: (iso: string) => string = formatDisplayDate,
): FeaturedArtefactWidgetSnapshot {
  const byIndex = new Map(slots.map((slot) => [slot.slotIndex, slot]));
  const pairs = ([1, 2, 3, 4, 5] as const).map((slotIndex) => {
    const key = featuredWidgetSlotKey(slotIndex);
    const slot = byIndex.get(slotIndex);

    if (!slot || slot.state === "empty") {
      return [
        key,
        {
          state: "empty",
          url: slotOnlyUrl(slotIndex),
          accessibilityLabel: `Featured Artefact ${slotIndex} is empty. Feature an artefact in Soies.`,
        },
      ] as const;
    }

    if (slot.state === "unavailable") {
      return [
        key,
        {
          state: "unavailable",
          url: slotOnlyUrl(slotIndex),
          accessibilityLabel: `Featured Artefact ${slotIndex} is in Recently Deleted.`,
        },
      ] as const;
    }

    const frameUri = frameUriForSlot(slot);
    return [
      key,
      {
        state: "featured",
        ...(frameUri ? { frameUri } : {}),
        url: occupiedWidgetUrl(slotIndex, slot.entryDate, slot.entryId, slot.artefact.id),
        accessibilityLabel: `Featured Artefact ${slotIndex}, from ${slot.entryTitle}, ${formatDate(slot.entryDate)}.`,
      },
    ] as const;
  });

  return {
    slots: Object.fromEntries(pairs) as Record<FeaturedWidgetSlotKey, FeaturedWidgetSlotSnapshot>,
  };
}
