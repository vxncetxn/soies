import { wipeMediaDir } from "../storage/files";
import { resetDatabase } from "./client";
import { isDatabaseEmpty } from "./repositories/users";
import { seed } from "./seed";
import { verifySeedData } from "./verifySeed";

let initPromise: Promise<void> | null = null;

async function runInitOnce(): Promise<void> {
  const shouldReseed = __DEV__ && process.env.EXPO_PUBLIC_RESEED === "1";

  if (shouldReseed) {
    await wipeMediaDir();
    await resetDatabase();
    await seed();
    await verifySeedData();
    return;
  }

  const empty = await isDatabaseEmpty();
  if (empty) {
    await seed();
    if (__DEV__) {
      await verifySeedData();
    }
  }
}

/**
 * Single-flight database startup. StrictMode remounts must share one promise so
 * two concurrent `isDatabaseEmpty → seed` (or reseed wipe/seed) sequences cannot
 * race. On rejection the mutex clears so DatabaseProvider retry still works.
 */
export async function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = runInitOnce().catch((error) => {
      initPromise = null;
      throw error;
    });
  }

  return initPromise;
}
