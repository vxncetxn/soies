# soies

A personal journaling app for dated **entries** made of **artefacts** (papers and prints).

## Language

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

**Gallery**:
A curated collection entries can be added to for browsing outside the day pager.
_Avoid_: Album, folder

**Tombstone**:
A soft-deleted record marked by `deleted_at`; hidden from reads but retained for sync.
_Avoid_: Hard delete, purge

**Undo**:
Reversing a tombstone by clearing `deleted_at` before the undo window closes.
_Avoid_: Restore, revert
