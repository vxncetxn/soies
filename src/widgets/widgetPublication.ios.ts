/**
 * widgetPublication — the sole app-to-WidgetKit update boundary.
 *
 * One call resolves derived frame URIs, builds all five configured states, and
 * invokes `updateSnapshot` exactly once. Returning the payload lets the
 * controller protect every referenced cache file across publication generations.
 */
import type { FeaturedWidgetSlot } from "../db/repositories/featuredWidgetSlots";

import FeaturedArtefactWidget from "./FeaturedArtefactWidget.ios";
import { cachedWidgetFrameUri } from "./widgetFrameCache";
import { buildFeaturedWidgetSnapshot, type FeaturedArtefactWidgetSnapshot } from "./widgetSnapshot";

/** Publish all five configurations atomically through one WidgetKit timeline entry. */
export function publishFeaturedWidgetSlots(
  slots: FeaturedWidgetSlot[],
): FeaturedArtefactWidgetSnapshot {
  const snapshot = buildFeaturedWidgetSnapshot(slots, (slot) =>
    slot.state === "featured" ? cachedWidgetFrameUri(slot) : undefined,
  );
  FeaturedArtefactWidget.updateSnapshot(snapshot);
  return snapshot;
}
