/**
 * Module-level pending Gallery artefact identity.
 *
 * Add sets this before navigating Home→Gallery. The pager leaves it intact
 * until refreshed rows contain that identity, then resolves the current index
 * and clears it. Identity survives async refreshes and order changes; a numeric
 * page would be consumed against stale rows and land on the previous artefact.
 */
let pendingGalleryArtefactId: string | null = null;

export function setPendingGalleryArtefact(artefactId: string) {
  pendingGalleryArtefactId = artefactId;
}

export function getPendingGalleryArtefact(): string | null {
  return pendingGalleryArtefactId;
}

export function clearPendingGalleryArtefact(artefactId: string) {
  if (pendingGalleryArtefactId === artefactId) {
    pendingGalleryArtefactId = null;
  }
}
