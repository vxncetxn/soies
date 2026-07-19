# Calendar bottom sheet

> The filename remains stable for existing links. The active calendar is a
> native bottom sheet; the former fullscreen bloom files remain dormant until a
> separate cleanup.

## Active files

| File | Responsibility |
| --- | --- |
| `src/app/index.tsx` | Owns sheet presentation, Selected Day, complete-Day loading, and the pending exact-Entry target |
| `src/components/HomeHeader.tsx` | Plain accessible date trigger |
| `src/components/CalendarSheet.tsx` | Persistent zero-detent shell, header, fades, tab lifecycle, dismissal, and containment |
| `src/components/CalendarRecentTab.tsx` | Virtualized, keyset-paged Recent rows and Focused Day tracking |
| `src/components/CalendarMonthlyTab.tsx` | Virtualized chronological month grids, range bounds, markers, and Focused Month tracking |
| `src/components/CalendarEntryPreview.tsx` | Visible first-Artefact renderer and static count silhouettes |
| `src/data/calendarBrowse.ts` | Pure grouping, heading, month-range, and focal-line helpers |
| `src/data/calendarBrowseCache.ts` | First Recent page and four-month lightweight marker cache |
| `src/data/entriesCache.ts` | Eight-Day complete-entry LRU with in-flight de-duplication |

The architecture decision and full interaction contract live in
[ADR-0013](./adr/0013-native-calendar-sheet-with-lazy-content.md) and the
[approved implementation plan](./calendar-bottom-sheet-implementation-plan.md).

## Presentation lifecycle

`CalendarSheet` stays mounted with native detents `[0, openHeight]`. After the
first Home frame, its bounded Recent and Monthly virtualized trees are prepared
while hidden and then retained. This separates instant native motion from cold
data work without rebuilding canonical previews or marker views at every open
or tab visit.

```mermaid
sequenceDiagram
  participant User
  participant Home
  participant Sheet
  participant Native
  participant Tab

  User->>Home: press date control
  Home->>Sheet: open=true + tap timestamp
  Sheet->>Native: move from detent 0 immediately
  Native-->>Sheet: first nonzero position
  Note over Sheet,Tab: prepared trees are already painted; an immediate cold first open uses a stable placeholder
  User->>Sheet: X, drag, scrim, Back, Entry, or Day
  Sheet->>Native: move to detent 0
  Native-->>Sheet: settle(0)
  Sheet->>Tab: reset Recent/current positions while hidden
  Sheet->>Tab: trim Recent pages and old marker state
```

After Home's first frame, idle work warms only the first Recent summary page
and current/previous month marker summaries. The shell records a development
tap-to-first-position measurement. Physical release builds must validate the
ADR's 50 ms p95 opening contract; cold data is allowed to show a placeholder,
but must never delay native movement.

The last selected tab survives dismissal. Each new presentation resets Recent
to the newest Entry and Monthly to the current month. Within one presentation,
both retained trees preserve their native positions. A short opacity crossfade
uses fixed per-tab opacity values, so an in-flight animation never remaps
active/outgoing roles. The inactive tree remains painted but non-interactive.

## Fixed header and fades

The tabs, Focused Day/Month heading, close control, and Monthly weekday row are
fixed above the lists. A solid white scrim makes the complete header opaque;
a short `AnimatedEdgeFadeView` overlay begins only below its text. Content can
pass underneath that lower fade without bleeding through the labels. The
separate bottom fade animates in only while real list content remains below;
trailing layout padding is excluded from that decision.

Headings deliberately match the English mockups for this release:

- Recent: `30 september 2026`
- Monthly: `september 2026`
- weekdays: `M T W T F S S`

## Recent

The repository keyset-pages lightweight previews in
`(date, sort_order, id) DESC` order. Each preview contains Entry identity,
Artefact count, and only its first non-deleted Artefact. A partial active-entry
index covers that ordering, and page lookahead prevents an odd boundary from
later reshaping a one-card row into a pair.

Rows contain at most two Entries and never mix Days. All rows belonging to the
Day crossing the 40%-viewport reading line use the darker background; a small
hysteresis band prevents boundary flicker. The first four prepared rows and
subsequent viewable rows mount the canonical Paper/Print/Ink renderer. Up to
four horizontally offset white silhouettes use Home's stack spacing to
communicate the complete one-to-five Artefact count without hydrating hidden
Artefacts.

Selecting a card begins the complete-Day query while the native sheet closes,
updates the Home route, and asks `DayPager` to position the exact Entry without
expanding it.

## Monthly

Month IDs are chronological from the persisted User Creation Month through the
current month. The current month is positioned under the fixed header on first
visit; scrolling upward reveals the past. The complete first month is visible,
but Days before the exact User Creation Day are disabled, as are future Days.

Visible months and a one-month buffer request only distinct Entry-type presence.
Each Day renders at most one yellow Paper marker, one magenta Print marker, and
one neutral marker for future unsupported types. Marker failure leaves the
calendar selectable and exposes a local Retry control.

After dismissal, marker models outside the current/previous-month prepared
window are removed while the list is hidden. This bounds retained state without
making markers rehydrate in front of the user on the next presentation.

The month crossing the shared focal line receives the darker background. The
underline follows Home's Selected Day, not the current Day. Selecting any
enabled Day starts its complete-Day query during dismissal and lands Home on
the first Entry or the existing empty-Day state.

## Data and failure boundaries

Home no longer preloads the journal. Complete Days live in an eight-item LRU;
concurrent readers share one Promise, and rejected or invalidated loads cannot
populate the cache. Recent's resolved first page and at most four month marker
Promises are the only process-level calendar summaries.

Failures remain local:

- Recent first-page and later-page failures have separate Retry states.
- Monthly marker failure keeps grids and Day selection available.
- One canonical preview failure replaces only that preview.
- The sheet error boundary leaves the external X dismissal available.
- Home clears the previous Day on an uncached route change and presents a
  stable loading/error state, so stale entries are never labelled as the new
  Day.

## Date invariants

`users.creation_day` is an immutable local `YYYY-MM-DD`, distinct from the UTC
millisecond `created_at`. Migration backfills existing Users once using local
calendar time; the deterministic development seed uses January 1, 2026. New
Users persist today's local Day at creation.

Untrusted Home and Widget values pass through the strict canonical Day
validator before any query or calendar calculation. Impossible values such as
`2026-02-30` fall back to today rather than being normalized by JavaScript.

## Dormant legacy path

`BloomButton`, `BloomPanel`, and the `bloom` portal remain active for other
features. `CalendarOverlay` and `MorphOverlay` have no calendar callsite after
this change; their removal is intentionally deferred so this feature does not
mix behavior work with unrelated cleanup.
