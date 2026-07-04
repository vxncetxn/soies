import type { QueryResult, Scalar, Transaction } from "@op-engineering/op-sqlite";

import { getDatabase } from "./client";

/**
 * Minimal executor interface — the subset of op-sqlite's `DB` that the
 * repositories and FTS helpers actually use (just `execute`). Both a top-level
 * `DB` and a `Transaction` satisfy it, so a repository function can run either
 * standalone (on the singleton DB, wrapped in its own transaction via
 * {@link withTransaction}) or inside a caller-managed transaction (the caller
 * passes its `Transaction` straight through).
 */
export type DbExecutor = {
  execute: (query: string, params?: Scalar[]) => Promise<QueryResult>;
};

/**
 * Run `body` inside a transaction.
 *
 * - If `tx` is provided, the caller already has a transaction open (e.g. the
 *   seed wraps every insert in one), so we reuse it and run `body` directly on
 *   it. No nested transaction is opened.
 * - Otherwise we open a transaction on the singleton DB and run `body` on it.
 *
 * op-sqlite auto-commits when `body` resolves and auto-rolls-back (re-throwing)
 * when `body` rejects, so a multi-statement mutation — e.g. writing a row and
 * then maintaining its FTS index — is atomic in both cases: the row and its FTS
 * entry either commit together or not at all, which keeps the search index
 * consistent with the base tables.
 */
export async function withTransaction<T>(
  tx: DbExecutor | undefined,
  body: (executor: DbExecutor) => Promise<T>,
): Promise<T> {
  if (tx) {
    return body(tx);
  }

  const db = await getDatabase();
  const holder: { value?: T } = {};
  await db.transaction(async (transaction: Transaction) => {
    holder.value = await body(transaction);
  });
  return holder.value as T;
}
