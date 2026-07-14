# Gallery feature production audit

**Review target:** every tracked and untracked working-tree change relative to `HEAD` (`e51bdc36a2567bd4dc6a73bf5eb0c022fe92bd3f`).  
**Review posture:** adversarial release-readiness review, ordered by performance/stability, user experience/error handling, then simplicity and hygiene.  
**Confirmed requirement:** Gallery must contain no more than 10 featured artefacts.  
**Confirmed frame scope:** Gallery frames derive from the portrait branch of `temp/frames.astro`; landscape and large-frame variants are not required.  
**Implementation update (2026-07-15):** all actionable findings except the explicitly excluded G-16 have been implemented and pass automated validation. Release still requires the physical-device profiling, visual, and accessibility sign-offs called out under G-01, G-15, and G-09; those checks cannot be proven by static builds.

**Reviewer re-assessment (2026-07-15):** the commit substantially improves the feature, but seven findings remain only partially addressed, eight are fully or functionally addressed, and G-16 remains an accepted exception. The most serious new concern is a High-severity close/reopen race in the shared focus overlay; see G-01.

**Follow-up implementation (2026-07-15):** all seven partially addressed findings have now been remediated in code and covered by focused automated tests where applicable. `pnpm check` now includes the test suite. Physical-device profiling, reference-screenshot approval, and screen-reader/native-interaction sign-offs remain release checks that cannot be completed in this static workspace.

## Severity summary

Severity describes production/user risk, independently of whether CI happens to block the change.

| ID   | Severity | Finding                                                                                           | Addressed | Implementer's Remarks                                                                                                                                                                                                                                                                                                                                                                                                                               | Reviewer's Remarks                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---- | -------- | ------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G-14 | High     | The required 10-artefact Gallery limit is not enforced                                            | Yes       | Added a typed `GalleryCapacityError`, transactional count, and migration V3 insert/revival triggers covering direct sync/import writes. Hidden parent memberships count. Tests cover artefacts 10/11, removal, revival, duplicate-at-capacity, and racing writes; `pnpm check` now runs the suite as part of the release gate.                                                                                                                      | **Fully addressed.** The repository transaction, migration cleanup, and database triggers enforce the limit across normal, revival, and direct-write paths, and duplicate adds remain idempotent. The race test uses one synchronous in-memory connection rather than two OP-SQLite clients, and `pnpm test` is not included in `pnpm check`; add this suite to the release gate so the authoritative invariant cannot regress unnoticed.                                                                                                                                                                                                                                                                                                              |
| G-01 | Medium   | A bounded Gallery still duplicates expensive native content per artefact                          | Yes       | Retained the single pager-owned overlay and added an explicit focus-session state machine. A closing session keeps ownership through native settle, ignores reopen attempts, and keys deferred removal to its own target; the completion ref synchronizes before close animation, including immediate/reduced-motion settle. A regression test covers close/remove/reopen ordering. The physical 10-artefact Print+Ink profile remains outstanding. | **Partially addressed.** The original Medium-severity allocation issue is structurally fixed: one pager-owned transient overlay replaces the per-row overlay trees, dimensions are shared, and the hard cap makes the simple `ScrollView` defensible. However, the remediation introduces a separate **High-severity, release-blocking** race: `FocusOverlay` makes the underlying Gallery interactive as soon as closing starts while `GalleryPager` retains one global pending removal. Reopening before the close spring finishes can cancel the old completion and later remove the wrong artefact. Gate new focus sessions until close settles or key pending actions to an overlay session, then complete the required 10-item physical profile. |
| G-15 | Medium   | The frame preserves portrait geometry but only partially ports the reference surface treatment    | Yes       | Resized the mat-centre highlight so it extends beyond the opaque well and remains visible in the mat ring. The deliberate `contain` treatment, reduced depth stack, and inner edge remain unchanged. Reference-screenshot approval on representative iOS/Android devices remains outstanding.                                                                                                                                                       | **Partially addressed.** The documentation, deliberate `contain` adaptation, reduced shadow stack, and inner edge are reasonable. The new mat highlight is smaller than the opaque well and is rendered immediately behind it, so the well fully covers the cue and the added native view has no visible effect. Resize or reposition the cue so it remains visible, or remove it; reference-screenshot approval and the full-Gallery device profile are still outstanding.                                                                                                                                                                                                                                                                            |
| G-16 | Medium   | Frame depth disappears on Android versions that the app still supports                            | No        | Explicitly excluded from this implementation request; no older-Android shadow fallback was added.                                                                                                                                                                                                                                                                                                                                                   | **Accepted exception, not addressed.** This matches the explicit instruction to skip G-16. The original older-Android degradation risk remains and should be recorded as a conscious release acceptance or tracked separately.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G-02 | High     | The camera-shift force-mounts Gallery at cold start and does not actually freeze the inactive tab | Yes       | Restored Expo Router's default lazy `TabSlot`, removed the eager camera-shift slot/context, and corrected ADR-0010 to `accepted` because it documents the current lifecycle decision and profiling gate.                                                                                                                                                                                                                                            | **Functionally addressed; documentation correction required.** Restoring Expo Router's default `TabSlot` removes the eager Gallery mount and the custom lifecycle surface. ADR-0010 now describes the replacement decision but still labels that current decision `superseded` without naming a successor; mark it accepted, or preserve the old superseded ADR and add a separate accepted ADR.                                                                                                                                                                                                                                                                                                                                                       |
| G-03 | High     | The post-add destination is consumed against stale data, so Gallery lands on the wrong artefact   | Yes       | Added a production-used pager navigation harness covering stale rows, insufficient native width, a rejected native-ref jump, and eventual success; the pending ID is consumed only by the success callback. Documented `useCallback` as a correctness contract for native/third-party refs and layout effects, not a render optimization.                                                                                                           | **Functionally addressed.** The pending artefact ID is retained until refreshed rows and native width are ready, then cleared only after a successful jump. The current test covers only the pending-value module, not the stale-fetch/native-layout sequence; add a pager integration test. Also document the correctness-driven `useCallback` exception or align it with the repository's stated React Compiler standard.                                                                                                                                                                                                                                                                                                                            |
| G-04 | High     | Cancel/dismiss during Add does not cancel the mutation or its later navigation                    | Yes       | Add is presented as a committing operation: Cancel is disabled and the closed detent becomes programmatic-only while the transaction is active. The keyed session stays owned until native close settle.                                                                                                                                                                                                                                            | **Addressed in code.** During the write, Cancel is disabled, the zero detent is programmatic-only, and keyed session ownership prevents an old settle callback from clearing a newer session. Before release, manually verify slow writes, swipe gestures, and Android hardware Back behavior because those native interactions are not covered by the automated tests.                                                                                                                                                                                                                                                                                                                                                                                |
| G-05 | High     | Rotation/resizing breaks page identity and can add a different artefact from the one displayed    | Yes       | Gallery now settles identity on drag end (using native target offset when available) as well as momentum end. An order signature re-resolves the active artefact on same-width refresh/reorder; deletion retains its separate animated clamp. Focused tests cover drag settlement and reorder identity restoration.                                                                                                                                 | **Partially addressed.** The Add sheet correctly restores and commits by artefact ID. The Gallery updates its active ID only on momentum end, so a drag that ends without momentum can leave stale identity for a later resize; it also restores only when width changes, so a same-width refresh/reorder can leave the old pixel index showing a different artefact. Handle drag-end settling and re-resolve the active ID when row order changes, while preserving the intended delete clamp behavior.                                                                                                                                                                                                                                               |
| G-06 | Medium   | Read, delete, and membership-check failures are hidden or unhandled                               | Yes       | Initial load, refresh, remove, membership, and add failures are caught and surfaced. Initial/refresh/remove/membership paths have Retry, last good Gallery rows survive refresh failure, and the route exports an Expo Router `ErrorBoundary`.                                                                                                                                                                                                      | **Fully addressed.** Expected persistence failures are caught and surfaced with appropriate retained data and retry paths, and the route-level boundary covers unexpected render failures. No unhandled promise path identified in the reviewed flows remains.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G-07 | Medium   | The Add sheet has a first-open resize jump and permanently retains its last rendered entry        | Yes       | Replaced JS height measurement with native `[0, "content"]` detents. Each presentation is keyed; the provider retains its Entry only through the close animation and unmounts it from `onSettle(0)`.                                                                                                                                                                                                                                                | **Fully addressed.** The native content detent removes the JS measurement jump, and keyed session content is retained only for the close animation before being released on settle. This directly resolves both the first-open layout churn and permanent hidden-tree retention.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| G-08 | Medium   | Artefact delete/restore no longer restores Gallery membership                                     | Yes       | The integration test now invokes the public `softDeleteArtefact()` and `restoreArtefact()` repository operations, verifying that Gallery membership remains active, disappears through the live-parent join, and reappears after Undo.                                                                                                                                                                                                              | **Partially addressed.** Production behavior and the documented invariant are correct: artefact deletion leaves membership intact, the Gallery join hides the deleted parent, and restore reveals it again. The claimed transaction-level test directly updates `artefacts.deleted_at` instead of invoking `softDeleteArtefact()` and `restoreArtefact()`, so it would not catch a repository regression. Add a test through those public repository operations.                                                                                                                                                                                                                                                                                       |
| G-09 | Medium   | Closed Gallery overlays remain exposed to assistive technology                                    | Yes       | Gallery now has one transient overlay. `FocusOverlay` hides closed descendants from VoiceOver/TalkBack and applies modal semantics while open. Manual traversal on both screen readers remains a release check.                                                                                                                                                                                                                                     | **Addressed in code; verification incomplete.** The single overlay is hidden from the accessibility tree while closed and uses modal semantics while open. VoiceOver and TalkBack traversal still require physical-device sign-off, and the G-01 close/reopen race should be fixed before that validation because it re-enables the underlying Gallery during the closing animation.                                                                                                                                                                                                                                                                                                                                                                   |
| G-10 | Medium   | Add performs avoidable whole-Gallery reads and mapping                                            | Yes       | The picker queries only its candidate artefact IDs plus one aggregate capacity count. The pre-insert `getGallery()` read and positional destination calculation were removed.                                                                                                                                                                                                                                                                       | **Fully addressed.** Sheet preparation now performs bounded candidate membership work plus one aggregate count, and the success path targets an artefact ID without loading and mapping the full Gallery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| G-11 | Low      | Required formatting fails on two new files                                                        | Yes       | Ran `pnpm fmt`; `pnpm fmt:check` and the aggregate `pnpm check` pass. The aggregate check now also runs `pnpm test`.                                                                                                                                                                                                                                                                                                                                | **Fully addressed.** Independent review confirmed that `pnpm check` passes, including formatting, types, lint, and compiler-health checks. The separate test suite also passes, although it should be added to the aggregate release gate as noted under G-14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| G-12 | Low      | Dead/scaffolding exports and branches remain in the production change set                         | Yes       | Removed the unused public `closeGalleryAdd` context capability. `FRAME_WELL_ASPECT` and `FRAME_MAT_SCALE` are now module-private; the externally consumed `FRAME_BOARD_SCALE` remains exported.                                                                                                                                                                                                                                                     | **Partially addressed.** The cited camera-shift and pending-page scaffolding was removed, but `GalleryAddContext` still exposes `closeGalleryAdd` even though no consumer uses it. Remove that method and narrow any frame constants that have no external consumer so the production interface contains only active capabilities.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| G-13 | Low      | Gallery copy violates the domain language and overstates a non-destructive action                 | Yes       | Copy now uses “Artefacts,” capitalizes “Gallery,” and labels the membership action “Remove from Gallery.”                                                                                                                                                                                                                                                                                                                                           | **Fully addressed.** The reviewed user-facing strings consistently use the project terminology and accurately describe removal as Gallery membership removal rather than destructive deletion.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

No Critical issue was proven by the available static/build evidence. G-14 now supplies the hard bound assumed by G-01. G-15 does not treat portrait-only support as a defect; it covers only divergences within the required portrait treatment.

## Detailed findings

### G-14 — The required 10-artefact Gallery limit is not enforced

**Severity:** High  
**Locations:** `src/db/repositories/gallery.ts:9-47`, `src/gallery/GalleryAddSheet.tsx:129-165`, `src/db/migrations.ts:58-67`

The confirmed product requirement caps Gallery at 10 featured artefacts. Neither the UI, repository transaction, nor database schema enforces that limit.

`addArtefactToGallery()` accepts an eleventh active membership. Direct repository calls, future sync/import paths, and racing clients can also exceed the intended cap.

Without an authoritative limit, the performance bound assumed by G-01 does not exist. Native view and image work can continue growing until memory pressure causes severe jank or termination.

**Resolution:** enforce capacity inside the `addArtefactToGallery()` transaction for both new inserts and tombstone revival. Return a typed capacity error and show a clear “Gallery is full” state in the sheet.

Define whether hidden memberships referencing deleted parents count toward capacity. Apply the same invariant to sync/import conflict handling rather than trusting the picker UI.

Add tests for adding item 10, rejecting item 11, removing then adding, reviving a tombstone, duplicate no-op at capacity, and concurrent attempts.

### G-01 — A bounded Gallery still duplicates expensive native content per artefact

**Severity:** Medium  
**Locations:** `src/components/GalleryPager.tsx:55-100`, `src/components/GalleryPager.tsx:205-230`, `src/components/FocusOverlay.tsx:230-266`

This severity assumes G-14 is fixed and Gallery is hard-capped at 10. At that size, a plain horizontal `ScrollView` may be simpler and fast enough; virtualization is no longer automatically justified.

Each `GalleryItem` still mounts an always-present `FocusOverlay` containing:

- a full-screen portal and native `BlurView`;
- a second full-size `GalleryFrame` subject clone;
- another Paper/Print render, including image and Ink overlay resources;
- per-item animated values, effects, dimension subscriptions, and menu animation state.

Each `GalleryFrame` declares seven shadow effects: two on the board, four on the mat, and one on the well. At capacity, the visible frames plus overlay clones create up to 10 full-screen overlay trees, 20 full artefact renderings, and 140 shadow layers/drawables. G-02 also makes Home pay this bounded cost at cold start before Gallery is requested.

**Resolution:** move focus state and one shared `FocusOverlay` to `GalleryPager`. Mount it only for the active item while opening, open, or closing.

Keep the `ScrollView` if device profiling with 10 Print-and-Ink artefacts meets launch, memory, and scroll budgets. Introduce virtualization only if measurements justify the added complexity.

Pass the already-known screen width or natural artefact layout into `GalleryFrame` rather than subscribing again in every visible frame and clone. Only force a non-collapsible native root when a frame actually needs trigger measurement.

### G-15 — The portrait frame is geometrically faithful but visually incomplete

**Severity:** Medium  
**Locations:** `temp/frames.astro:31-40`, `temp/frames.astro:46-105`, `src/components/GalleryFrame.tsx:2-12`, `src/components/GalleryFrame.tsx:30-67`, `src/components/GalleryFrame.tsx:107-167`, `src/components/GalleryFrame.tsx:193-215`

The port correctly preserves the required portrait structure:

- the well is 3:4;
- the mat is 132% of the well, with centering equivalent to the source's `-16%` offset;
- the outer board is 145%, with centering equivalent to `-22.5%`;
- board, mat, well, and artefact paint in the correct back-to-front order;
- fitting the outer board to both available width and height is a sensible mobile adaptation.

Portrait-only support is therefore faithful to the confirmed app scope. The material finish is not equally faithful:

- the source uses `object-cover` and `2vw` frame-level image padding, while the app contains the entire live Paper/Print surface and has no equivalent frame padding;
- the source's white-to-`#f8f8f8` radial mat highlight is absent;
- five long outer-board shadows plus an inset white highlight have been reduced to two conventional shadows;
- the image inset shadow is approximated on the well instead of the subject itself.

Containing live user-authored text and Ink is a defensible product adaptation and is safer than cropping it. However, the header in `GalleryFrame.tsx` currently attributes `contain` behavior to the Astro source, whose subject is explicitly `object-cover`. It also describes Paper and Print chrome as if they were the same, although Paper uses its own padding and Print owns the fixed top padding and gap.

**Resolution:** document exact source geometry separately from deliberate app adaptations. Keep `contain` unless product explicitly accepts cropping user content. If closer visual parity is required, restore only the highest-value cues—a subtle mat center highlight and board inner edge, followed by a tuned reduced outer-shadow stack—rather than copying every source shadow before profiling.

Approve the result against reference screenshots on iOS and Android, then profile a full 10-item Print-and-Ink Gallery before increasing layer count.

### G-16 — Frame depth is unsupported across part of the declared Android range

**Severity:** Medium  
**Locations:** `package.json:28`, `package.json:53`, `src/components/GalleryFrame.tsx:198-215`

The installed React Native 0.86 parser accepts the current multi-value `boxShadow` strings and `transformOrigin: "top left"`. The platform renderer is the problem: outset box shadows require Android API 28+, and inset shadows require API 29+.

Expo SDK 57 supports Android 7 and later, so supported API 24–27 devices render none of the frame shadows. API 28 renders the outer shadows but drops the mat and well inset depth. The frame therefore becomes substantially flatter on supported older Android devices without an error or fallback. See the [Expo SDK 57 platform matrix](https://docs.expo.dev/versions/v57.0.0/) and [React Native `boxShadow` support notes](https://reactnative.dev/docs/view-style-props#boxshadow).

**Resolution:** either explicitly accept and visually test the flat degradation, or add a simple older-Android treatment: `elevation` for the outer board and nested borders/overlays for essential inner edges. Do not add a large rendering dependency solely to reproduce a subtle gradient. Test representative API 24–27, API 28, API 29+, and iOS devices or emulators.

### G-02 — The camera-shift force-mounts Gallery at cold start and does not actually freeze the inactive tab

**Severity:** High  
**Locations:** `src/components/tabs/CameraShiftTabSlot.tsx:41-50`, `src/components/tabs/CameraShiftTabSlot.tsx:54-93`, `docs/adr/0010-camera-shift-tab-transition.md:5-7`

The custom slot sets `detachInactiveScreens={false}`, overwrites `loaded` with `true`, and calls `descriptor.render()` for every route. As a result, Gallery's query, full list, images, portals, and effects all mount while the user is still on Home. The inactive wrapper only sets `pointerEvents="none"` and accessibility flags; that blocks input but does not freeze React effects, queries, rendering, or native resources. The ADR's claim that the inactive scene is “frozen” is therefore false.

This is especially costly because Home already warms all entries at startup. The new code adds another whole-Gallery query and the G-01 native tree before Gallery is requested. It also expands this feature into a replacement navigation architecture with app-wide failure modes.

The exact SDK documentation confirms that `TabSlot.renderFn` is the advanced override for persisting/unmounting screens and that `detachInactiveScreens` controls inactive screen removal: [Expo SDK 57 Router UI](https://docs.expo.dev/versions/v57.0.0/sdk/router/ui/).

**Resolution:** restore the default lazy `TabSlot` for this release, or gate `descriptor.render()` until a route is first focused. If the camera shift is a product requirement, ship it separately after profiling a bounded implementation (for example, a lightweight snapshot/placeholder for the destination, then keep-alive only after first visit). Update ADR-0010 to describe actual lifecycle behavior and measured budgets.

### G-03 — The post-add destination is consumed against stale data

**Severity:** High  
**Locations:** `src/gallery/GalleryAddSheet.tsx:142-160`, `src/gallery/pendingGalleryPage.ts:7-16`, `src/components/GalleryPager.tsx:132-162`

The success path sets a numeric pending index, bumps `galleryVersion`, and immediately navigates. Because Gallery is force-mounted, the bump first re-renders `GalleryPager` with its old `items`. Its layout effect calls `consumePendingGalleryPage()` **before** checking whether the refreshed item exists:

- if the old Gallery is empty, pending index `0` is discarded and the effect returns;
- if the old Gallery has `N` rows, the new index `N` is clamped to `N - 1`;
- when the asynchronous `getGallery()` refresh later supplies the new row, the pending value is already `null`.

The user therefore lands on the previous last artefact instead of the artefact just featured. The unstable `jumpToIndex` function identity also causes the consuming effect to run on unrelated renders.

**Resolution:** store a pending **artefact ID**, not a positional index. After the refreshed rows contain that ID and the pager ref/content is ready, find its current index, jump once, then clear the pending ID. Make `jumpToIndex` stable or keep the consumption effect independent of function identity. This also remains correct if ordering changes between persistence and render.

### G-04 — Cancel/dismiss during Add does not cancel the operation

**Severity:** High  
**Locations:** `src/gallery/GalleryAddSheet.tsx:116-121`, `src/gallery/GalleryAddSheet.tsx:133-165`, `src/gallery/GalleryAddSheet.tsx:252-284`

Only the Add button is disabled while `busy`. Cancel remains enabled, and a downward sheet gesture still calls `onClose()`. Neither action cancels or invalidates the promise chain. Under slow I/O, the following sequence is possible:

1. Tap Add.
2. Tap Cancel or swipe the sheet closed.
3. Continue using Home or open another Add session.
4. The old operation finishes, features the artefact, bumps Gallery, closes whatever session is now active, and pushes `/gallery`.

This violates explicit cancellation, performs a mutation after the user backed out, and can disrupt a later session.

**Resolution:** once the transaction starts, disable Cancel and gesture dismissal and present the operation as committing; or attach a session/generation token and guard every post-await state change and navigation against the still-active session. If cancellation must remain available, define transaction semantics that prevent the mutation from starting after cancellation rather than merely hiding its completion.

### G-05 — Rotation/resizing breaks logical page identity

**Severity:** High  
**Locations:** `app.json:5`, `src/gallery/GalleryAddSheet.tsx:41-67`, `src/gallery/GalleryAddSheet.tsx:109-137`, `src/components/GalleryPager.tsx:107-124`

The app allows rotation. In the Add sheet, changing dimensions recalculates `snap` and reruns the layout effect, which scrolls visually to `clampedInitial`. The `page` state is not reset, so `selected` still references the artefact viewed before rotation. The visible frame and the artefact passed to `addArtefactToGallery()` can therefore differ—a core data-correctness failure.

The main Gallery pager has the related problem: it retains the old pixel offset while dividing it by the new `screenWidth`, leaving the pager between pages or on the wrong artefact after rotation.

**Resolution:** make artefact ID the source of truth for selection. On size changes, resolve that ID to its current index and atomically restore both the native offset and shared/React page state using the new page size. Separate one-time session initialization from resize restoration; do not reuse `initialPage` for every layout change.

### G-06 — Persistence failures are hidden or unhandled

**Severity:** Medium  
**Locations:** `src/components/GalleryPager.tsx:132-149`, `src/components/GalleryPager.tsx:178-186`, `src/gallery/GalleryAddSheet.tsx:94-107`, `src/app/(tabs)/gallery.tsx:1-8`

- A Gallery read failure replaces data with `[]` and renders the truthful empty-state copy, so a transient database error looks like data loss.
- A remove failure is explicitly ignored after the action overlay closes.
- `getFeaturedArtefactIds()` has no rejection handler, allowing an unhandled rejection and temporarily enabling Add with unknown membership state.
- The new Gallery route exports no error boundary or retry UI.

**Resolution:** follow `DatabaseProvider`'s existing explicit error/retry pattern: retain the last good rows during refresh failure, render a distinct error with Retry on initial failure, surface remove failure, and keep Add disabled until membership lookup succeeds. Catch every promise. Export a route `ErrorBoundary` with retry for unexpected render failures; Expo SDK 57 supports route-level boundaries: [Expo SDK 57 Router API](https://docs.expo.dev/versions/v57.0.0/sdk/router/).

### G-07 — Add sheet lifecycle causes first-open jank and retains hidden native views

**Severity:** Medium  
**Locations:** `src/gallery/GalleryAddSheet.tsx:45-86`, `src/gallery/GalleryAddSheet.tsx:129-180`, `src/gallery/GalleryAddSheet.tsx:182-228`

On first open, `contentHeight` is `0`, so the open detent is `screenHeight`. Only after layout does state replace it with the measured content height. The native sheet therefore begins opening toward full screen and then changes its detent, adding a render and a visible resize/jump on the first presentation.

After close, `cachedEntry` is never cleared and `activeEntry` falls back to it. The component therefore continues to render the closed sheet and up to five framed artefacts/images indefinitely at the root, rather than returning `null`. At five artefacts, that includes another 35 declared frame-shadow effects plus the Print/Ink image views. This is bounded per session but needlessly retains native/image work for the rest of the app lifetime.

**Resolution:** use the bottom-sheet library's native content detent (`detents={[0, "content"]}`) instead of JS measurement. Keep the session payload only through the close animation, clear it from `onSettle(0)`, and unmount the sheet content afterward. This also removes the render-phase open/previous-open state synchronization.

### G-08 — Artefact delete/restore no longer restores Gallery membership

**Severity:** Medium  
**Locations:** `src/db/repositories/artefacts.ts:176-198`, `src/db/repositories/artefacts.ts:200-233`, `docs/adr/0001-soft-delete-tombstones.md:5-12`, `CONTEXT.md:35-41`

`softDeleteArtefact()` now tombstones the active Gallery membership, but `restoreArtefact()` restores only the artefact and FTS row. Undo therefore resurrects the artefact without its prior featured state. This contradicts the documented Undo meaning and ADR-0001's requirement that child tombstones support independent restore. Entry soft-delete currently leaves Gallery membership active and relies on the read join, so artefact and entry undo behavior is also inconsistent.

There is no current UI callsite for artefact deletion, which lowers immediate exposure, but this change modifies the repository contract and would silently lose Gallery state as soon as delete/undo is wired.

**Resolution:** choose and document one invariant. The simplest is to leave Gallery membership active while the artefact is tombstoned (the Gallery query already filters deleted artefacts), so restore makes it reappear. Otherwise record which membership tombstone was caused by the artefact deletion and restore it atomically only when appropriate. Add transaction-level delete/restore tests.

### G-09 — Closed overlays remain exposed to assistive technology

**Severity:** Medium  
**Locations:** `src/components/GalleryPager.tsx:92-100`, `src/components/FocusOverlay.tsx:230-265`

`pointerEvents="none"` disables touch dispatch but does not remove descendants from the VoiceOver/TalkBack tree. Every Gallery row contributes invisible “Dismiss gallery options” and “Delete from Gallery” controls through the root portal. Those portals also escape the inactive tab wrapper's accessibility hiding.

**Resolution:** preferably mount one shared overlay only for the active item. In all cases, set `accessibilityElementsHidden={!open}`, `importantForAccessibility={open ? "yes" : "no-hide-descendants"}`, and modal semantics while open; verify traversal on both VoiceOver and TalkBack.

### G-10 — Add performs avoidable whole-Gallery work

**Severity:** Medium  
**Locations:** `src/gallery/GalleryAddSheet.tsx:94-107`, `src/gallery/GalleryAddSheet.tsx:142-159`, `src/db/repositories/gallery.ts:50-65`, `src/db/repositories/gallery.ts:100-150`

Every sheet open reads every featured ID even though the entry contains at most five artefacts. Confirming Add then loads and maps the entire Gallery solely to calculate a destination index. The version bump immediately loads and maps the entire Gallery again. Latency and allocation therefore grow with the user's complete Gallery on a path that should be one small membership check plus one write.

**Resolution:** query membership only for the displayed artefact IDs (or one selected ID), remove the pre-insert `getGallery()`, and target the destination by artefact ID as described in G-03. If ordering metadata is needed, have `addArtefactToGallery()` return it from the transaction.

### G-11 — Required formatting fails

**Severity:** Low (hard release-gate failure)  
**Locations:** `src/components/GalleryFrame.tsx`, `src/gallery/GalleryAddSheet.tsx`

`pnpm fmt:check` fails on both files, so the repository's aggregate `pnpm check` cannot pass.

**Resolution:** run `pnpm fmt`, inspect the resulting diff, then rerun `pnpm check`.

### G-12 — Dead/scaffolding code remains in the production change set

**Severity:** Low  
**Locations:** `src/components/tabs/CameraShiftTabSlot.tsx:54-60`, `src/gallery/pendingGalleryPage.ts:19-21`, `src/db/repositories/gallery.ts:50-58`, `src/components/GalleryFrame.tsx:37-38`

The change contains an empty `if` block, unused `peekPendingGalleryPage`, unused/re-exported `isArtefactInGallery`, and a deprecated frame-aspect alias. `wellSizeForMaxWidth()` itself is used by `wellSizeFittingBoard()` and is not dead, although its public export may be unnecessary.

`temp/frames.astro` is not part of this finding: it is now confirmed as the frame design reference. Because it imports files from a different Astro project and is not runnable here, either keep it as local/uncommitted review input or preserve the relevant portrait ratios, surface values, and provenance in a focused design note.

**Resolution:** delete genuinely unused exports and branches. Narrow exports to actual consumers, and do not present non-runnable reference material as production source code.

### G-13 — Gallery copy violates domain language and overstates removal

**Severity:** Low  
**Locations:** `src/components/GalleryPager.tsx:64-73`, `src/components/GalleryPager.tsx:197-201`, `CONTEXT.md:11-13`, `CONTEXT.md:27-33`

The user-facing empty state says “No items in gallery” even though the domain model explicitly says to call them Artefacts and avoid “Item.” The action says “Delete from Gallery,” but it only tombstones Gallery membership; the artefact remains in the journal. The destructive wording can make users fear content deletion.

**Resolution:** use canonical, precise copy such as “No artefacts in Gallery yet” and “Remove from Gallery.” Consider a brief undo/confirmation affordance for removal.

## Validation performed

| Check                                              | Result                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `git diff --check`                                 | Pass                                                                                             |
| `pnpm test`                                        | Pass — 8/8 focused SQLite/identity tests                                                         |
| `pnpm fmt:check`                                   | Pass                                                                                             |
| `pnpm typecheck`                                   | Pass                                                                                             |
| `pnpm lint`                                        | Pass                                                                                             |
| `pnpm lint:rc`                                     | Pass                                                                                             |
| `pnpm healthcheck:rc`                              | Pass — 88/88 remaining components compiled                                                       |
| `pnpm check`                                       | Pass                                                                                             |
| `pnpm exec expo export --platform ios --clear`     | Pass — production iOS bundle exported                                                            |
| `pnpm exec expo export --platform android --clear` | Pass — production Android bundle exported                                                        |
| Physical 10-artefact Print+Ink profile             | **Pending manual validation** — requires representative physical iOS and Android devices         |
| Reference screenshot comparison                    | **Pending manual validation** — requires product visual approval on representative iOS/Android   |
| VoiceOver/TalkBack traversal                       | **Pending manual validation** — accessibility tree is fixed statically but needs device sign-off |

G-16 remains intentionally unaddressed. Its older-Android fallback/test matrix is outside this implementation request.

## Original suggested fix order

The implementation followed this order. All code actions are complete except the explicitly excluded G-16; the device-only sign-offs are recorded in the validation table above.

1. Enforce the hard 10-artefact invariant across writes and sync/import paths (G-14).
2. Remove per-row overlays and profile the bounded Gallery (G-01), then stop cold-start force mounting (G-02).
3. Replace pending indices with artefact identity and repair resize identity (G-03, G-05).
4. Make Add session completion/cancellation race-safe (G-04).
5. Add explicit error/retry paths and accessibility hiding (G-06, G-09).
6. Simplify the sheet/query lifecycle and restore delete/undo invariants (G-07, G-08, G-10).
7. Sign off the intentional frame adaptations and older-Android treatment without recreating the full expensive source shadow stack (G-15, G-16).
8. Clean formatting, scaffolding, and copy; rerun all gates (G-11–G-13).
