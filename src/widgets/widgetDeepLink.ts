/**
 * widgetDeepLink — parse, deduplicate, and resolve WidgetKit tap commands.
 *
 * Expo Router may expose scalar or repeated query values. Parsing first reduces
 * them to a bounded slot target or an exact source target. Home then validates
 * durable data and visible Entry data before DayPager/Stack receive a one-shot
 * command; missing sources degrade to the originating slot management page.
 *
 * Map:
 * - parsing/signatures implement cold and repeated warm URL consumption;
 * - exact-source helpers protect index-keyed Home reuse from stale caches;
 * - Stack ownership helpers prevent two fullscreen portals after a warm tap.
 */
import type { Entry } from "../data/entries";
import type { FeaturedWidgetSlotIndex } from "../db/repositories/featuredWidgetSlots";

type SearchValue = string | string[] | undefined;

export type WidgetSearchParams = {
  /** Present on every widget URL and bounded to 1–5 by the parser. */
  widgetSlot?: SearchValue;
  /** Ordinary Home route date, plus source date for occupied widget URLs. */
  date?: SearchValue;
  widgetEntryId?: SearchValue;
  widgetArtefactId?: SearchValue;
};

export type WidgetDeepLinkTarget =
  | { kind: "slot"; slotIndex: FeaturedWidgetSlotIndex }
  | {
      kind: "artefact";
      slotIndex: FeaturedWidgetSlotIndex;
      date: string;
      entryId: string;
      artefactId: string;
    };

function first(value: SearchValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse only the documented URL shapes; partial occupied URLs become slot taps. */
export function parseWidgetDeepLink(params: WidgetSearchParams): WidgetDeepLinkTarget | null {
  const slotValue = first(params.widgetSlot);
  if (!slotValue || !/^[1-5]$/.test(slotValue)) {
    return null;
  }
  const slotIndex = Number(slotValue) as FeaturedWidgetSlotIndex;
  const date = first(params.date);
  const entryId = first(params.widgetEntryId);
  const artefactId = first(params.widgetArtefactId);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && entryId && artefactId) {
    return { kind: "artefact", slotIndex, date, entryId, artefactId };
  }
  return { kind: "slot", slotIndex };
}

/** Stable identity distinguishes React re-renders from a new external tap. */
export function widgetDeepLinkSignature(target: WidgetDeepLinkTarget): string {
  return target.kind === "slot"
    ? `slot:${target.slotIndex}`
    : `artefact:${target.slotIndex}:${target.date}:${target.entryId}:${target.artefactId}`;
}

/**
 * One-shot inbox state for warm links. Clearing widget params resets the stored
 * signature, so tapping the exact same installed widget again is consumable.
 */
export function nextWidgetDeepLinkConsumption(
  previousSignature: string | null,
  params: WidgetSearchParams,
): { signature: string | null; target: WidgetDeepLinkTarget | null } {
  const target = parseWidgetDeepLink(params);
  if (!target) {
    return { signature: null, target: null };
  }
  const signature = widgetDeepLinkSignature(target);
  return {
    signature,
    target: signature === previousSignature ? null : target,
  };
}

/** Resolve all three durable identities before Home hands a command to pagers. */
export function hasExactWidgetSource(
  entries: readonly Entry[],
  target: Extract<WidgetDeepLinkTarget, { kind: "artefact" }>,
): boolean {
  return entries.some(
    (entry) =>
      entry.id === target.entryId &&
      entry.artefacts.some((artefact) => artefact.id === target.artefactId),
  );
}

/** A target is actionable only after Home displays its requested source date. */
export function widgetTargetForEntries(
  target: Extract<WidgetDeepLinkTarget, { kind: "artefact" }> | null,
  effectiveDate: string,
  entries: readonly Entry[],
): Extract<WidgetDeepLinkTarget, { kind: "artefact" }> | null {
  return target && target.date === effectiveDate && hasExactWidgetSource(entries, target)
    ? target
    : null;
}

/** A warm command must evict any expanded portal owned by another entry. */
export function shouldCollapseStackForWidgetTarget(
  entryId: string,
  target: Extract<WidgetDeepLinkTarget, { kind: "artefact" }> | null,
): boolean {
  return Boolean(target && target.entryId !== entryId);
}
