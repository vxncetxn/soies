import { wipeMediaDir } from "../storage/files";
import { resetDatabase } from "./client";
import { isDatabaseEmpty } from "./repositories/users";
import { seed } from "./seed";
import { verifySeedData } from "./verifySeed";

export async function initDatabase(): Promise<void> {
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
