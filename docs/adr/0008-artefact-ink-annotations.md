---
status: accepted
---

# Artefact Ink lives in opaque `annotations` + overlay PNG; never inside `data`

Ink (strokes drawn in Scribble) is durable per artefact. Stroke JSON is the edit source of truth; a transparent PNG overlay is the display cache for Home and surfaces that do not own a live canvas. Both are stored outside polymorphic `artefacts.data` so Paper/Print text/image payloads stay clean and older peers that round-trip `data` cannot drop Ink (ADR-0003).

Schema: nullable opaque `artefacts.annotations TEXT` (JSON). Version 2 records the source canvas width/height plus bounded, density-independent stroke geometry; replay scales that geometry into the current canvas. `NULL` is the canonical no-Ink value, which lets display queries project `has_ink` without transferring or parsing the full document. Overlay files use `{artefactId}.ink.png` under the artefacts media directory. Print photo bytes are never baked with Ink.

## Considered options

- **Ink fields inside `data` JSON** — rejected: conflicts with ADR-0003’s opaque `data` round-trip and couples Paper/Print parsers to Ink.
- **PNG-only (no stroke JSON)** — rejected: cannot re-enter Scribble to erase or continue editing committed strokes.
- **Bake Ink into Print images** — rejected: destroys the original photo and prevents independent Ink updates.

## Flicker-free canvas lifecycle

Each page in the Create pager's mounted window (active page ± one neighbor) keeps its own live `ArtefactInkCanvas` across Default and Scribble modes. Default mode and inactive neighbors disable pointer events instead of replacing their canvases with the PNG cache. Because an adjacent destination canvas is restored before a horizontal swipe reaches it, settling the pager no longer transfers canvas ownership or exposes PencilKit's `setStrokeData` reconstruction. Pages outside the window remain unmounted to bound native-canvas and Print-image memory.

Saving snapshots the current strokes, source canvas dimensions, and PNG from one immutable native revision without writing the same strokes back through `setStrokeData`. Native image encoding and file I/O run on a serial worker so Save does not block interaction. The exported PNG must prefetch successfully before commit completes; a false/rejected prefetch keeps Scribble open for Retry. After commit, the create-level Scribble session owns the temporary PNG until Entry Submit or session teardown. Individual canvases must not delete committed PNGs because pager virtualization can unmount them while draft state still references those files.

On iOS, history has two conflicting requirements:

- Rebuilding `PKCanvasView` gives PencilKit a correct internal stroke baseline, but visibly removes and redraws every stroke.
- Assigning `PKCanvasView.drawing` in place is visually stable, but PencilKit retains hidden baseline state; after Undo, the next new stroke can resurrect the removed stroke.

The native surface therefore uses a two-canvas handoff for Undo/Redo. It first applies the history drawing in place to the visible canvas, so the displayed pixels never disappear. It simultaneously prepares a fresh, interaction-disabled `PKCanvasView` behind it with the same drawing, tool, drawing policy, and layout. Immediately before the next drawing touch, `hitTest` promotes this baseline-correct canvas and removes the stale one. Because both canvases contain the same `PKDrawing`, the swap is invisible, while the next stroke starts from correct PencilKit state.

Full canvas reconstruction remains appropriate for external document replacement. Erasing is native and visible: one responder drag opens one history transaction, removes hit strokes as the pointer moves, and closes as one Undo/Redo step. Android hit-testing measures distance to sampled path segments rather than points alone, so fast sparse strokes remain erasable.
