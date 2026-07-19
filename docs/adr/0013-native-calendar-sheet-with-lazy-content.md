---
status: accepted
---

# Calendar browsing uses a native sheet with bounded prepared content

The Home date control opens a `@swmansion/react-native-bottom-sheet` modal sheet instead of a fullscreen Portal bloom. A lightweight shell remains mounted at the zero detent so native movement can begin immediately. After Home's first paint, idle work warms the first Recent page plus the current/previous month's lightweight marker summaries, then prepares and retains both virtualized tab trees while the sheet is hidden. An immediate first open uses a next-frame fallback without holding native presentation for that preparation.

Keeping the bounded browse trees mounted is intentional. Device testing showed that rebuilding canonical first-Artefact renderers and Monthly marker views at every open or tab visit exposed a visible white/marker rehydration flash. After the zero detent settles, Recent is trimmed back to its first page and both native lists reset while hidden; Monthly discards marker state outside the current/previous-month window. Full Day data remains separate in an eight-Day LRU and is loaded on demand. This avoids both the observed rehydration flash and the former whole-journal/blur retention.

This supersedes only the calendar-specific part of ADR-0005. Focus, entry expand/collapse, Create, and their Portal infrastructure do not change, and removal of the dormant fullscreen bloom and legacy `MorphOverlay` paths is deferred to a separate cleanup.

## Considered options

- **Keep the complete calendar mounted inside the bloom** — rejected because startup work and retained memory grow before the feature is used (PERF-04).
- **Mount the complete sheet only after the tap** — rejected because native presentation would compete with list construction on the cold path.
- **Rebuild each tab on every open or tab visit** — rejected after device evidence showed canonical preview and marker rehydration flashes.
- **Retain unbounded Recent pages and every visited month while closed** — rejected because it recreates the eager-memory problem behind a different surface. The accepted lifecycle retains both virtualized trees but resets them to bounded prepared windows while hidden.
- **Use a Stack modal route or a custom Portal sheet** — rejected because this is not a destination and the existing native sheet already supplies detents, scrim, drag dismissal, and settle callbacks.

## Consequences

Opening performance is a contract: release builds on physical iOS and Android devices must keep p95 tap-to-first-nonzero-sheet-position at or below 50 ms on warm and cold-data paths. A cold-data open may show a layout-stable placeholder, but it must start the same native motion. Cache sizes, retry paths, hidden-state resets, and the retained-tree bounds are explicit rather than process-lifetime side effects.
