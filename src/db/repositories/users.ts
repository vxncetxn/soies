import * as Crypto from "expo-crypto";

import { isValidISODate, todayISO } from "../../utils/date";
import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  avatar_path: string | null;
  creation_day: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

type UserCreationDefaults = {
  creationDay: string;
  createdAt: number;
};

export async function getOrCreateUser(
  tx?: DbExecutor,
  defaults?: UserCreationDefaults,
): Promise<UserRow> {
  return withTransaction(tx, async (db) => {
    const existing = await db.execute(
      "SELECT id, name, email, avatar_path, creation_day, created_at, updated_at, deleted_at FROM users WHERE deleted_at IS NULL LIMIT 1",
    );

    if (existing.rows.length > 0) {
      return existing.rows[0] as UserRow;
    }

    const now = defaults?.createdAt ?? Date.now();
    const creationDay = defaults?.creationDay ?? todayISO();
    if (!isValidISODate(creationDay)) {
      throw new Error("User Creation Day must be a valid ISO Day.");
    }
    const id = Crypto.randomUUID();

    await db.execute(
      "INSERT INTO users (id, name, email, avatar_path, creation_day, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, "User", null, null, creationDay, now, now],
    );

    return {
      id,
      name: "User",
      email: null,
      avatar_path: null,
      creation_day: creationDay,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  });
}

export async function getUserCreationDay(tx?: DbExecutor): Promise<string> {
  const db = tx ?? (await getDatabase());
  const result = await db.execute(
    "SELECT creation_day FROM users WHERE deleted_at IS NULL LIMIT 1",
  );
  const creationDay = result.rows[0]?.creation_day;
  if (typeof creationDay !== "string" || !isValidISODate(creationDay)) {
    throw new Error("User Creation Day is unavailable.");
  }
  return creationDay;
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute("SELECT COUNT(*) AS count FROM users");
  return Number(result.rows[0]?.count ?? 0) === 0;
}
