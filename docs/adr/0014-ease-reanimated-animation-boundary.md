---
status: accepted
---

# Ease owns discrete transitions; Reanimated owns continuously driven motion

Soies uses two animation engines behind an explicit ownership boundary.

`react-native-ease` owns discrete state changes that can be expressed as a
fixed fade, translation, or scale target: Entry navigation, retained-tree
crossfades, mount entrances, timed dismissals, and binary focus backdrops.
`react-native-reanimated` remains required for values continuously derived from
gestures, scroll position, keyboard position, measurement, layout, worklets,
or shared morph progress. Native bottom-sheet detents and ScrollView momentum
remain owned by their native libraries.

One native view must never have the same property animated by both engines.
When a surface needs both Stack-expansion opacity and Entry-navigation opacity,
the Reanimated view is nested inside an Ease wrapper. Ease does not enable its
Android hardware layer by default.

The root `EntryTransitionProvider` coordinates Home, a lightweight
`prepared-home` cover, and Create. Its reducer accepts request-scoped events;
stale native completion/readiness events cannot advance a newer request. The
shared surface primitive fades and travels one viewport, while the shared
chrome primitive changes opacity only. Reduce Motion swaps the native
transition for `{ type: "none" }`, retaining the same completion-event order.

Bloom and the dormant `MorphOverlay` remain in the inventory but are excluded
from this migration. Reanimated therefore remains a production dependency.

[ADR 0015](./0015-phase-synchronized-ease-expansion.md) refines this boundary:
compound interactions may coordinate independent Ease endpoints with a
request-scoped phase reducer instead of retaining one shared Reanimated
progress value. Continuously driven subparts still remain with Reanimated on
separate nested views.

## Considered options

- **Migrate every animation to Ease** — rejected because Ease deliberately does
  not own gesture interpolation, layout animation, worklets, measured morphs,
  or keyboard coupling.
- **Keep every animation in Reanimated** — rejected because fixed state-driven
  transitions do not need a worklet/shared-value graph and can run directly on
  platform animation APIs through Ease.
- **Let both engines write one native view** — rejected because independent
  clocks can overwrite opacity/transform and make interruption behavior
  nondeterministic. Nested wrappers make ownership visible in the tree.
- **Move Create through a Portal for transition parity** — rejected because its
  root-owned Fabric hierarchy prevents the nested native-parent teardown crash
  documented by the existing Create architecture.

## Consequences

- New animation work must first be classified against this boundary.
- Discrete Ease migrations preserve their legacy duration and curve tokens.
- Entry navigation blocks pointer input for the full session and hides inactive
  participants from accessibility.
- Native readiness—not database timing—gates Entry entrance. A one-second
  watchdog starts only after the target native view mounts.
- Physical iOS and Android validation remains required before an implemented
  migration row can be called accepted on both platforms.
