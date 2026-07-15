import assert from "node:assert/strict";
import test from "node:test";

import { CAPTURE_CANCELLED, CAPTURE_TIMEOUT, CaptureGate } from "../src/widgets/CaptureGate.ts";

test("capture gate queues overlapping work and starts only one flight", async () => {
  const gate = new CaptureGate();
  let resolveFirst;
  let secondStarted = false;
  const first = gate.run(() => new Promise((resolve) => (resolveFirst = resolve)), 100);
  const second = gate.run(() => {
    secondStarted = true;
    return Promise.resolve("second");
  }, 100);
  await Promise.resolve();
  assert.equal(secondStarted, false);
  resolveFirst("first");
  assert.equal(await first, "first");
  assert.equal(await second, "second");
  assert.equal(secondStarted, true);
});

test("capture gate times out stalled native work", async () => {
  const gate = new CaptureGate();
  await assert.rejects(() => gate.run(() => new Promise(() => {}), 5), {
    message: CAPTURE_TIMEOUT,
  });
  assert.equal(gate.busy, false);
});

test("capture gate cancellation rejects active and queued requests, then allows replacement", async () => {
  const gate = new CaptureGate();
  const pending = gate.run(() => new Promise(() => {}), 100);
  const queued = gate.run(() => Promise.resolve("queued"), 100);
  gate.cancel();

  await assert.rejects(() => pending, { message: CAPTURE_CANCELLED });
  await assert.rejects(() => queued, { message: CAPTURE_CANCELLED });
  assert.equal(await gate.run(() => Promise.resolve("replacement"), 100), "replacement");
});
