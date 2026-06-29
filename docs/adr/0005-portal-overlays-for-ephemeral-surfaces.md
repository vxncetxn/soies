---
status: accepted
---

# Portal overlays for ephemeral surfaces; Stack routes for destinations

Ephemeral, in-place, animation-heavy surfaces (calendar morph, entry expand, long-press focus menu) use **Portal overlays** rendered into dedicated hosts (`morph`, `overlay`) — they are transient, not deep-linkable, and not back-stack-worthy. **Stack routes** are reserved for true destinations (tabs, future settings, etc.) where URL, hardware back, and navigation history matter. The calendar stays a Portal morph (date deep-linking lives on the index route's `date` param); long-press focus is a new Portal `FocusOverlay` with blur backdrop and action chips, not a route.

## Consequences

- Free back/gesture/URL semantics from Stack navigation are foregone for these surfaces — acceptable because they are intentionally non-routable focus stages, not destinations.
- Portal hosts must sit outside blur targets and safe-area clipping where edge-to-edge morphs need it (`morph` host is a sibling of `BlurTargetView`-wrapped home content).
- Multiple overlay families share morph math (`useMorphFromTrigger`) but compose different layers (fullscreen calendar vs blur + clone + chip menu).

## Considered options

- **Stack routes for calendar / focus** — rejected: surfaces are ephemeral menu-invocation stages, not navigable destinations; routability would imply deep-linkable state that does not exist.
- **Live interactive Stack above blur** — rejected for focus: React Native cannot reliably stack a live, interactive entry above a full-screen blur; focus uses a static clone instead.
