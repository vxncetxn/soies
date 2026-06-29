---
status: accepted
---

# Timestamps as INTEGER Unix ms (UTC); date as TEXT

Sync uses last-write-wins by `updated_at`/`deleted_at`, so timestamps must compare cheaply and unambiguously; TEXT ISO only sorts lexically if every value is strictly UTC with a `Z` and fixed fractional digits (any zoned value silently breaks ordering), and string compare is slower on indexed columns. `created_at`/`updated_at`/`deleted_at` are `INTEGER` Unix milliseconds (UTC); `date` (the user-facing, editable calendar Day) stays `TEXT 'YYYY-MM-DD'` — it's independent of `created_at` (back-dating, re-dating, timezone edges make them diverge). Timestamps are formatted to ISO only at the sync-export boundary.

## Considered options

- **TEXT ISO 8601 UTC throughout** — rejected: lexical-compare footgun and slower.
- **TEXT ISO with local offsets** — rejected: breaks ordering entirely.
