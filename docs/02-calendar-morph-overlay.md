# Calendar bottom sheet

> The filename remains stable for existing links. The active calendar is a
> native bottom sheet; the former fullscreen bloom files remain dormant until a
> separate cleanup.

## Active files

| File | Responsibility |
| --- | --- |
| `src/app/index.tsx` | Owns sheet presentation, Selected Day, coordinated complete-Day hand-off, body exit/entrance, and the pending exact-Entry target |
| `src/components/HomeHeader.tsx` | Plain accessible date trigger |
| `src/components/CalendarSheet.tsx` | Persistent zero-detent shell, header, fades, tab lifecycle, dismissal, and containment |
| `src/components/CalendarRecentTab.tsx` | Virtualized, keyset-paged Recent rows with inline Day labels |
| `src/components/CalendarMonthlyTab.tsx` | Virtualized chronological month grids, inline month indicators, range bounds, markers, Focused Month tracking, and the final scroll bound |
| `src/components/CalendarEntryPreview.tsx` | Visible first-Artefact renderer and static count silhouettes |
| `src/data/calendarBrowse.ts` | Pure grouping, heading, month-range, and focal-line helpers |
| `src/data/calendarBrowseCache.ts` | First Recent page and four-month lightweight marker cache |
| `src/data/entriesCache.ts` | Eight-Day complete-entry LRU with in-flight de-duplication |
| `src/data/calendarNavigationTransition.ts` | Pure coordinator that joins Day readiness to native-sheet dismissal |
| `src/data/paperContentReadiness.ts` | Document-scoped latch that bridges native Paper readiness to a later hand-off request |

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
Its native list scrolling is disabled until it becomes active, so a retained
shorter-header tab cannot steal drag recognition from the active header.

## Fixed header and fades

The tabs and close control are always fixed above the lists; the Focused Month
heading and weekday row appear only on Monthly. A solid white scrim makes the
complete active header opaque, and a short `AnimatedEdgeFadeView` overlay
begins below its text. Recent uses the shorter tabs-only scrim and fade so its
first inline Day label starts directly below them. Content can pass underneath
the lower fade without bleeding through the fixed labels. The separate bottom
fade animates in only while real list content remains below; trailing layout
padding is excluded from that decision.

Pulls that begin inside either scrollable remain owned by that scrollable even
at its top boundary. Sheet drag-to-close begins from the opaque header/handle
region instead, while X, scrim press, and Android Back remain available.

Headings deliberately match the English mockups for this release:

- Recent Day label: `30 SEP 2026`
- Monthly: `september 2026`
- weekdays: `M T W T F S S`

## Recent

The repository keyset-pages lightweight previews in
`(date, sort_order, id) DESC` order. Each preview contains Entry identity,
Artefact count, and only its first non-deleted Artefact. A partial active-entry
index covers that ordering, and page lookahead prevents an odd boundary from
later reshaping a one-card row into a pair.

Rows contain at most two Entries and never mix Days. Each Day group has one
compact gray label above its first row, and every preview card uses the same
`#F8F8F8` surface regardless of scroll position. The first four prepared rows
and subsequent viewable rows mount the canonical Paper/Print/Ink renderer. Up
to four horizontally offset white silhouettes use Home's stack spacing to
communicate the complete one-to-five Artefact count without hydrating hidden
Artefacts.

Selecting a card begins the complete-Day query while the native sheet closes.
When that query resolves, Home mounts a lightweight, display-only copy of the
selected Entry below the viewport: its first real Artefact plus horizontally
offset white silhouettes for the remaining count. It deliberately omits
`DayPager`, `Stack`, portals, hidden Artefacts, and interaction state so its
native commit does not compete with the old body's exit. The old body does not
begin its 350 ms exit until the native sheet has completely settled at zero.
After that exit finishes, the prepared Entry immediately returns upward without
expanding it.

## Monthly

Month IDs are chronological from the persisted User Creation Month through the
current month. The current month is positioned under the fixed header on first
visit; scrolling upward reveals the past. The complete first month is visible,
but Days before the exact User Creation Day are disabled, as are future Days.
Every grid places a fixed-English uppercase three-letter month indicator in the
same weekday column as Day 1. The list's measured viewport determines its
trailing space, making the current month's start the final resting position
rather than allowing the grid to stop partially behind the header.

Visible months and a one-month buffer request only distinct Entry-type presence.
Each Day renders at most one yellow Paper marker, one magenta Print marker, and
one neutral marker for future unsupported types. Marker failure leaves the
calendar selectable and exposes a local Retry control.

After dismissal, marker models outside the current/previous-month prepared
window are removed while the list is hidden. This bounds retained state without
making markers rehydrate in front of the user on the next presentation.

The month crossing the shared focal line receives the darker background. The
underline follows Home's Selected Day, not the current Day. Selecting any
enabled Day uses the same coordinated dismissal/query hand-off and lands Home
on the first Entry or the existing empty-Day state.

## Data and failure boundaries

Home no longer preloads the journal. Complete Days use a bounded eight-Day LRU
whose concurrent readers share one Promise and whose rejected or invalidated
loads cannot populate the cache. Recent's resolved first page and at most four
month marker Promises are the only process-level calendar summaries.

Calendar-origin misses do not change Home to a loading route. Selection starts
the query and native close together while leaving the prior valid Day still.
A resolved Day mounts only a lightweight visual of its selected Entry in a
non-interactive, accessibility-hidden layer one window height below Home. The
visual renders the first real Artefact and plain white silhouettes for the
remaining count; it does not mount `DayPager`, an interactive `Stack`, portals,
or hidden Artefact content. Native settle at zero then starts the old body's
350 ms downward exit. Only after that exit completes may the prepared layer
fade and translate upward over 350 ms. If preparation completed within the
combined sheet-close and exit window, entrance follows exit with no blank
frame; otherwise the body stays empty until preparation really finishes.

The prepared Entry completes its entrance before Home adopts the canonical
complete-Day route body. At that point the prepared layer is stationary and
opaque, so the full Day can mount in final on-screen geometry behind it without
contending with animation frames or changing ScrollView clipping. For a
non-empty Paper Entry, the native surface reports readiness only after TextKit
has laid out the current document at non-zero bounds. A document-scoped latch
retains that edge-triggered readiness when layout happened before Calendar made
its request, then reports it exactly once for the matching hand-off. Home does
not retire the prepared cover before that signal. Other Entry types retire the
cover on the frame after canonical adoption. This briefly duplicates only one
real Artefact plus silhouettes rather than two complete Day trees, and retains
no transition copy outside that bounded window. Both bodies reject pointer
input and hide descendants from iOS and Android accessibility until the
handoff completes or recovery restores the old body.

Failures remain local:

- Recent first-page and later-page failures have separate Retry states.
- Monthly marker failure keeps grids and Day selection available.
- One canonical preview failure replaces only that preview.
- The sheet error boundary leaves the external X dismissal available.
- Ordinary uncached route changes clear the previous Day and present a stable
  loading/error state, so stale entries are never labelled as the new Day.
- Calendar-origin selection moves the previous Day below the viewport but
  leaves its state intact until the prepared hand-off is ready. Failure returns
  that unchanged body from below and presents a generic recovery alert with an
  Open Calendar action instead of exposing repository details.

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
