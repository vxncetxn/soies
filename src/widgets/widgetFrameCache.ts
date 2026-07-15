/**
 * widgetFrameCache — revisioned raster bytes in Expo's shared widget directory.
 *
 * Slot rows never persist file paths. A deterministic Artefact/revision/
 * renderer filename makes cache hits synchronous and invalidation automatic.
 * Installs copy view-shot temporaries into the app-group container; cleanup is
 * best-effort and receives publication generations chosen by the controller.
 *
 * Map:
 * - URI lookup is the fast path used by reconciliation and carousel previews;
 * - installation creates immutable revision files idempotently;
 * - removal/collection never roll back durable slot intent on filesystem error.
 */
import { Directory, File } from "expo-file-system";
import { widgetsDirectory } from "expo-widgets";

import type { OccupiedFeaturedWidgetSlot } from "../db/repositories/featuredWidgetSlots";

import { unreferencedWidgetFrameNames, widgetFrameFileName } from "./widgetFrameCachePolicy";

export { WIDGET_FRAME_RENDERER_VERSION, widgetFrameFileName } from "./widgetFrameCachePolicy";

function widgetCacheDirectory(): Directory {
  return new Directory(widgetsDirectory);
}

/** Resolve one deterministic cache file without creating directories or bytes. */
function widgetFrameFile(artefactId: string, frameRevision: number): File {
  return new File(widgetCacheDirectory(), widgetFrameFileName(artefactId, frameRevision));
}

export function cachedWidgetFrameUriForRevision(
  artefactId: string,
  frameRevision: number,
): string | undefined {
  const file = widgetFrameFile(artefactId, frameRevision);
  return file.exists ? file.uri : undefined;
}

/** Slot-shaped convenience lookup used by publication and management UI. */
export function cachedWidgetFrameUri(slot: OccupiedFeaturedWidgetSlot): string | undefined {
  return cachedWidgetFrameUriForRevision(slot.artefact.id, slot.frameRevision);
}

/**
 * Copy a completed view-shot temporary into the shared widget container.
 * Filenames are immutable by revision, so an existing destination is already
 * the exact requested render and can be reused without another filesystem write.
 */
export async function installWidgetFrame(
  temporaryUri: string,
  artefactId: string,
  frameRevision: number,
): Promise<string> {
  const directory = widgetCacheDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  const destination = widgetFrameFile(artefactId, frameRevision);
  if (!destination.exists) {
    await new File(temporaryUri).copy(destination);
  }
  return destination.uri;
}

export function removeWidgetFrame(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A failed best-effort cleanup must never undo a successful slot commit.
  }
}

/** Run only after a successful publish so the previous snapshot never loses bytes. */
export function cleanUnreferencedWidgetFrames(referencedUris: readonly string[]): void {
  const directory = widgetCacheDirectory();
  if (!directory.exists) {
    return;
  }
  const children = directory.list();
  const staleNames = unreferencedWidgetFrameNames(
    children.filter((child): child is File => child instanceof File).map((file) => file.name),
    new Set(referencedUris.map((uri) => new File(uri).name)),
  );
  for (const name of staleNames) {
    removeWidgetFrame(new File(directory, name).uri);
  }
}
