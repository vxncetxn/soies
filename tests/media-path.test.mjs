import assert from "node:assert/strict";
import test from "node:test";

import { resolveStoredMediaPath, toStoredMediaPath } from "../src/storage/mediaPath.ts";

const CURRENT_DOCUMENTS = "file:///var/mobile/Containers/Data/Application/CURRENT/Documents/";
const CURRENT_IMAGE = `${CURRENT_DOCUMENTS}artefacts/print-1.jpeg`;
const STALE_IMAGE =
  "file:///var/mobile/Containers/Data/Application/STALE/Documents/artefacts/print-1.jpeg";

test("rebases an app-owned Print URI after iOS changes the data-container UUID", () => {
  assert.equal(resolveStoredMediaPath(STALE_IMAGE, CURRENT_DOCUMENTS), CURRENT_IMAGE);
});

test("resolves the stable reference written by new saves", () => {
  assert.equal(resolveStoredMediaPath("artefacts/print-1.jpeg", CURRENT_DOCUMENTS), CURRENT_IMAGE);
});

test("new saves persist a container-independent media reference", () => {
  assert.equal(toStoredMediaPath(CURRENT_IMAGE), "artefacts/print-1.jpeg");
});

test("does not rewrite external or unrelated local sources", () => {
  assert.equal(
    resolveStoredMediaPath("https://images.example/print.jpeg", CURRENT_DOCUMENTS),
    "https://images.example/print.jpeg",
  );
  assert.equal(
    resolveStoredMediaPath(
      "https://images.example/Documents/artefacts/print.jpeg",
      CURRENT_DOCUMENTS,
    ),
    "https://images.example/Documents/artefacts/print.jpeg",
  );
  assert.equal(
    resolveStoredMediaPath("file:///tmp/import/print.jpeg", CURRENT_DOCUMENTS),
    "file:///tmp/import/print.jpeg",
  );
  assert.equal(
    resolveStoredMediaPath("artefacts/../private.sqlite", CURRENT_DOCUMENTS),
    "artefacts/../private.sqlite",
  );
});
