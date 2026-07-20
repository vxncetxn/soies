---
status: accepted
---

# Phase-synchronize discrete expansion instead of sharing animation progress

ADR 0014 established that Ease owns fixed state transitions while Reanimated
owns continuously driven motion. The initial migration still classified Stack
and Create expansion as Reanimated because one shared progress value connected
cards, chrome, headers, and lifecycle completion.

The Entry transition demonstrated a cleaner coordination mechanism: a
request-scoped phase reducer can tell several independent Ease views which
endpoint they should target. Those views do not need the same per-frame value
when the product contract requires common start, retention, and completion
phases but not exact frame-by-frame interpolation.

## Decision

Use phase synchronization for Stack expansion, Create Type/Scribble expansion,
and the Focus shell.

- Stack uses `collapsed`, `preparing`, `expanding`, `expanded`, and `collapsing`.
  The portal is mounted and restored during `preparing`, retained through
  collapse, and released only after the active card's matching Ease completion.
- Stack card correction, scale, shadow, close control, and Home chrome use
  discrete Ease endpoints. Native paging and the Reanimated
  `currentPage`/`activeIndex` geometry remain continuous.
- Create uses a request-scoped authoring reducer with `settled`, `transitioning`,
  and `dismissing` phases plus `default`, `type`, and `scribble` modes. The body,
  canonical card scale, headers, and controls target Ease endpoints.
- Create retains the outgoing Type or Scribble mode while returning to Default,
  so native responders and the live Ink canvas are not removed during exit.
- Print keeps a private Reanimated geometry companion for its interactive
  keyboard pin. That value does not coordinate other components and does not
  write the Ease-owned card scale.
- Focus uses explicit `closed`, `opening`, `open`, and `closing` phases. Ease
  owns backdrop and subject-clone opacity; Reanimated retains trigger
  measurement and clone/menu geometry.
- `EaseMotionCompletionQueue` associates native completion events with logical
  request tokens. Newer targets supersede cancelled completions, stale request
  IDs cannot settle newer work, and a lone native interruption cannot strand a
  reducer between phases.
- When Ease and Reanimated are both necessary, they own separate nested native
  views. Paper and Print settle with one scale-bearing ancestor at identity.

Each participant may use a separately tuned transition. Synchronization means
that participants share the same logical phase boundaries and retention rules;
it does not require their opacity, scale, and translation curves to have equal
durations or equal intermediate values.

## Considered options

- **Keep one shared Reanimated progress value** — preserves exact frame locking,
  but couples unrelated components to one interpolation graph, pushes lifecycle
  decisions across the UI/JS boundary, and makes ownership harder to inspect.
- **Mirror Ease progress into Reanimated or React** — rejected because Ease is
  intentionally endpoint-driven and exposing a synthetic shared clock would
  recreate the coupling this migration removes.
- **Move all remaining geometry to Ease** — rejected for paging, measurement,
  and interactive keyboard motion, which are continuous inputs rather than
  discrete application phases.
- **Unmount old trees as soon as the target changes** — rejected because Portal
  layout, native text responders, Ink canvases, and close actions require
  retained native views until readiness or completion.

## Consequences

- Application state and animation state are explicit, request-scoped, and
  testable without a native runtime.
- Components depend on semantic phases and selectors instead of importing a
  shared animation value.
- Property ownership is visible in nested wrappers, avoiding competing native
  transform or opacity writers.
- The implementation adds small reducers, readiness phases, and completion
  tokens. This is more code than a single scalar for a trivial animation, but
  it removes cross-component interpolation and lifecycle worklets from these
  compound interactions.
- Exact frame-by-frame lockstep is no longer guaranteed across different
  properties. Perceptual parity is maintained with separately tuned Stack,
  Create, and Focus tokens.
- Reanimated remains a production dependency for paging, measurement,
  keyboard coupling, Bloom morphs, and other continuously driven motion.
- Physical iOS validation remains required for native Portal handoff, TextKit
  responder fidelity, Ink retention, keyboard pinning, interruption, and
  Reduce Motion behavior.
