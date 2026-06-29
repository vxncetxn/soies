---
status: accepted
---

# artefacts.data is opaque JSON, round-tripped verbatim; unknown types render a placeholder

The polymorphic `artefacts.data` JSON gives no-migration extensibility, but across future sync an older peer that parses `data` into its TS types and re-serializes on save would silently drop fields it doesn't know and propagate the truncated blob — destroying new artefact fields. The repository treats `data` as an opaque JSON string for storage and sync, writing it back verbatim unless the app knows the `type`; unknown `type`s map to an `UnknownArtefact` (raw `type` + raw `data`) that renders a placeholder. This preserves both no-migration extensibility and forward compatibility across sync. Future embedded annotation overlays will live in a separate opaque `annotations` column, not inside `data`, so `data`'s opaque round-trip stays clean.

## Considered options

- **`data_version` integer column with versioned mappers** — rejected: more machinery, still needs the round-trip discipline.
- **Typed columns/tables per artefact type** — rejected: loses the no-migration extensibility that motivates the polymorphic design.
