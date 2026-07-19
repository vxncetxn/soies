import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PaperContentReadinessLatch } from "../src/data/paperContentReadiness.ts";

const dayPagerSource = readFileSync(
  new URL("../src/components/DayPager.tsx", import.meta.url),
  "utf8",
);
const collapsedDeckSource = readFileSync(
  new URL("../src/components/CollapsedDeck.tsx", import.meta.url),
  "utf8",
);

test("calendar handoff gives each canonical Entry and Artefact a durable native owner", () => {
  assert.match(
    dayPagerSource,
    /entries\.map\(\(entry\) =>[\s\S]*?key=\{entry\.id\}/,
    "a different Entry at the same Day index must not inherit the previous Stack's native views",
  );
  assert.match(
    collapsedDeckSource,
    /entry\.artefacts\.map\(\(artefact, index\) =>[\s\S]*?<ArtefactWrapper[\s\S]*?key=\{artefact\.id\}/,
    "a different Artefact at the same stack index must not reuse the previous TextKit view",
  );
});

test("an already-laid-out Paper satisfies a later same-Day readiness request", () => {
  const readiness = new PaperContentReadinessLatch();

  assert.equal(readiness.contentReady("paper-document-a", null), false);
  assert.equal(readiness.request("paper-document-a", 8), true);
  assert.equal(readiness.request("paper-document-a", 8), false);
});

test("Paper readiness never carries across a changed document", () => {
  const readiness = new PaperContentReadinessLatch();

  readiness.contentReady("paper-document-a", null);

  assert.equal(readiness.request("paper-document-b", 9), false);
  assert.equal(readiness.request("paper-document-a", 10), false);
  assert.equal(readiness.contentReady("paper-document-b", 9), true);
});
