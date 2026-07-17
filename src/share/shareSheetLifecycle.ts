export type ShareSheetPosition = {
  sheetIndex: 0 | 1;
  page: number;
};

export type ShareSheetPositionChange = {
  sheetIndex: 0 | 1;
  page?: number;
};

function boundedPage(requestedPage: number, artefactCount: number): number {
  if (artefactCount <= 0) {
    return 0;
  }
  const finitePage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0;
  return Math.min(Math.max(finitePage, 0), artefactCount - 1);
}

/**
 * Initial native detent and carousel page for both persistent and
 * session-scoped ShareSheet mounts. A session-scoped sheet first renders with
 * `open=true`, so it cannot rely on observing a later false-to-true transition.
 */
export function initialShareSheetPosition(
  open: boolean,
  requestedPage: number,
  artefactCount: number,
): ShareSheetPosition {
  if (!open || artefactCount <= 0) {
    return { sheetIndex: 0, page: 0 };
  }
  return { sheetIndex: 1, page: boundedPage(requestedPage, artefactCount) };
}

/** Return only the state fields that change when an existing sheet opens/closes. */
export function shareSheetPositionAfterOpenChange(
  previousOpen: boolean,
  open: boolean,
  requestedPage: number,
  artefactCount: number,
): ShareSheetPositionChange | null {
  if (open === previousOpen) {
    return null;
  }
  if (open && artefactCount > 0) {
    return { sheetIndex: 1, page: boundedPage(requestedPage, artefactCount) };
  }
  return { sheetIndex: 0 };
}
