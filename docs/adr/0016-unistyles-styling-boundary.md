---
status: accepted
---

# Use Unistyles for adaptive chrome and fixed tokens for artefact presentation

Soies accumulated Uniwind utility classes, React Native stylesheets, inline
styles, native startup values, and serialized WidgetKit literals. Their theme
and typography vocabularies overlap without one authoritative interface.
Reanimated 4.5.0 also rejected Unistyles' private empty metadata object, while
React Native Boost cannot safely run while Uniwind rewrites the same hosts.

## Decision

- Unistyles 3 is the sole static styling implementation for app-owned React
  Native code. Its `light` and `dark` themes use adaptive device appearance.
- Adaptive Chrome consumes semantic theme roles. Primitive palette values stay
  private to the style-system module.
- Artefact Presentation consumes fixed tokens for Paper, Print, Ink, Frames,
  captures, Share images, and Widget content. Device appearance cannot silently
  recolor authored material.
- App-owned UIKit, WidgetKit, and Android bootstrap literals are tested mirrors
  when their runtime or serialization boundary cannot import JavaScript tokens.
  Vendored library internals are outside this decision.
- Reanimated is pinned to 4.5.2, which contains the empty-object fix released in
  4.5.1. Unistyles static styles and Reanimated styles remain separate array
  entries. Unistyles CSS transitions and Reanimated layout animations are not
  used on the same host.
- ADRs 0014 and 0015 continue to govern motion: Ease owns discrete phases and
  Reanimated owns continuously driven geometry.
- React Native Boost is enabled only after Uniwind reaches zero. It runs in
  explicit Unistyles mode with conservative ancestor analysis, no force
  annotations, and targeted documented ignores only.

### Boost compatibility contract

| Boost / Unistyles limitation | Project response |
|---|---|
| Uniwind's Metro wrappers are incompatible with Boost host replacement | Uniwind, Tailwind, their generated types, CSS entry, and resolver bridge are removed before Boost is enabled. |
| Boost needs to preserve Unistyles' native style registration | The runtime package is a production dependency and Babel sets `unistyles: true` explicitly. Same-file Unistyles styles route to Unistyles' lean hosts. |
| Cross-file, conditional, prop-supplied, or otherwise unresolved styles cannot be classified safely | Boost leaves those hosts untouched. Both dangerous unknown-ancestor flags remain `false`; `@boost-force` is forbidden by contract. |
| Boost preserves an otherwise-empty host around an absolutely positioned keyboard accessory | Create's accessory host explicitly fills the screen so `KeyboardStickyView` anchors to real screen-bottom bounds instead of a zero-height wrapper. A lifecycle contract protects this geometry. |
| A Unistyles `Text` style is forwarded without wrapper normalization | App styles use tokenized font families and contain no numeric `fontWeight`, `userSelect`, or `verticalAlign`. Future selection and vertical-alignment needs must use `selectable` and `textAlignVertical`. |
| Worklets' Babel transform has ordering requirements | Unistyles and Boost run before Worklets; Worklets remains the final plugin. |

## Considered options

- **Keep Uniwind as a compatibility layer** — rejected because Boost rewrites
  React Native hosts before Uniwind can apply `className`, and the app would
  retain two token authorities.
- **Make every visual value adaptive** — rejected because a Paper, Print, Ink
  stroke, capture, or Frame must retain its authored appearance.
- **Hard-code native values without contracts** — rejected because startup and
  Widget frames would drift silently from the JavaScript catalog.
- **Patch Reanimated 4.5.0 locally** — rejected because the upstream patch is
  released and supported by 4.5.2.
- **Maximize Boost coverage with dangerous ancestor flags** — rejected because
  unknown wrappers may render Text and require a different native host.

## Consequences

- Device appearance changes update Adaptive Chrome without a React provider or
  app-level theme switch.
- Component call sites learn semantic roles instead of palette values.
- Native rebuilds are required; Expo Go is not supported by Unistyles.
- Provisional dark/status/type-marker choices remain visible in the styling
  exception ledger until design review resolves them.
- Boost may intentionally skip safe-looking views when it cannot prove their
  ancestry. Correctness is preferred over maximum optimization coverage.
