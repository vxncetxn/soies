---
status: accepted
---

# Soft-delete tombstones; no ON DELETE CASCADE

Future device-to-device sync (Dropbox/iCloud, no server) keeps a full local copy per peer, so a hard delete is invisible to sync and makes deleted rows resurrect from stale peers — and tombstones can't be retrofitted once past deletes are physically gone. Every table has a nullable `deleted_at`; deletion sets it and reads filter `deleted_at IS NULL`, and we use no `ON DELETE CASCADE` (cascades only fire on a hard `DELETE` and would destroy child tombstones) — descendants are soft-deleted in app logic instead.

## Considered options

- **Hard-delete now, add tombstones later** — rejected: past deletes are unrecoverable and resurrect on sync.
- **Hybrid: parent-only tombstone** — rejected: child tombstones are needed for independent sync/restore and per-row conflict resolution.
