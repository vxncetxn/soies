# soies

A personal journaling app for dated **entries** made of **artefacts** (papers and prints).

## Language

**User**:
The owner of a Soies journal.
_Avoid_: Account

**Entry**:
A dated unit of content, either a paper stack or a print stack.
_Avoid_: Post, note, card

**Artefact**:
The smallest unit inside an entry — a piece of text (paper) or an image with caption (print).
_Avoid_: Item, block, component

**Paper**:
An entry whose artefacts are text-only cards in A4 proportion.
_Avoid_: Note, document

**Print**:
An entry whose artefacts are polaroid-style image cards with captions.
_Avoid_: Photo entry, image post

**Day**:
A calendar date (`YYYY-MM-DD`) that groups zero or more entries.
_Avoid_: Page, session

**User Creation Day**:
The immutable local Day on which a User's Soies journal begins.
_Avoid_: Account-created date, creation timestamp

**Selected Day**:
The Day whose Entries are currently displayed on Home.
_Avoid_: Effective date, route date, active date

**Focused Day**:
The Day currently emphasized while browsing dated Entries.
_Avoid_: Current date, currently-scrolled date, active date

**Focused Month**:
The calendar month currently emphasized while browsing Days by month.
_Avoid_: Current month, currently-scrolled month, active month

**Featured Artefact**:
An Artefact assigned to a Widget Slot for framed presentation in the app and its configured Widget.
_Avoid_: Favourite, pinned artefact

**Widget Slot**:
One of five stable, numbered content positions. An Artefact is assigned to a slot; any number of installed Widgets may display that same slot.
_Avoid_: Widget instance, dynamic queue

**Widget**:
An installed iOS Home Screen instance configured to display one Widget Slot.
_Avoid_: Widget Slot, Featured Artefact

**Frame**:
The portrait presentation that exhibits an Artefact in Featured Artefacts and Widgets. It wraps live content for capture, but is derived presentation rather than a persisted entity.
_Avoid_: Exhibit, feature card, mat

**Tombstone**:
A soft-deleted record marked by `deleted_at`; hidden from reads but retained for sync.
_Avoid_: Hard delete, purge

**Undo**:
Reversing a tombstone by clearing `deleted_at` before the undo window closes.
_Avoid_: Restore, revert

**Type**:
Expanded create mode for editing artefact text (keyboard focus blooms the card).
_Avoid_: Edit mode, focus mode

**Scribble**:
Expanded create mode for drawing Ink on the current artefact.
_Avoid_: Annotate mode, draw mode, drawing tools

**Ink**:
Durable strokes plus a display overlay belonging to one artefact.
_Avoid_: Annotation (UI sense), scribble (for the data), drawing

**Share**:
Exporting a single artefact as a composed image (not the whole entry).
_Avoid_: Posting, publishing, sharing an entry

**Share image**:
The raster produced for a share target (full canvas or transparent sticker).
_Avoid_: Screenshot
