import type { DbExecutor } from "./executor";

export function extractSearchableText(data: string): string {
  try {
    const parsed = JSON.parse(data) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

export async function indexEntryTitle(
  db: DbExecutor,
  entryRowid: number,
  title: string,
): Promise<void> {
  await db.execute("INSERT INTO entries_fts(entry_rowid, title) VALUES (?, ?)", [
    entryRowid,
    title,
  ]);
}

export async function reindexEntryTitle(
  db: DbExecutor,
  entryRowid: number,
  title: string,
): Promise<void> {
  await db.execute("DELETE FROM entries_fts WHERE entry_rowid = ?", [entryRowid]);
  await indexEntryTitle(db, entryRowid, title);
}

export async function removeEntryFromFts(db: DbExecutor, entryRowid: number): Promise<void> {
  await db.execute("DELETE FROM entries_fts WHERE entry_rowid = ?", [entryRowid]);
}

export async function indexArtefactText(
  db: DbExecutor,
  artefactRowid: number,
  entryRowid: number,
  text: string,
): Promise<void> {
  await db.execute(
    "INSERT INTO artefacts_fts(artefact_rowid, entry_rowid, text) VALUES (?, ?, ?)",
    [artefactRowid, entryRowid, text],
  );
}

export async function reindexArtefactText(
  db: DbExecutor,
  artefactRowid: number,
  entryRowid: number,
  text: string,
): Promise<void> {
  await db.execute("DELETE FROM artefacts_fts WHERE artefact_rowid = ?", [artefactRowid]);
  await indexArtefactText(db, artefactRowid, entryRowid, text);
}

export async function removeArtefactFromFts(db: DbExecutor, artefactRowid: number): Promise<void> {
  await db.execute("DELETE FROM artefacts_fts WHERE artefact_rowid = ?", [artefactRowid]);
}

export async function getEntryRowid(db: DbExecutor, entryId: string): Promise<number | null> {
  const result = await db.execute("SELECT rowid FROM entries WHERE id = ?", [entryId]);
  const rowid = result.rows[0]?.rowid;
  return rowid == null ? null : Number(rowid);
}

export async function getArtefactRowid(db: DbExecutor, artefactId: string): Promise<number | null> {
  const result = await db.execute("SELECT rowid FROM artefacts WHERE id = ?", [artefactId]);
  const rowid = result.rows[0]?.rowid;
  return rowid == null ? null : Number(rowid);
}

export function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .replace(/["']/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(" ");
}
