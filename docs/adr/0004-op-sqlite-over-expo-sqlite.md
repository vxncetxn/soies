---
status: accepted
---

# op-sqlite over expo-sqlite as the local data store

Performance is the project's #1 priority, and the data store is the layer most likely to be felt as the dataset grows (years of entries, video metadata, FTS5 search, annotations); expo-sqlite is first-party (lowest maintenance risk) but benchmarks 2–10x slower and ~5x higher memory than op-sqlite on data-intensive queries, and has no built-in sync path. Use `@op-engineering/op-sqlite` (JSI SQLite) — best raw query/memory performance (`performanceMode`, `executeRaw`, `executeBatch`, prepared statements, worker-thread async), compatible with Expo SDK 56 / RN 0.85 / New Arch under dev builds (the project already uses `expo-dev-client` + CNG), and it offers first-class future no-server sync via `crsqlite` CRDTs. The schema and ADRs 1–3 are driver-independent and unchanged.

## Consequences

- Community module, not first-party — healthy (147 releases, latest 16.2.0, 2026-05-27; used by PowerSync) but a future RN/New-Arch break means waiting on the maintainer.
- One-time integration friction: resolve the SQLite symbol clash if `expo-updates` is in the prebuild (`"expo.updates.useThirdPartySQLitePod": "true"` in `ios/Podfile.properties.json`), add the `package.json` `"op-sqlite"` config, and run migrations statement-by-statement (`execute` runs only the first statement on native) via `executeBatch`.
- No `db.sql` tagged templates (plain `execute(sql, params)`) — minor DX cost, offset by the Node test façade for unit-testing repository SQL.

## Considered options

- **expo-sqlite** — rejected on performance + future-sync, despite simpler integration and lower maintenance risk.
- **WatermelonDB** — rejected: its sync protocol expects a server endpoint.
- **react-native-mmkv / AsyncStorage / flat JSON** — rejected: no relational queries/indexes.
