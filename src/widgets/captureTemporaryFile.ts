/**
 * Consume a native view-shot temporary and release it on every settlement path.
 * Keeping this boundary platform-independent makes success/error cleanup
 * testable without mounting React Native or touching the shared widget cache.
 */
export async function withReleasedCapture<T>(
  temporaryUri: string,
  consume: (uri: string) => Promise<T>,
  release: (uri: string) => void,
): Promise<T> {
  try {
    return await consume(temporaryUri);
  } finally {
    release(temporaryUri);
  }
}
