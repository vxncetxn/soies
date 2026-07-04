# Comment patterns (with examples)

Annotated patterns drawn from `src/components/BloomButton.tsx`, `src/components/DayPager.tsx`, and `src/components/FocusOverlay.tsx`. Read those files as the canonical exemplars; this file breaks the patterns down by location so you can apply them deliberately.

Each example is shortened with `// …` where the full file has more. Line numbers refer to the files at the time of writing — use them as pointers, not as a contract.

---

## 1. File header — identity, structure, why, mechanism, API, relationships

The header is a map, not a restatement. It covers identity → structure → the key choice + the bug it prevents → the mechanism as numbered steps → variants → the API contract with timing → siblings → tuning.

`FocusOverlay.tsx` (lines 1–25) — a tight example with the mechanism as numbered steps:

```tsx
/**
 * FocusOverlay — the long-press "actions" overlay for an entry.
 *
 * When you long-press a collapsed entry (or tap its ellipsis button), this
 * overlay appears: a blurred backdrop dims the screen, a **clone** of the
 * entry's deck is frozen on top of the original (so the deck looks "lifted"
 * out of the list), and a small menu of actions … fades in above it.
 *
 * How it works (the measure-and-morph pattern):
 *   1. On open, measure the collapsed deck's on-screen frame (`triggerRef`)
 *      from a UI-thread worklet and store it in `origin`.
 *   2. Spring `progress` 0 → 1. The backdrop fades in, the clone blooms in at
 *      the deck's measured position, and the menu items stagger in.
 *   3. On close, spring `progress` back to 0; when the spring *finishes*, call
 *      `onClose` via the JS thread. Waiting for completion avoids unmounting
 *      mid-animation.
 *
 * The overlay always lives in the root `morph` portal host and is always
 * mounted (preloaded) by `Stack` so opening never mounts it fresh. It only
 * animates when `open` flips — see the `isFirstRun` guard.
 *
 * Note: the menu items are currently wired to a no-op (`noopAction`) — this is
 * a UI/interaction prototype; the actions aren't implemented yet.
 */
```

Key moves: a one-line identity; a plain-English description of what the user sees; the mechanism as **numbered steps**; the *why* of a timing choice ("waiting for completion avoids unmounting mid-animation"); an explicit "this is a prototype" marker.

`BloomButton.tsx` (lines 1–57) is the long example — it additionally has a "Why split trigger and panel (the two-world problem)" paragraph that names the exact bug the architecture prevents (the close "jump"), a Variants section, and an API paragraph that pins *when* `onClose` fires and *why* ("so the calendar never re-renders mid-animation"). Match that length when the component has that much going on.

---

## 2. Props / type fields — role, ownership, invariants

Every field gets a comment. Cover: what it is, who owns/writes it, who reads it, and any sentinel or invariant.

`DayPager.tsx` (lines 36–53):

```tsx
type DayPagerProps = {
  entries: Entry[];
  // Measured height of one page. 0 means "not measured yet" — the ScrollView
  // waits for a real value before mounting.
  pagerHeight: number;
  // Safe-area-bounded max height, used by the parent to clamp the measurement.
  computedHeight: number;
  // Shared scroll offset (written here-read-by-parent). The parent owns it so
  // the header and indicator can react to scrolling.
  scrollOffset: SharedValue<number>;
  // Fractional current page (entries[round(currentPage)] is the visible one).
  currentPage: SharedValue<number>;
  // Scroll handler created by the parent with `useAnimatedScrollHandler`. Owned
  // upstream so the same worklet writes the parent's shared value directly.
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  // Callback to report the measured pager height back to the parent.
  onPagerHeightChange: (height: number) => void;
};
```

Note "written here-read-by-parent" and "owned upstream" — ownership direction is stated, not implied. Note the sentinel: `0 means "not measured yet"`.

---

## 3. Module-scope constants — tuning rationale

A constant's comment answers *why this value* and *what it controls visually/behaviourally*.

`FocusOverlay.tsx` (lines 49–64):

```tsx
// Spring for the open/close morph. `overshootClamping` keeps the clone from
// bouncing past its rest position (which would look like a glitch here).
const FOCUS_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
// Backdrop reaches full opacity over the first 20% of the animation.
const BACKDROP_FADE_END = 0.2;
// The clone fades in starting at 15% progress (after the backdrop has begun),
// so the deck appears to lift out as the blur comes up behind it.
const CLONE_BLOOM_START = 0.15;
// Menu items animate independently of the open spring so the stagger + fade are
// perceivable (the spring otherwise rushes through the menu range in ~100ms).
const MENU_BASE_DELAY_MS = 120;
```

Each comment ties the number to a perceptual effect ("looks like a glitch", "lifts out as the blur comes up", "stagger is perceivable"). A reader can tune with intent.

---

## 4. Declarations — thread, role, why-it-exists

For refs, state, and shared values: the role, the thread, and *why this value exists instead of reusing another*.

`FocusOverlay.tsx` (lines 162–174):

```tsx
// 0 = closed, 1 = open. Drives backdrop, clone, and (indirectly) the menu.
const progress = useSharedValue(0);
// The collapsed deck's measured screen frame. The clone is positioned here.
const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
// The clone's own progress/currentPage/activeIndex. We DON'T share the deck's
// real shared values because the clone must stay frozen at the captured page
// even if the underlying list scrolls while the overlay is open. We mirror
// `activePage` into these on change, below.
const cloneProgress = useSharedValue(0);
```

The standout is the *why-not-reuse*: "We DON'T share the deck's real shared values because the clone must stay frozen…". That is the decision a future dev would otherwise reverse by "simplifying" it and reintroducing the bug.

---

## 5. Function JSDoc — what, where it runs, why this way

A function's JSDoc has three jobs: what it does, **where it runs** (UI-thread worklet vs JS thread), and *why it's done that way*.

`BloomButton.tsx` (lines 207–233) — open:

```tsx
/**
 * Open: schedule a worklet on the UI thread that measures the inline
 * trigger, stores its frame in `origin`, then springs `progress` to 1.
 * Measuring on the UI thread is synchronous and flicker-free — the
 * measurement and the spring start in the same worklet, so the panel is
 * anchored to the trigger before it blooms in. If measure fails (e.g. the
 * ref isn't ready) we bail rather than morph from a 1×1 box.
 */
const animateOpen = useCallback(() => {
  scheduleOnUI(() => {
    "worklet";
    const layout = measure(triggerRef);
    if (!layout) return;
    // …
  });
}, [origin, progress, triggerRef]);
```

`FocusOverlay.tsx` (lines 218–233) — close, with the timing *why*:

```tsx
/**
 * Close the overlay: spring `progress` back to 0, and only when the spring
 * *finishes* (not if interrupted) hop back to the JS thread to call
 * `finishClose`. Waiting for completion means the overlay stays visible
 * throughout the close animation and only tears down when it's done.
 */
```

The phrase "only when the spring *finishes* (not if interrupted)" is the kind of precision that prevents a future dev from "fixing" a callback that fires on cancel.

---

## 6. JSX inline — what it is, prop rationale, pitfalls

Inline `{/* … */}` comments explain the element, why a prop is set, and the pitfall a choice avoids. Pitfall-callouts ("do NOT add…") are the highest-value inline comments.

`BloomButton.tsx` (lines 413–422) — the inline trigger:

```tsx
{/* Inline trigger — stays in normal layout, never teleported. This is
    the node we measure on open, so it needs `collapsable={false}` and a
    stable ref. `self-start` keeps it content-width (so a small menu
    button measures as a small button); a caller can pass `w-full` via
    className to make it full-width (the calendar does this).
    `pointerEvents` flips to none while open so taps pass through to the
    portal's backdrop/panel above. The border/bg here are the pill
    surface; the Pressable inside stretches to fill it (default
    alignItems stretch — do NOT add items-center, that would collapse
    the content width and break the fullscreen calendar layout). */}
```

`DayPager.tsx` (lines 145–149) — the side indicator:

```tsx
{/* Side scroll indicator: a vertical rail of dots/previews pinned to the
    right edge, vertically centered. `pointerEvents="box-none"` lets taps
    pass through the empty areas of this container to the pager beneath,
    while the indicator's own interactive elements still receive taps.
    It's faded out while an entry is expanded (see indicatorFadeStyle). */}
```

Both explain `pointerEvents` by the *gesture consequence* (taps passing through), not by the prop name.

---

## 7. StyleSheet — layout intent + why

Each style says what the layout does and *why* that property value.

`FocusOverlay.tsx` (lines 360–378):

```tsx
// The clone is positioned absolutely from (0,0) and translated to `origin`
// by the animated style. overflow visible so shadows aren't clipped.
clone: {
  position: "absolute",
  top: 0,
  left: 0,
  overflow: "visible",
},
// The menu is positioned absolutely; `alignItems: "flex-end"` right-aligns
// the items against the deck's right edge (set via menuStyle.width/left).
menu: {
  position: "absolute",
  alignItems: "flex-end",
},
```

"`overflow: visible` so shadows aren't clipped" — the *why* of a single property, which is exactly what a dev would otherwise flip to `hidden` and break the shadow.

---

## Anti-examples — don't write these

```tsx
// Import the module                 ← narrates what; delete
// Define the component               ← narrates what; delete
// Return the result                  ← narrates what; delete
// Handle the error                   ← narrates what; either delete or explain the actual recovery
// opacity: interpolate(progress, [0, 0.2], [0, 1]),   ← commented-out code; delete, use git
// The old teleported version jumped because…          ← describes removed code; delete with the code
```

The last two are the most toxic: commented-out code rots, and comments describing *removed* behaviour actively mislead. When code goes, its comments go with it.
