import assert from "node:assert/strict";
import test from "node:test";

import { CaptureReadinessBarrier } from "../src/widgets/CaptureReadinessBarrier.ts";
import { withReleasedCapture } from "../src/widgets/captureTemporaryFile.ts";

test("capture readiness waits for layout, Print, and Ink in any order and reports once", () => {
  let ready = 0;
  const errors = [];
  const barrier = new CaptureReadinessBarrier(
    true,
    true,
    () => (ready += 1),
    (error) => errors.push(error.message),
  );
  barrier.markInkReady();
  barrier.markLayoutReady();
  assert.equal(ready, 0);
  barrier.markPhotoReady();
  barrier.markPhotoReady();
  barrier.fail("ink");
  assert.equal(ready, 1);
  assert.deepEqual(errors, []);
});

test("capture readiness fails once and cannot later report a partial frame ready", () => {
  let ready = 0;
  const errors = [];
  const barrier = new CaptureReadinessBarrier(
    true,
    false,
    () => (ready += 1),
    (error) => errors.push(error.message),
  );
  barrier.fail("photo");
  barrier.fail("ink");
  barrier.markPhotoReady();
  barrier.markLayoutReady();
  assert.equal(ready, 0);
  assert.deepEqual(errors, ["Widget frame photo failed to display"]);
});

test("temporary captures are released after both install success and failure", async () => {
  const released = [];
  assert.equal(
    await withReleasedCapture(
      "tmp://success",
      async () => "installed",
      (uri) => released.push(uri),
    ),
    "installed",
  );
  await assert.rejects(
    () =>
      withReleasedCapture(
        "tmp://failure",
        async () => {
          throw new Error("install failed");
        },
        (uri) => released.push(uri),
      ),
    { message: "install failed" },
  );
  assert.deepEqual(released, ["tmp://success", "tmp://failure"]);
});
