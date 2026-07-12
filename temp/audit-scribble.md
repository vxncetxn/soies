# Scribble / Ink adversarial review

**Baseline:** HEAD `b9aa502` + uncommitted worktree

Engineering-lead review prioritized by drawing performance, crash/data-loss safety, then maintainability and plan compliance.

| Metric | Value |
| --- | --- |
| Critical runtime blockers | 4 |
| Additional high risks | 6 |
| Static check failure | 1 |
| Compiler coverage | 62/62 |

## Verdict: do not merge or ship

The dominant drawing and erasing paths do full-document serialization and full-canvas PNG work on latency-sensitive threads. Android also has two correctness blockers: responder coordinates do not match stored stroke coordinates, and Promise result events can coalesce. Save is neither error-atomic nor revision-atomic.

### Why this will feel slow or fail (release blockers)

- Pen-up synchronously scales with the entire drawing, not the new stroke.
- Eraser movement multiplies that cost by animation-frame frequency.
- PNG encoding, file I/O, bitmap allocation, and bridge JSON share the hot path.
- Concurrent Android native responses can leave Save waiting indefinitely.
- Failure fallbacks can silently clear Ink or defer the error until Entry Submit.

### What is sound

- Migration V2 and `schema_version` advance atomically.
- Insert/select/gallery annotation wiring is present.
- The pager bounds native canvases to active ±1.
- Android normal pen movement draws incrementally without React state.
- Native teardown cancels replay callbacks and releases primary resources.
- Ink remains separate from Print photo bytes.

---

## Runtime, performance, and reliability findings

| Location | Severity | Finding | Concrete impact | Required remediation | Addressed | Implementer's Remarks |
| --- | --- | --- | --- | --- | --- | --- |
| `SignatureInkViewManager.kt:403–423` | Critical | Android result events coalesce | The generic result event keeps React Native’s default `canCoalesce() = true` and key 0. Concurrent `getStrokeData` and `toFile` responses can collapse into one event, leaving the other Promise pending until unmount. | Make request/result events non-coalescible. Use separate event classes; only replay progress should coalesce. | No | **Agree.** `SignatureInkEvent` does not override `canCoalesce()` / `getCoalescingKey()`, so Fabric can drop a concurrent result. Real Save/commit hazard; should fix before Android ship. |
| `ArtefactInkCanvas.tsx:246–258`; `SignatureCanvasView.kt:322–370, 631–650` | Critical | Android eraser mixes dp and px | React Native converts responder `locationX`/`locationY` to dp, while Android stores `MotionEvent` x/y as physical pixels. On 2×/3× devices, erasing is offset or misses. | Move hit-testing into native code or normalize the versioned wire format to dp/normalized coordinates. | No | **Agree.** Confirmed: Android stores raw `event.x`/`event.y` (px) and even documents that in SVG export comments; JS eraser uses RN dp. This is a real density-dependent miss. Prefer native erase or normalize all stroke coords to dp/normalized. |
| `ArtefactInkCanvas.tsx:85–109, 185–205, 299–305` | Critical | Whole-document work in interaction paths | Every pen-up serializes all points and exports a full PNG. Every eraser frame scans all points, serializes the remaining document, reconstructs the native canvas, encodes/writes a PNG, then decodes it through expo-image. | Mark the canvas dirty on pen-up. Implement native stroke erasing as one gesture/history transaction. Export only at Save or gesture end, off the UI thread. | No | **Agree** on severity for eraser; **partial nuance** on pen-up. Eraser RAF → full `setStrokeData` + `toFile` per frame is the hot-path bug I introduced for flicker cover. Pen-up PNG was intentional warm-start for eraser entry, but I agree it should not run on every stroke end — dirty flag + export at eraser-enter / Save is enough. |
| `ArtefactInkCanvas.tsx:185–240` | Critical | Stroke JSON and PNG are not one snapshot | Commit reads stroke data and exports PNG as separate native commands while drawing, Back, Undo, another Save, or a pending eraser RAF can intervene. `annotations` and the visible overlay can represent different revisions. | Expose one native snapshot command returning stroke data and a PNG from the same immutable drawing revision; lock all editing controls while it runs. | No | **Agree.** `commit()` awaits `getStrokeData` then `toFile` with no editing lock or shared revision token. A single native snapshot + UI lock during commit is the right fix; I under-scoped atomicity here. |
| `ArtefactInkCanvas.tsx:60–66, 216–234` | High | Operational failures become valid-looking empty Ink | All native errors are swallowed. A failed stroke read becomes an empty document; a failed export becomes an empty URI. Both screens leave Scribble as though Save succeeded. | Suppress only classified cancellation in preview work. Commit must reject atomically, keep Scribble open, and present Retry. | No | **Agree.** `safeInkAsync` was meant for unmount rejections only, but I applied it to commit too, so failures look like “cleared Ink” and Save still calls `exitScribble()`. Commit must fail closed. |
| `SignatureInkSurface.swift:1049–1057`; `ArtefactInkCanvas.tsx:207–240` | High | Save and Back violate history boundaries | Save does not clear history. On iOS, Back reloads committed strokes through `setStrokeData`, which pushes the discarded drawing onto Undo; re-entering and pressing Undo can resurrect discarded Ink. | Separate reset-with-cleared-history from undoable replacement, and add `clearHistoryPreservingDrawing` after a successful snapshot. | No | **Agree.** iOS `setStrokeData` appends the current drawing to `undoStack` before replace; Back’s `loadDocument` uses that path. Save also leaves prior undo state. Need a non-undoable replace / explicit history clear API. |
| `SignatureCanvasView.kt:694–751`; `SignatureInkSurface.swift:1060–1138` | High | Replay cancellation destroys undisplayed strokes | Replay clears/replaces the real drawing. Touch, Undo, or another replay cancels only the frame callback/display link, leaving the partial replay as the new source of truth. | Restore the final snapshot on interactive cancellation; reserve non-restoring cancellation for teardown and explicit Clear. | No | **Agree on the library bug; nuance on product impact.** `cancelReplay()` only drops the callback and does not restore `replaySnapshot` / `replayFinalDrawing`. Scribble does not expose replay today, so this is latent fork debt rather than a current user path — still worth fixing in the vendor module. |
| `SignatureCanvasView.kt:48–50, 222–228, 583–593, 811–833` | High | Android bitmap allocation pressure | Color changes rebuild up to three mounted full-size ARGB canvases. Every export allocates another bitmap; old backing and temporary export bitmaps are not eagerly recycled. | Do not rebuild for pen-color changes, reuse same-sized bitmaps, recycle replaced/export bitmaps in `finally`, and remove continuous exports. | No | **Agree.** `penColor` setter calls `rebuildBitmap()` without recycling the previous bitmap; pager keeps active±1 canvases. Color changes and continuous exports will pressure memory on Android. |
| `artefacts.ts:40–48`; `entries.ts:204–229`; `entriesCache.ts:3–25` | High | Display reads retain every stroke point | Home/startup queries transfer annotations through SQLite, parse every point into JS objects, and retain them in the module cache even though display code consumes only `inkOverlayPath`. | Project `hasInk`/overlay URI in display queries and load/parse annotations only when an editable canvas opens. | No | **Agree.** `inkFieldsFromAnnotations` parses full stroke JSON into every mapped artefact; Home only needs the overlay URI. `entriesCache` is an innocent Map — the cost is what we put in `Entry`. Line refs to `entries.ts` are a bit off (file is shorter), but the finding holds. |
| `savePrintEntry.ts:44–53, 69–75` | High | Overlay failure orphans the current photo | The image copy succeeds before the artefact is registered in `prepared`. If overlay copy fails, catch cleanup cannot see the current photo. | Register cleanup ownership immediately after each side effect; centralize Paper/Print preparation and failure injection tests. | No | **Agree.** Classic ordering bug: `saveMediaFile` then `saveInkOverlayFile` then `prepared.push`. Overlay failure leaves the photo outside `prepared`, so catch cleanup misses it. |
| `ArtefactInkCanvas.tsx:156–166, 192–196, 299–305` | Medium | Preview files and image-cache entries grow without bound | Timestamped full-canvas PNGs are created after strokes and throughout erasing. Superseded files are never deleted and unique URIs churn memory/disk caches. | Own one replaceable preview path per canvas session and remove it on replacement, durable copy, cancellation, and unmount. | No | **Agree.** Warm/eraser previews are fire-and-forget temp URIs with no ownership or deletion. One session-owned replaceable path is the right model. |

---

## Standards and code hygiene

Kept separate from plan compliance so clean implementation and correct product behavior do not mask each other.

| Classification | Location | Finding | Addressed | Implementer's Remarks |
| --- | --- | --- | --- | --- |
| Hard | `ArtefactInkCanvas.tsx:60–66, 216–234` | The Save contract requires a stroke snapshot and prefetched PNG; converting every failure to empty output violates that contract. | No | **Agree.** Same root cause as the High “empty Ink” finding — commit must reject, not fabricate success. |
| Hard | `savePrintEntry.ts:35–36, 44–53` | The implementation’s own no-orphan cleanup invariant is false for the current artefact when overlay copying fails. | No | **Agree.** Comment claims orphan cleanup; the `prepared` registration gap falsifies it. |
| Judgment | `data/ink.ts:47–75` | Persisted points are asserted as `InkPoint[]` without finite numeric, width, count, or bounds validation before geometry/native use. | No | **Agree as judgment / harden later.** Version + stroke shape checks exist; points are cast through. Acceptable for v1 trusted self-writes, but should validate before native/geometry use if we ever ingest peers or corrupted rows. |
| Judgment | `CreatePaperScreen.tsx:60–179`; `CreatePrintScreen.tsx:65–210` | Tool state, canvas lookup, Save/Back orchestration, and tool-strip construction are duplicated and already expose two independent drift points. | No | **Agree.** Duplicated deliberately for speed; already drifting. Should extract shared Scribble orchestration after correctness fixes. |
| Judgment | `storage/files.ts:3`; `data/ink.ts:37–40` | Low-level storage imports filename policy from data while data save modules import storage, reversing the intended dependency direction. | No | **Agree.** `inkOverlayFileName` should live next to storage (or a tiny shared naming module), not force storage → data. |
| Quality gate | `ArtefactInkCanvas.tsx:260–264` | Oxlint rejects synchronous state updates inside the eraser-mode effect with React Compiler `EffectSetState`. | No | **Agree.** Real gate failure; eraser enter should set preview state outside that effect pattern (e.g. event handler / layout effect with a different structure). |

---

## Plan compliance

| Result | Requirement | Spec evidence | Assessment | Addressed | Implementer's Remarks |
| --- | --- | --- | --- | --- | --- |
| Wrong | Android eraser | Plan:78–85, 136–142 | The dp/px mismatch means the required Android eraser is not correctly implemented on normal-density devices. | No | **Agree.** Feature is present but incorrect on non-1× densities; that is Wrong, not Partial. |
| Wrong | Save/Back history | Plan:33–37, 112–113, 133 | Save does not clear prior history; iOS Back can make discarded strokes undo-restorable. | No | **Agree.** Missed the history-boundary requirement when wiring Back through `setStrokeData`. |
| Wrong | Atomic Save | Plan:37, 82, 112 | Errors are swallowed and the JSON/PNG pair is captured by separate mutable commands. | No | **Agree.** Neither error-atomic nor revision-atomic today. |
| Partial | Save flow | Plan:112 | The plan prefers staying in Scribble for continuous drawing; both screens exit immediately after Save. | No | **Agree it is Partial / intentional UX drift.** I chose exit-on-Save to mirror mode exit clarity; still not what the plan preferred. Easy to change once Save is atomic. |
| Missing | Repository update seam | Plan:89–93 | Insert/select/map exist, but there is no durable annotations update operation. | No | **Agree.** Create-path insert is covered; there is no `UPDATE artefacts SET annotations …` for edit-existing / re-Scribble persistence yet. |
| Wrong | Overlay lifecycle | Plan:92–93, 121 | Normal drawing generates unmanaged temporary PNGs, and failed Print preparation can orphan a copied photo. | No | **Agree.** Temp PNG churn + Print orphan gap both violate the lifecycle intent. |
| Architecture drift | Default/Type display | Plan:115, 119–120 | Default/Type retain live native canvases and suppress the PNG cache. ADR-0008 documents this newer choice, so it is deliberate, but it increases native memory and widens the fork surface. | No | **Agree on the label.** Deliberate per ADR-0008 for flicker-free pager handoff; I still accept the memory/fork cost and do not treat this as a correctness Wrong. |
| Pass by inspection | Current artefact + pager isolation | `CreatePaperScreen.tsx:133–163`; `CreatePrintScreen.tsx:148–177` | No evidence-backed wrong-artefact save or enabled pager interaction was found; active ID lookup and Scribble scroll locks are present. | N/A | **Agree with the pass.** Active-id canvas lookup and Scribble scroll lock were intentional and look intact. |

---

## Verification evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Formatting | Pass | `oxfmt --check` completed successfully. |
| TypeScript | Pass | `tsc --noEmit` completed successfully. |
| Oxlint | Fail | One React Compiler `EffectSetState` error at `ArtefactInkCanvas.tsx:262`. |
| React Compiler health | Pass | 62/62 components compiled; StrictMode found; no incompatible libraries. |
| Whitespace | Pass | `git diff --check` reported no errors. |
| Expo Doctor | Inconclusive | 18/20 local checks passed; two network-backed checks failed because `exp.host` was unavailable. |
| Automated tests | Absent | No test/spec files exist; the plan allows a manual v1 gate, but no complete Android evidence is recorded. |

### Static inspection cannot close the native gate

Android Fabric delivery, 1×/2×/3× erasing, orientation changes, replay interruption, PencilKit history handoff, memory stability, and cache cleanup still require instrumented device tests after the architecture is corrected.

---

## Recommended closure order

| Order | Workstream | Exit criterion |
| --- | --- | --- |
| 1 | Redesign the hot path | Native eraser; one gesture transaction; no per-frame bridge/PNG work; one immutable snapshot command; background encoding. |
| 2 | Make state transitions atomic | Disable tools/Back/Save while committing; flush pending eraser work; bind completion to artefact ID + generation; propagate errors. |
| 3 | Normalize durable Ink | Version canvas dimensions and normalized/dp coordinates; align timestamps, widths, pressure, and RGBA across iOS/Android. |
| 4 | Bound memory and storage | Lazy-load annotations, remove unused iOS events, reuse/recycle Android bitmaps, use one owned preview path, atomically replace overlays. |
| 5 | Harden persistence | Register cleanup before each copy, validate PNG/document boundaries, add annotations update API, and failure-injection tests. |
| 6 | Close release gates | Fix lint; run Android density matrix; race Save/Back/Undo; rotate/resize; stress hundreds of strokes; verify memory and temp-file stability. |

### Smallest credible ship scope

If schedule pressure prevents the full schema redesign, the minimum acceptable patch still needs non-coalescing Android results, dp/px normalization, removal of all continuous PNG exports, a locked and atomic Save snapshot, explicit history reset, propagated errors, complete file cleanup, and Android stress testing. Cosmetic cleanup alone will not make this implementation safe.
