---
status: accepted
---

# Print image acquisition is a seam; v1 uses the system picker and persists media only on save

Print create needs an image before the Create overlay opens. v1 acquires it via `expo-image-picker` (Take picture → camera, Camera roll → library) behind `pickPrintImage`, then downscales to the expanded Print image-frame pixel size. The helper is the intentional seam for a future in-app camera: callers only depend on `PickPrintImageResult`, not on the system UI. Media is copied into `Documents/artefacts` only inside `savePrintEntry` on submit so cancel leaves no orphan files; the pending URI lives in create session state until then.

The database persists the container-independent `artefacts/<filename>` reference,
not a complete `file://` URI. iOS may change an app data-container UUID across a
native reinstall or update while preserving the Documents contents. Read mapping
therefore resolves both stable references and legacy absolute
`.../Documents/artefacts/<filename>` values against the current Documents URI.

## Considered options

- **Custom Vision Camera capture in v1** — rejected for this iteration: heavier lifecycle on the Home path, more UI to animate against the bloom; kept as the planned replacement behind the same seam.
- **Copy into app storage on pick** — rejected: cancel would leave orphans and slows the path into Create.
- **Open Create before the image exists** — rejected: Create’s contract is “ready to author,” and Home→Create animation should not run behind the system picker.
