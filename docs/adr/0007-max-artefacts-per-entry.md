---
status: accepted
---

# Create enforces a maximum of 5 artefacts per entry; the database does not

Authoring allows up to five artefacts on a Paper or Print entry (create UI + save-path guard via `MAX_ARTEFACTS_PER_ENTRY`). The SQLite schema stays unconstrained so sync and legacy rows are not rejected. The cap is a product/UX rule, not a storage invariant — raising it later is a product change, not a migration.

## Considered options

- **Unlimited artefacts** — rejected for create: horizontal paging, Type-state Prev/Next, and add animation stay tractable with a small fixed bound.
- **DB CHECK constraint** — rejected: would break ingest of older or peer data that exceeds the cap and couples sync to a UI policy.
