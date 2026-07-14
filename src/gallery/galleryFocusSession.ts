/**
 * State machine for the pager-owned Gallery focus overlay.
 *
 * A closing overlay keeps ownership of its target until the native close spring
 * settles. New requests are ignored during that interval, which prevents an old
 * completion callback from acting on a newly opened artefact.
 */
export type GalleryFocusSession<T> = {
  target: T;
  phase: "open" | "closing";
  removeOnComplete: boolean;
};

export function openGalleryFocus<T>(
  current: GalleryFocusSession<T> | null,
  target: T,
): GalleryFocusSession<T> {
  return current ?? { target, phase: "open", removeOnComplete: false };
}

export function closeGalleryFocus<T>(
  current: GalleryFocusSession<T> | null,
  { remove }: { remove: boolean },
): GalleryFocusSession<T> | null {
  if (!current) {
    return null;
  }
  return {
    ...current,
    phase: "closing",
    removeOnComplete: current.removeOnComplete || remove,
  };
}

export function completeGalleryFocus<T>(current: GalleryFocusSession<T> | null): {
  next: null;
  removeTarget: T | null;
} {
  return {
    next: null,
    removeTarget: current?.removeOnComplete ? current.target : null,
  };
}
