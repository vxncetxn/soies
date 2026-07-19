import type { DB } from "@op-engineering/op-sqlite";

type Migration = {
  version: number;
  statements: string[];
};

const MIGRATION_V1: Migration = {
  version: 1,
  statements: [
    `CREATE TABLE users (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT,
      avatar_path TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    )`,
    `CREATE TABLE entries (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      type       TEXT NOT NULL,
      date       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    "CREATE INDEX idx_entries_date_order ON entries(date, sort_order)",
    `CREATE TABLE artefacts (
      id         TEXT PRIMARY KEY,
      entry_id   TEXT NOT NULL REFERENCES entries(id),
      type       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    "CREATE INDEX idx_artefacts_entry_order ON artefacts(entry_id, sort_order)",
    `CREATE TABLE tags (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )`,
    "CREATE UNIQUE INDEX idx_tags_name_active ON tags(name) WHERE deleted_at IS NULL",
    `CREATE TABLE entry_tags (
      entry_id   TEXT NOT NULL REFERENCES entries(id),
      tag_id     TEXT NOT NULL REFERENCES tags(id),
      created_at INTEGER NOT NULL,
      deleted_at INTEGER,
      PRIMARY KEY (entry_id, tag_id)
    )`,
    "CREATE INDEX idx_entry_tags_tag ON entry_tags(tag_id, deleted_at)",
    `CREATE VIRTUAL TABLE entries_fts USING fts5(
      entry_rowid UNINDEXED,
      title,
      tokenize='unicode61'
    )`,
    `CREATE VIRTUAL TABLE artefacts_fts USING fts5(
      artefact_rowid UNINDEXED,
      entry_rowid    UNINDEXED,
      text,
      tokenize='unicode61'
    )`,
  ],
};

/** Opaque Ink JSON column (ADR-0008); nullable for artefacts without Ink. */
const MIGRATION_V2: Migration = {
  version: 2,
  statements: ["ALTER TABLE artefacts ADD COLUMN annotations TEXT"],
};

/**
 * Five stable widget positions.
 *
 * Empty positions have no active row. Keeping the slot number as the primary
 * key makes replacement deterministic, while the partial unique index protects
 * the one-slot-per-artefact invariant without preventing a tombstoned row from
 * being replaced later.
 */
const MIGRATION_V3: Migration = {
  version: 3,
  statements: [
    `CREATE TABLE featured_widget_slots (
      slot_index  INTEGER PRIMARY KEY CHECK(slot_index BETWEEN 1 AND 5),
      artefact_id TEXT NOT NULL REFERENCES artefacts(id),
      assigned_at INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      deleted_at  INTEGER
    )`,
    `CREATE UNIQUE INDEX idx_featured_widget_slots_artefact_active
     ON featured_widget_slots(artefact_id)
     WHERE deleted_at IS NULL`,
  ],
};

/**
 * Persist the User's immutable local creation Day separately from its UTC
 * timestamp. Rebuilding the unreferenced users table gives the field a real
 * NOT NULL invariant; existing rows receive a one-time local-date backfill.
 * The partial Recent index keeps keyset reads bounded even after tombstones
 * accumulate and covers the stable Entry-ID ordering term.
 */
const MIGRATION_V4: Migration = {
  version: 4,
  statements: [
    `CREATE TABLE users_v4 (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      email        TEXT,
      avatar_path  TEXT,
      creation_day TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL,
      deleted_at   INTEGER
    )`,
    `INSERT INTO users_v4 (
       id, name, email, avatar_path, creation_day, created_at, updated_at, deleted_at
     )
     SELECT id, name, email, avatar_path,
            strftime('%Y-%m-%d', created_at / 1000.0, 'unixepoch', 'localtime'),
            created_at, updated_at, deleted_at
     FROM users`,
    "DROP TABLE users",
    "ALTER TABLE users_v4 RENAME TO users",
    `CREATE INDEX idx_entries_recent_active
     ON entries(date DESC, sort_order DESC, id DESC)
     WHERE deleted_at IS NULL`,
  ],
};

/**
 * Repair development databases that V4 legitimately backfilled from the old
 * seed User's wall-clock timestamp. Clean installs already seed January 2026;
 * the full fixture fingerprint keeps this correction away from real Users.
 */
const MIGRATION_V5: Migration = {
  version: 5,
  statements: [
    `UPDATE users
     SET creation_day = '2026-01-01',
         created_at = 1767268800000
     WHERE name = 'User'
       AND email IS NULL
       AND deleted_at IS NULL
       AND (
         SELECT COUNT(DISTINCT title)
         FROM entries
         WHERE title IN (
           'An example entry that is very long',
           'kiyomizudera',
           'day in retro'
         )
       ) = 3
       AND EXISTS (
         SELECT 1
         FROM tags
         WHERE name = 'Japan 2026'
       )`,
  ],
};

/**
 * Current contiguous schema sequence. V5 is the sole data-only compatibility
 * repair because installed development fixtures had already committed V4's
 * legitimate timestamp backfill before the deterministic seed date existed.
 */
const MIGRATIONS: Migration[] = [
  MIGRATION_V1,
  MIGRATION_V2,
  MIGRATION_V3,
  MIGRATION_V4,
  MIGRATION_V5,
];

export async function runMigrations(db: DB): Promise<void> {
  const versionResult = await db.execute("PRAGMA user_version");
  const version = Number(versionResult.rows[0]?.user_version ?? 0);

  for (const migration of MIGRATIONS) {
    if (migration.version <= version) {
      continue;
    }

    // Append the version bump as the final statement so it commits atomically
    // with the schema inside executeBatch's transaction. PRAGMA user_version is
    // transactional (SQLite rolls it back on ROLLBACK and persists it on
    // COMMIT), so a crash mid-migration leaves no partial state: either the
    // whole migration (schema + version) commits, or none of it does, and the
    // migration re-runs cleanly on the next launch.
    const statements = [...migration.statements, `PRAGMA user_version = ${migration.version}`];
    await db.executeBatch(statements.map((statement) => [statement]));
  }
}
