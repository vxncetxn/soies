import * as Crypto from "expo-crypto";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";

export type UserRow = {
  id: string;
  name: string;
  email: string | null;
  avatar_path: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export async function getOrCreateUser(tx?: DbExecutor): Promise<UserRow> {
  return withTransaction(tx, async (db) => {
    const existing = await db.execute(
      "SELECT id, name, email, avatar_path, created_at, updated_at, deleted_at FROM users WHERE deleted_at IS NULL LIMIT 1",
    );

    if (existing.rows.length > 0) {
      return existing.rows[0] as UserRow;
    }

    const now = Date.now();
    const id = Crypto.randomUUID();

    await db.execute(
      "INSERT INTO users (id, name, email, avatar_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [id, "User", null, null, now, now],
    );

    return {
      id,
      name: "User",
      email: null,
      avatar_path: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
  });
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const db = await getDatabase();
  const result = await db.execute("SELECT COUNT(*) AS count FROM users");
  return Number(result.rows[0]?.count ?? 0) === 0;
}
