Audit verdict: Feature A needs an urgent persistence fix; Feature B should not be committed yet.

## Critical blockers

1. `File.copy()` is not awaited

Expo SDK 57 defines it as asynchronous:

```21:25:src/storage/files.ts
await ensureArtifactsDir();
const destination = new File(artifactsDirectory(), `${artefactId}.${ext}`);
const source = new File(srcUri);
source.copy(destination);
return destination.uri;
```

The database can commit and close the UI before images finish copying. Failures become unhandled, potentially creating entries with missing images. With five Prints, all copies start concurrently.

Fix: `await source.copy(destination)`.

1. Failed Print saves leak files

`savePrintEntry` copies media before the transaction but never removes it if another copy or the transaction fails. Retries accumulate orphaned files.

Fix: track prepared paths and call `deleteMediaFile` on every subsequent failure.

1. Save lifecycle is unsafe

`CreatePaperScreen` and `CreatePrintScreen`:

- allow Cancel/hardware Back while saving;
- keep fields editable after submission starts;
- do not catch or present save failures.

A cancelled draft can still appear later; an old save callback could also close a newly opened create session.

Fix: lock the whole form and dismissal while saving, catch errors, retain the draft, and display Retry.

1. The five-artefact limit is raceable

The chrome checks render-time `artefactCount`, but the actual append operations in both create screens are unconditional. Two rapid additions at count four can produce six; save then rejects without useful feedback. The picker’s `picking` state has the same same-tick race.

Fix: enforce the cap inside the functional state update and use a synchronous ref as the picker mutex.

## 1. Performance

- `CreateArtefactPager` eagerly mounts all five editors and images in a `ScrollView`. Five target-sized Print decodes can consume roughly 28 MB before caching overhead. Window active/adjacent pages or use the already-installed native pager.
- `pickPrintImage` scales to “cover” but does not crop. A normal landscape photo can retain approximately twice the pixels ultimately displayed. Crop to the Print aspect ratio before resizing.

## 2. Simplicity and hygiene

- `CreateScreenChrome` has a shallow, Print-aware interface: optional props move together, magic `"permission"`/`"error"` keys affect behaviour, and Print supplies a dummy callback. Replace these with a discriminated add configuration.
- Paper and Print duplicate pager/focus/entrance navigation state. Extract one shared authoring controller hook.
- Image-picker orchestration is duplicated between `CreateEntryButton` and `CreatePrintScreen`; `PrintMediaBloomPanel` only shares presentation.
- Paper and Print save functions duplicate transaction and insertion mechanics. Keep Print media preparation separate, then share the transactional persistence core.

Strong existing seams: `CreateArtefactPager`, `PrintMediaBloomPanel`, the centralized maximum constant, and transactional artefact ordering.

## 3. Developer experience

- `pnpm fmt:check` fails on 12 files.
- `pnpm typecheck`, `pnpm lint`, React Compiler healthcheck, and `git diff --check` pass.

Recommended order: persistence correctness → save locking/errors → atomic cap → image processing/windowing → refactoring and tests.
