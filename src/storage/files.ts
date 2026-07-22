import { randomUUID } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

import { resolveStoredMediaPath, toStoredMediaPath } from "./mediaPath";

const ARTIFACTS_DIR = "artefacts";
const INK_OVERLAY_EXT = "ink.png";

/** Filename policy for Ink overlay PNGs — kept in storage (not data/). */
export function inkOverlayFileName(artefactId: string): string {
  return `${artefactId}.${INK_OVERLAY_EXT}`;
}

function artifactsDirectory(): Directory {
  return new Directory(Paths.document, ARTIFACTS_DIR);
}

function deleteFileBestEffort(file: File): void {
  try {
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Cleanup must not turn a successful atomic install into a failed save.
  }
}

export async function ensureArtifactsDir(): Promise<void> {
  const dir = artifactsDirectory();
  if (!dir.exists) {
    dir.create();
  }
}

export async function saveMediaFile(
  srcUri: string,
  artefactId: string,
  ext: string,
): Promise<string> {
  await ensureArtifactsDir();
  const destination = new File(artifactsDirectory(), `${artefactId}.${ext}`);
  const source = new File(srcUri);
  // File.copy is async in Expo SDK 57 — must await or the DB can commit before
  // bytes land (and failures become unhandled rejections).
  await source.copy(destination);
  return toStoredMediaPath(destination.uri);
}

/** Persist (or replace) the Ink overlay PNG for an artefact. */
export async function saveInkOverlayFile(srcUri: string, artefactId: string): Promise<string> {
  await ensureArtifactsDir();
  const destinationUri = new File(artifactsDirectory(), inkOverlayFileName(artefactId)).uri;
  const temporary = new File(artifactsDirectory(), `.${artefactId}.${randomUUID()}.ink.tmp`);
  const backup = new File(artifactsDirectory(), `.${artefactId}.${randomUUID()}.ink.backup`);
  const temporaryUri = temporary.uri;
  const backupUri = backup.uri;
  const source = new File(srcUri);
  let previousMovedToBackup = false;
  let temporaryInstalled = false;
  let backupCleanupAllowed = true;

  try {
    // Copy bytes to a sibling first. A failed source read therefore cannot
    // destroy the durable overlay that Home may currently be displaying.
    await source.copy(temporary);

    const currentDestination = new File(destinationUri);
    if (currentDestination.exists) {
      await currentDestination.move(backup);
      previousMovedToBackup = true;
    }

    await temporary.move(new File(destinationUri));
    temporaryInstalled = true;
    deleteFileBestEffort(backup);
    return destinationUri;
  } catch (error) {
    // Restore the previous durable file if installing the fully-written
    // sibling failed after we moved the old version aside.
    const destination = new File(destinationUri);
    if (!destination.exists && previousMovedToBackup && backup.exists) {
      try {
        await backup.move(destination);
      } catch (restoreError) {
        // Retain the backup under its unique sibling path for recovery rather
        // than converting one failed replacement into permanent data loss.
        backupCleanupAllowed = false;
        const detail = restoreError instanceof Error ? restoreError.message : String(restoreError);
        throw new Error(`Ink overlay replacement failed and rollback failed: ${detail}`);
      }
    }
    throw error;
  } finally {
    const remainingTemporary = new File(temporaryUri);
    if (!temporaryInstalled) {
      deleteFileBestEffort(remainingTemporary);
    }
    const remainingBackup = new File(backupUri);
    if (backupCleanupAllowed) {
      deleteFileBestEffort(remainingBackup);
    }
  }
}

export function inkOverlayUriForArtefact(artefactId: string): string {
  return new File(artifactsDirectory(), inkOverlayFileName(artefactId)).uri;
}

/** Resolve stable and legacy database values against this launch's Documents root. */
export function mediaUriForStoredPath(path: string): string {
  return resolveStoredMediaPath(path, Paths.document.uri);
}

export async function deleteInkOverlayFile(artefactId: string): Promise<void> {
  const file = new File(artifactsDirectory(), inkOverlayFileName(artefactId));
  if (file.exists) {
    file.delete();
  }
}

export async function deleteMediaFile(path: string): Promise<void> {
  const file = new File(mediaUriForStoredPath(path));
  if (file.exists) {
    file.delete();
  }
}

export async function wipeMediaDir(): Promise<void> {
  const dir = artifactsDirectory();
  if (dir.exists) {
    dir.delete();
  }
}
