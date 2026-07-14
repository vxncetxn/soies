import assert from "node:assert/strict";
import test from "node:test";

import {
  artefactIdAtGalleryOffset,
  navigateToPendingGalleryArtefact,
  resolveGalleryIdentityPage,
} from "../src/gallery/galleryPaging.ts";

const galleryArtefacts = (...ids) =>
  ids.map((id) => ({ galleryId: `gallery-${id}`, artefact: { id } }));

test("pager retains pending navigation through stale rows, native layout, and a failed jump", () => {
  const jumps = [];
  const navigated = [];
  let nativeRefReady = false;
  const attempt = (gallery, measuredContentWidth) =>
    navigateToPendingGalleryArtefact({
      galleryArtefacts: gallery,
      pendingArtefactId: "new",
      measuredContentWidth,
      pageWidth: 320,
      jumpToIndex: (index, animated) => {
        jumps.push({ animated, index });
        return nativeRefReady;
      },
      onNavigated: (artefactId) => navigated.push(artefactId),
    });

  assert.equal(attempt(galleryArtefacts("old"), 320), false, "stale rows must retain pending");
  assert.equal(
    attempt(galleryArtefacts("old", "new"), 320),
    false,
    "unmeasured native page must retain pending",
  );
  assert.equal(
    attempt(galleryArtefacts("old", "new"), 640),
    false,
    "a rejected native jump must retain pending",
  );
  assert.deepEqual(navigated, []);

  nativeRefReady = true;
  assert.equal(attempt(galleryArtefacts("old", "new"), 640), true);
  assert.deepEqual(jumps, [
    { animated: false, index: 1 },
    { animated: false, index: 1 },
  ]);
  assert.deepEqual(navigated, ["new"]);
});

test("drag settle and same-width reorder preserve artefact identity", () => {
  const before = galleryArtefacts("a", "b", "c");
  assert.equal(artefactIdAtGalleryOffset(before, 330, 320), "b");

  const reordered = galleryArtefacts("b", "c", "a");
  assert.deepEqual(
    resolveGalleryIdentityPage({
      galleryArtefacts: reordered,
      activeArtefactId: "b",
      fallbackIndex: 1,
    }),
    { artefactId: "b", index: 0 },
  );
});
