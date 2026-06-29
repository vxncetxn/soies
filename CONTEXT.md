# Soies

A personal journal app for daily entries made of stacked artefacts (text pages and photo prints).

## Language

**Entry**:
A titled collection of artefacts belonging to a single day.
_Avoid_: Post, note, item

**Artefact**:
One page or card inside an entry — either a Paper (text) or a Print (photo with caption).
_Avoid_: Page, card, slide

**Paper**:
An artefact that is text-only.
_Avoid_: Note, document

**Print**:
An artefact that pairs an image with a caption.
_Avoid_: Photo, image post

**Day**:
A calendar date that groups zero or more entries.
_Avoid_: Date page, journal day

**Gallery**:
A collection entries can be added to (via "Add to Gallery").
_Avoid_: Album, folder

**Tombstone**:
A soft-deleted row marked by a non-null `deleted_at`; excluded from reads but retained for sync.
_Avoid_: Hard delete, purge

**Undo**:
Reverses a soft-delete by clearing `deleted_at` on the tombstoned row.
_Avoid_: Restore, undelete
