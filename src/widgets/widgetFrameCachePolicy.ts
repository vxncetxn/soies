/**
 * widgetFrameCachePolicy — pure naming, invalidation, and retention rules.
 *
 * This file intentionally has no Expo filesystem dependency so renderer
 * revision changes and two-generation cleanup can be exhaustively unit-tested.
 */
/**
 * Bump whenever frame geometry or capture rendering changes incompatibly.
 * Revision 6 invalidates captures whose Print captions still use the former
 * two-line, left-aligned policy; data revision alone cannot detect that visual
 * renderer change.
 */
export const WIDGET_FRAME_RENDERER_VERSION = 6;
/** Restricts cleanup to files owned by this feature. */
export const WIDGET_FRAME_PREFIX = "featured-artefact-";

/** Preserve readable IDs while preventing path separators or unsafe filename bytes. */
function safeFileComponent(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Immutable cache identity: source + source revision + renderer revision. */
export function widgetFrameFileName(artefactId: string, frameRevision: number): string {
  return `${WIDGET_FRAME_PREFIX}${safeFileComponent(artefactId)}-${frameRevision}-r${WIDGET_FRAME_RENDERER_VERSION}.png`;
}

/** Select only feature-owned files absent from the protected publication set. */
export function unreferencedWidgetFrameNames(
  candidateNames: readonly string[],
  referencedNames: ReadonlySet<string>,
): string[] {
  return candidateNames.filter(
    (name) => name.startsWith(WIDGET_FRAME_PREFIX) && !referencedNames.has(name),
  );
}

/**
 * Keep both the current and immediately previous successful publication alive.
 * A frame disappears from this union only on the pass after WidgetKit was told
 * to stop using it, which gives the extension one complete reload boundary.
 */
export function protectedWidgetFrameUris(
  previous: ReadonlySet<string> | null,
  current: ReadonlySet<string>,
): string[] | null {
  return previous ? [...new Set([...previous, ...current])] : null;
}
