import assert from "node:assert/strict";
import test from "node:test";

import {
  closeGalleryFocus,
  completeGalleryFocus,
  openGalleryFocus,
} from "../src/gallery/galleryFocusSession.ts";

test("a closing focus session cannot be replaced and removes only its own artefact", () => {
  const opened = openGalleryFocus(null, { artefactId: "artefact-a" });
  const closing = closeGalleryFocus(opened, { remove: true });
  const rejectedReopen = openGalleryFocus(closing, { artefactId: "artefact-b" });
  const completion = completeGalleryFocus(rejectedReopen);

  assert.equal(rejectedReopen, closing);
  assert.equal(completion.removeTarget?.artefactId, "artefact-a");
  assert.equal(completion.next, null);
});
