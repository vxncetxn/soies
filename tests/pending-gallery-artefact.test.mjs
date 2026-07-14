import assert from "node:assert/strict";
import test from "node:test";

import {
  clearPendingGalleryArtefact,
  getPendingGalleryArtefact,
  setPendingGalleryArtefact,
} from "../src/gallery/pendingGalleryPage.ts";

test("pending Gallery navigation remains until the matching artefact is ready", () => {
  setPendingGalleryArtefact("new-artefact");

  assert.equal(getPendingGalleryArtefact(), "new-artefact");
  clearPendingGalleryArtefact("stale-artefact");
  assert.equal(getPendingGalleryArtefact(), "new-artefact");
  clearPendingGalleryArtefact("new-artefact");
  assert.equal(getPendingGalleryArtefact(), null);
});
