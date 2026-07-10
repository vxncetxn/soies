import { Directory, File, Paths } from "expo-file-system";

const ARTIFACTS_DIR = "artefacts";

function artifactsDirectory(): Directory {
  return new Directory(Paths.document, ARTIFACTS_DIR);
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
  return destination.uri;
}

export async function deleteMediaFile(path: string): Promise<void> {
  const file = new File(path);
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
