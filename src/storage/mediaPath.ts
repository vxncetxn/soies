/** Stable database prefix for app-owned Print media. */
const ARTEFACTS_REFERENCE_PREFIX = "artefacts/";
/** Portion retained by legacy absolute paths whose iOS container UUID may change. */
const LEGACY_ARTEFACTS_MARKER = "/Documents/artefacts/";

function referenceForFileName(fileName: string): string | null {
  if (fileName.length === 0 || fileName.includes("/") || fileName === "." || fileName === "..") {
    return null;
  }
  return `${ARTEFACTS_REFERENCE_PREFIX}${fileName}`;
}

function appOwnedReference(path: string): string | null {
  if (path.startsWith(ARTEFACTS_REFERENCE_PREFIX)) {
    return referenceForFileName(path.slice(ARTEFACTS_REFERENCE_PREFIX.length));
  }

  if (!path.startsWith("file://")) {
    return null;
  }

  const markerIndex = path.indexOf(LEGACY_ARTEFACTS_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  const fileName = path.slice(markerIndex + LEGACY_ARTEFACTS_MARKER.length);
  return referenceForFileName(fileName);
}

/**
 * Convert a durable media reference into a URI rooted in the app's current
 * Documents directory. Legacy absolute iOS paths are deliberately rebased:
 * the OS may change the sandbox UUID while preserving every document byte.
 */
export function resolveStoredMediaPath(storedPath: string, currentDocumentUri: string): string {
  const reference = appOwnedReference(storedPath);
  if (reference === null) {
    return storedPath;
  }

  const documentRoot = currentDocumentUri.endsWith("/")
    ? currentDocumentUri
    : `${currentDocumentUri}/`;
  return `${documentRoot}${reference}`;
}

/** Persist only the app-owned relative reference, never an iOS sandbox UUID. */
export function toStoredMediaPath(fileUri: string): string {
  return appOwnedReference(fileUri) ?? fileUri;
}
