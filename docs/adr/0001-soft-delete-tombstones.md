---
status: accepted
---

# Soft-delete tombstones; no ON DELETE CASCADE

Future device-to-device sync (Dropbox/iCloud, no server) keeps a full local copy per peer, so a hard delete is invisible to sync and makes deleted rows resurrect from stale peers — and tombstones can't be retrofitted once past deletes are physically gone. Every table has a nullable `deleted_at`; deletion sets it and reads filter `deleted_at IS NULL`, and we use no `ON DELETE CASCADE` (cascades only fire on a hard `DELETE` and would destroy child tombstones) — descendants are soft-deleted in app logic instead.

Gallery membership has independent intent. Soft-deleting an artefact leaves its active Gallery membership intact but hidden by Gallery's join against live parents, so Undo makes the artefact visible again in the same featured position. Only an explicit Remove from Gallery tombstones the membership itself. Active hidden memberships still count toward Gallery's ten-artefact capacity because they can become visible again through Undo.

## Considered options

- **Hard-delete now, add tombstones later** — rejected: past deletes are unrecoverable and resurrect on sync.
- **Hybrid: parent-only tombstone** — rejected: child tombstones are needed for independent sync/restore and per-row conflict resolution.
