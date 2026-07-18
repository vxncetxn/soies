---
status: accepted
---

# Calendar browsing uses a native sheet with a warm shell and lazy content

The Home date control opens a `@swmansion/react-native-bottom-sheet` modal sheet instead of a fullscreen Portal bloom. A lightweight shell remains mounted at the zero detent so native movement can begin immediately, while the Recent and Monthly virtualized trees mount only after opening starts and are released after the zero detent settles. After Home's first paint, idle work may warm only the first Recent page and the current/previous month's lightweight marker summaries; full Day data stays in a bounded LRU and is loaded on demand.

This supersedes only the calendar-specific part of ADR-0005. Focus, entry expand/collapse, Create, and their Portal infrastructure do not change, and removal of the dormant fullscreen bloom and legacy `MorphOverlay` paths is deferred to a separate cleanup.

## Considered options

- **Keep the complete calendar mounted inside the bloom** — rejected because startup work and retained memory grow before the feature is used (PERF-04).
- **Mount the complete sheet only after the tap** — rejected because native presentation would compete with list construction on the cold path.
- **Retain all Recent and Monthly content while the sheet is closed** — rejected because it recreates the eager-memory problem behind a different surface.
- **Use a Stack modal route or a custom Portal sheet** — rejected because this is not a destination and the existing native sheet already supplies detents, scrim, drag dismissal, and settle callbacks.

## Consequences

Opening performance is a contract: release builds on physical iOS and Android devices must keep p95 tap-to-first-nonzero-sheet-position at or below 50 ms on warm and cold-data paths. A cold-data open may show layout-stable placeholders, but it must start the same native motion. Cache sizes, retry paths, and teardown-after-settle are explicit rather than process-lifetime side effects.
