---
status: accepted
---

# Share UI uses Software Mansion bottom sheet; Focus/expand stay portals

Artefact Share presents as a `@swmansion/react-native-bottom-sheet` modal sheet (carousel, background swatches, share actions). Ephemeral Focus and entry expand remain portal overlays per ADR-0005 — Share is a distinct “picker + destination” surface that benefits from native sheet detents and scrim, and the library is the intended path for future sheet-based chrome. Focus fully dismisses before the Share sheet opens so blur/morph and sheet presentation do not stack.

Share has two deliberately different export bounds. Canvas destinations (Copy, Download, and the system sheet) capture a fixed 1080×1920 opaque frame. Stories capture only the artefact’s intrinsic transparent bounds and let Instagram/Facebook supply the selected background color. Putting the sticker back inside a fixed 1080×1920 transparent frame makes the receiving app scale that entire frame, producing a visibly narrow sticker.

## Considered options

- **Custom portal sheet (Reanimated)** — rejected for Share: more gesture work for a standard sheet; conflicts with the goal of standardizing on SM sheets later.
- **gorhom/bottom-sheet** — rejected: heavier dependency; team preference is Software Mansion’s sheet for future overlay migration.
- **Native formSheet route** — rejected: Share is not a navigable destination and must sit over Home after Focus closes without a stack push.
