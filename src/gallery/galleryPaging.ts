type GalleryIdentityRow = {
  artefact: { id: string };
};

function pageAtOffset(offset: number, pageWidth: number): number {
  if (pageWidth <= 0) {
    return 0;
  }
  return Math.round(offset / pageWidth);
}

export function artefactIdAtGalleryOffset(
  galleryArtefacts: readonly GalleryIdentityRow[],
  offset: number,
  pageWidth: number,
): string | null {
  if (galleryArtefacts.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.min(galleryArtefacts.length - 1, pageAtOffset(offset, pageWidth)));
  return galleryArtefacts[index]?.artefact.id ?? null;
}

export function resolvePendingGalleryPage({
  galleryArtefacts,
  pendingArtefactId,
  measuredContentWidth,
  pageWidth,
}: {
  galleryArtefacts: readonly GalleryIdentityRow[];
  pendingArtefactId: string;
  measuredContentWidth: number;
  pageWidth: number;
}): number | null {
  if (pageWidth <= 0) {
    return null;
  }
  const index = galleryArtefacts.findIndex(
    (galleryArtefact) => galleryArtefact.artefact.id === pendingArtefactId,
  );
  if (index < 0 || measuredContentWidth < (index + 1) * pageWidth) {
    return null;
  }
  return index;
}

/**
 * Complete the pager's pending-ID handoff only when both React rows and native
 * content are ready and the native ref accepts the jump. Keeping this sequence
 * together prevents a failed first-layout command from consuming navigation.
 */
export function navigateToPendingGalleryArtefact({
  galleryArtefacts,
  pendingArtefactId,
  measuredContentWidth,
  pageWidth,
  jumpToIndex,
  onNavigated,
}: {
  galleryArtefacts: readonly GalleryIdentityRow[];
  pendingArtefactId: string;
  measuredContentWidth: number;
  pageWidth: number;
  jumpToIndex: (index: number, animated: boolean) => boolean;
  onNavigated: (artefactId: string) => void;
}): boolean {
  const index = resolvePendingGalleryPage({
    galleryArtefacts,
    pendingArtefactId,
    measuredContentWidth,
    pageWidth,
  });
  if (index == null || !jumpToIndex(index, false)) {
    return false;
  }
  onNavigated(pendingArtefactId);
  return true;
}

export function resolveGalleryIdentityPage({
  galleryArtefacts,
  activeArtefactId,
  fallbackIndex,
}: {
  galleryArtefacts: readonly GalleryIdentityRow[];
  activeArtefactId: string | null;
  fallbackIndex: number;
}): { artefactId: string; index: number } | null {
  if (galleryArtefacts.length === 0) {
    return null;
  }
  const identityIndex = galleryArtefacts.findIndex(
    (galleryArtefact) => galleryArtefact.artefact.id === activeArtefactId,
  );
  const index =
    identityIndex >= 0
      ? identityIndex
      : Math.max(0, Math.min(galleryArtefacts.length - 1, fallbackIndex));
  const artefactId = galleryArtefacts[index]?.artefact.id;
  return artefactId ? { artefactId, index } : null;
}
