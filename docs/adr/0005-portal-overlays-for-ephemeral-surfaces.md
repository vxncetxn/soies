---
status: accepted
---

# Portal overlays for ephemeral in-place surfaces

Ephemeral, in-place, animation-heavy UI (calendar morph, entry expand/collapse, long-press entry focus) uses **Portal overlays** rendered into root-level hosts (`morph`, `overlay`), not Expo Router Stack routes. Stack routes are reserved for true destinations (tabs, deep-linkable screens). Calendar date picking and entry focus are transient peek surfaces — not routable, not back-stack-worthy — and need measure-and-morph animations, preloaded content, and navigate-behind-closing-overlay behaviour that Stack modal presentation cannot provide without reimplementing the same Portal machinery inside a transparent route.

## Considered options

- **Stack modal routes for calendar/focus** — rejected: forfeits morph-from-trigger, preload-without-mount, and navigate-behind-overlay; only wins on URL/back-stack addressability, which these surfaces don't need.
- **Single Portal host** — rejected for calendar vs expand: calendar needs edge-to-edge (`morph` outside SafeAreaView); expanded stack respects safe areas (`overlay` inside).
