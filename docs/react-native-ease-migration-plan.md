# React Native Ease migration tracker

This is the live tracker for the partial migration from Reanimated to
`react-native-ease`. The architectural boundary is accepted in
[ADR 0014](./adr/0014-ease-reanimated-animation-boundary.md).

## Status

- **Implemented; device gate pending** — code, static checks, and automated
  tests are complete; physical iOS acceptance has not yet been recorded.
- **Provisional** — implemented and accepted on physical iOS; physical Android
  remains outstanding.
- **Yes** — accepted on physical iOS and Android.
- **N/A — retained** — intentionally remains with Reanimated or a native owner.
- **Deferred — ignored** — inventoried but excluded from this effort.

Reanimated remains a required dependency. This migration changes no database
schema and no public product interface.

## Shared Entry contract

All Entry navigation uses one sequence:

1. Prepare the target while prerequisite UI closes.
2. Fade the outgoing Entry body out and translate it one full viewport down
   over 350 ms with ease-in.
3. Wait for both source exit and first-Artefact readiness. The gap is a blank
   white stage with no spinner.
4. Fade the incoming Entry body in and translate it from one viewport below
   over 350 ms with ease-out.
5. Crossfade outgoing/incoming chrome without translation. For Home → Home,
   Home chrome remains fixed and visible.

`EntryTransitionProvider` coordinates participants `home`, `prepared-home`, and
`create` through `idle`, `preparing`, `exiting`, `awaiting-target`, `entering`,
and `settling`. Its request-scoped interface is:

- `begin(source, target, exitGate, chromeMode)`
- `allowExit(requestId)`
- `targetMounted(requestId)`
- `targetReady(requestId)`
- `sourceExitFinished(requestId)`
- `targetEnterFinished(requestId)`
- `complete(requestId, canonicalParticipant)`
- `abort(requestId)`

Stale request IDs are ignored. Reduce Motion uses `{ type: "none" }` while
preserving native completion callbacks. Ease hardware layers remain disabled.

## Navigation adapters

### Calendar → Home

- The complete Day load starts during native sheet collapse.
- The manual exit gate opens only after the sheet settles at zero.
- `PreparedHomeEntry` renders the target Entry's first real Artefact and white
  silhouettes for the remaining Artefacts.
- Paper readiness comes from native text layout; Print display and terminal
  image error both count as ready; empty and unsupported targets are immediate.
- After the cover enters, canonical Home adopts the complete Day behind it.
  Paper layout and Print display/error readiness replay for already-mounted
  content, with a separate post-adoption watchdog for a lost native callback.
- A load failure aborts the request, restores unchanged Home, and keeps the
  existing alert/reopen path.

### Home → Create

- The real Paper/Print tree mounts below the viewport as soon as `openCreate`
  is accepted. Bloom close may overlap and is not awaited.
- Home body exits immediately and Home chrome fades.
- Paper waits for its first editable native text layout. Print waits for the
  selected image to display or reach terminal error.
- Create Entry body translates; Create chrome only fades. The former shared
  `createProgress` spring, 120 px Home slide, and 40 px Create slide are gone.

### Create → Home

- Cancel, hardware Back, feature-boundary dismissal, and Save retain the shared
  responder freeze and one committed frame before motion.
- Cancel targets the already-mounted canonical Home tree and preserves its Day
  and Entry position.
- Save reloads Home during Create exit, targets the newest Entry with the same
  lightweight cover, then adopts canonical Home behind it.
- The invisible Create tree remains mounted until Home entrance completes.
- Save failure keeps Create open. Post-save reload failure enters Home's normal
  error/retry surface and does not resurrect the saved draft.

## Animation inventory

| Animation area | Owner after migration | Decision | Status |
|---|---|---|---|
| Calendar Recent/Monthly → Home Entry exit/entrance | Ease | Migrate | Implemented; device gate pending |
| Home → Create and Create → Home Entry/chrome transition | Ease | Migrate | Implemented; device gate pending |
| Share action toast fade and 8 px rise | Ease | Migrate | Implemented; device gate pending |
| Tooltip fade and auto-dismiss | Ease | Migrate | Implemented; device gate pending |
| Calendar Recent/Monthly retained-tree crossfade | Ease | Migrate | Implemented; device gate pending |
| Featured Widgets picker/featured crossfade | Ease | Migrate | Implemented; device gate pending |
| Newly appended Create Artefact fade/rise | Ease | Migrate | Implemented; device gate pending |
| Create title-focus blur-backdrop fade | Ease | Migrate | Implemented; device gate pending |
| Focus menu-item staggered fade/rise | Ease | Migrate | Implemented; device gate pending |
| ScrollIndicator expanded scrubber shell fade/scale | Ease | Migrate | Implemented; device gate pending |
| Home title carousel | Reanimated | Keep | N/A — retained |
| Day/Artefact paging and indicator/preview interpolation | Reanimated/native scroll | Keep | N/A — retained |
| Stack expand/collapse, geometry, shadow, close control, chrome | Reanimated | Keep | N/A — retained |
| Calendar bottom edge fade | Reanimated/custom native prop | Keep | N/A — retained |
| Create Type/Scribble expansion, header layout, Paper/Print scale, keyboard pin | Reanimated | Keep | N/A — retained |
| Focus backdrop, measured subject clone, and menu geometry | Reanimated | Keep | N/A — retained |
| Bottom-sheet detents/scrims and native carousel momentum | Native libraries | Keep | N/A — retained |
| BloomButton/BloomPanel/BloomBar morph and content transitions | Reanimated | Ignore | Deferred — ignored |
| Dormant MorphOverlay | Reanimated | Ignore | Deferred — ignored |

## Preserved timing tokens

- Legacy Reanimated default: 300 ms,
  `cubic-bezier(0.455, 0.03, 0.515, 0.955)`.
- Calendar crossfade: 160 ms,
  `cubic-bezier(0.25, 0.46, 0.45, 0.94)`.
- Featured Widgets: 200 ms.
- Toast: 220 ms; Tooltip: 150 ms; title backdrop: 180 ms.
- Appended Artefact: 320 ms,
  `cubic-bezier(0.215, 0.61, 0.355, 1)`.
- Focus rows: 220 ms enter / 150 ms exit with the existing 120 ms base and
  70 ms per-row stagger.
- Former bare scrubber spring: damping 120, stiffness 900, mass 4.

## Automated acceptance

- Reducer phases, readiness ordering, manual gates, stale events, abort, and
  settling are covered through the reducer interface.
- Behavioral adapter tests cover already-mounted Paper/Print readiness, exact
  and fallback Entry targeting, Cancel/Save routing, newest-Entry selection,
  and post-save reload failure. Source contracts additionally cover retained
  participants, pointer/accessibility blocking, and prepared-Home adoption.
- Toast, Tooltip, retained crossfades, Focus rows, and the scrubber have
  retention/ownership contracts.
- Required gates: `pnpm check`, React Compiler health checks, production Expo
  exports, and fresh native builds against Expo SDK 57.

### Validation recorded on 2026-07-20

- `pnpm check` passes: formatting, type checking, linting, React Compiler
  health (121/121), Strict Mode checks, and all 118 tests.
- Fresh production Expo exports pass for both iOS and Android.
- A fresh arm64 iOS Simulator Debug build passes with Expo SDK 57 and the
  native Ease module linked.
- An Android native build is not recorded because this workstation has no
  Android SDK configured. The Android production export passes, so this is an
  environment gate rather than a known implementation failure.
- The physical-device gates below remain outstanding and are not inferred from
  simulator or export results.

## Physical device gates still required

On physical iOS, validate release-like builds with Reduce Motion on/off and
normal/Low Power modes. Exercise Calendar → Home, Paper/Print Create, Cancel,
Save, rapid repeats, Back, picker cancellation/error, focus/blur, and at least
100 transition cycles. Confirm full-viewport travel, no Paper disappearance,
no spinner/flash/crash, memory plateau, and Calendar tap-to-motion p95 ≤ 50 ms.

On physical Android, repeat the timing, clipping, responder, memory, and
performance matrix without enabling Ease hardware layers. Only then promote
implemented rows to `Yes`.
