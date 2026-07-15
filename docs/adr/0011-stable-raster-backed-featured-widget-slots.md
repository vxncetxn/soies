---
status: accepted
supersedes:
  - ADR-0010 Home↔Gallery tab lifecycle
  - Gallery-specific consequence in ADR-0001 soft-delete tombstones
---

# Five stable raster-backed configurable iOS widget slots

Featured Artefacts replace the Gallery runtime. Soies exposes five durable, numbered **Widget Slots** and one configurable iOS 17+ `systemLarge` widget. Each installed **Widget** chooses `slot1` through `slot5`; multiple installed instances may choose the same slot and receive the same atomic snapshot update.

The `featured_widget_slots` table stores only assignment intent. Its primary key is `slot_index` constrained to 1–5, and a partial unique index prevents one active Artefact from occupying several slots. A missing or tombstoned binding is genuinely empty. Soft-deleting a bound Artefact or Entry leaves its binding active but unavailable, so it reserves capacity and Undo restores the Featured Artefact in the same position. Existing `gallery_items` data remains historical data: it is not migrated, reinterpreted, or deleted.

Assignment chooses the lowest genuinely empty slot transactionally and returns typed assigned, duplicate, or full outcomes. The in-app sheet always presents all five positions. Empty and unavailable positions use branded framed placeholders; live positions use a cached raster rather than retaining five Paper/Print/Ink trees.

Frame PNGs are derived local cache data. A single-flight capture host lazily renders the shared `ArtefactFrame`, waits for layout, Print image, and Ink readiness, and writes a high-resolution transparent PNG into Expo Widgets' shared `widgetsDirectory`. The transparent canvas derives asymmetric crop insets from the frame's downward outer shadow, retaining its visible blur without wasting equal space above and below. WidgetKit's default margins are disabled, but the occupied layout supplies its own small content inset so the shadow never touches the widget edge. The filename includes the Artefact revision and frame renderer version. Artefact or Ink changes invalidate the image; Entry title/date changes only alter snapshot accessibility and deep-link data.

Publication sends one snapshot containing all five keyed states. Reconciliation runs after first paint and on foreground, immediately publishes empty/unavailable states, captures only missing or stale frames, and removes unreferenced captures only after a later successful publish. A capture or assignment failure leaves the picker retryable. A publication failure retains the committed assignment and retries because durable user intent takes precedence over transient extension refresh.

Widget links carry the slot and, when occupied, the exact date, Entry ID, and Artefact ID. Home consumes each command once, navigates to the day, jumps to the matching Entry, and expands its pager at the Artefact. Missing or deleted sources fall back to the five-slot sheet centered on the originating slot.

Android widget generation and every Featured Artefact affordance on Android/web are deferred. Management controls follow the centered slot: an empty slot shows **Add Artefact**, while a bound or unavailable slot shows **Replace** and **Delete**. Those actions and Help remain enabled silent no-ops for this milestone.

## Consequences

- Widget configuration is stable and native, but five is a build-time product limit until the extension contract changes.
- Rasterization preserves Soies' custom frame and Ink treatment in WidgetKit while keeping the widget layout and the in-app carousel lightweight.
- Slots and installed widgets are distinct: users may install fewer, more, or no widgets, and changing one slot updates every instance configured to it.
- The generated app and widget extension require iOS 17.0 and a development/production build; Expo Go cannot exercise this feature.
- ADR-0010 remains as history but no longer governs runtime because there is no Gallery route. ADR-0001 remains the general tombstone decision; this ADR replaces only its Gallery membership consequence with Widget Slot reservation behavior.
