import { open, type DB } from "@op-engineering/op-sqlite";

import { runMigrations } from "./migrations";

const DB_NAME = "soies.sqlite";

let dbInstance: DB | null = null;
let initPromise: Promise<DB> | null = null;

async function openAndMigrate(): Promise<DB> {
  const db = open({ name: DB_NAME });
  await runMigrations(db);
  return db;
}

export async function getDatabase(): Promise<DB> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!initPromise) {
    initPromise = openAndMigrate()
      .then((db) => {
        dbInstance = db;
        return db;
      })
      .catch((error) => {
        // Clear the failed promise so a later getDatabase() can retry from
        // scratch. Without this, a transient init failure (e.g. a migration
        // error) would leave initPromise as a permanently rejected promise and
        // every subsequent call would re-return the same rejection — the app
        // could never recover without a full restart.
        initPromise = null;
        throw error;
      });
  }

  return initPromise;
}

export async function resetDatabase(): Promise<DB> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance.delete();
    dbInstance = null;
  }

  initPromise = null;
  return getDatabase();
}
