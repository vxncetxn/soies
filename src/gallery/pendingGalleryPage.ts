/**
 * Module-level pending Gallery page index.
 *
 * Set before the camera-shift navigates Home→Gallery so the Gallery pager can
 * land already snapped to the new item (no post-transition scroll chase).
 */
let pendingGalleryPage: number | null = null;

export function setPendingGalleryPage(index: number) {
  pendingGalleryPage = index;
}

export function consumePendingGalleryPage(): number | null {
  const next = pendingGalleryPage;
  pendingGalleryPage = null;
  return next;
}

export function peekPendingGalleryPage(): number | null {
  return pendingGalleryPage;
}
