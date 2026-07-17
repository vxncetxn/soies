---
status: accepted
---

# Portal overlays for ephemeral in-place surfaces

Ephemeral, in-place, animation-heavy UI (calendar morph, entry expand/collapse, long-press entry focus) uses **Portal overlays** rendered into root-level hosts (`morph`, `overlay`), not Expo Router Stack routes. Stack routes are reserved for true destinations. Calendar date picking and entry focus are transient peek surfaces — not routable, not back-stack-worthy — and need measure-and-morph animations and navigate-behind-closing-overlay behaviour that Stack modal presentation cannot provide without reimplementing the same Portal machinery inside a transparent route.

Focus content is mounted on demand when a long press begins, retained through
its closing spring, and released from the native tree after close completion.
Keeping one BlurView, native clone, and Portal subtree per journal entry while
Focus is closed consumes memory in proportion to the day size; immediate
construction is the deliberate bounded-memory tradeoff.

Create authoring is the deliberate exception: it is a root-owned absolute
sibling, not a Portal. Create contains a `BloomPanel` that already portals its
small menu to the root `bloom` host. Portaling the complete Create tree as well
made that menu a native Portal nested inside another native Portal; Fabric could
then receive two parent relationships while tearing both down and abort in
`unmountChildComponentView`. Root ownership retains the same ephemeral,
edge-to-edge presentation without native reparenting at the outer level.

## Considered options

- **Stack modal routes for calendar/focus** — rejected: forfeits morph-from-trigger and navigate-behind-overlay; only wins on URL/back-stack addressability, which these surfaces don't need.
- **Eagerly retain Focus for every entry** — rejected: it preloads the surface but multiplies full-screen BlurView, native clone, and Portal trees by the number of mounted entries.
- **Single Portal host** — rejected for calendar vs expand: calendar needs edge-to-edge (`morph` outside SafeAreaView); expanded stack respects safe areas (`overlay` inside).
- **Portal the complete Create flow** — rejected: nested native reparenting with Create's Bloom menu makes Fabric teardown ambiguous. A root absolute sibling provides the required visual plane directly.
