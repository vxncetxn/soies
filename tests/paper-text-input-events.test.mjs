/**
 * Regression contract for Expo native-view event registration.
 *
 * Expo `Events(...)` callbacks become direct React Native events. Reusing
 * inherited bubbling names such as `onFocus` makes Fabric register `topFocus`
 * as both direct and bubbling, causing Create Paper to fail before rendering.
 * Comparing our generated top-level names with React Native's own base config
 * catches that collision without requiring an iOS runtime in the Node suite.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const moduleSource = readFileSync(
  new URL("../modules/paper-text-input/ios/PaperTextInputModule.swift", import.meta.url),
  "utf8",
);
const baseViewConfigSource = readFileSync(
  new URL(
    "../node_modules/react-native/Libraries/NativeComponent/BaseViewConfig.ios.js",
    import.meta.url,
  ),
  "utf8",
);

/** Mirror Expo's `onThing` → `topThing` registration mapping for collision checks. */
function expoTopLevelEventName(callbackName) {
  assert.match(callbackName, /^on[A-Z]/, `Unexpected Expo view callback: ${callbackName}`);
  return `top${callbackName.slice(2)}`;
}

test("Paper native callbacks do not redeclare React Native bubbling events as direct", () => {
  const eventsBlock = moduleSource.match(/Events\(([^)]*)\)/s);
  assert.ok(eventsBlock, "PaperTextInputModule must declare its native view callbacks");

  const paperCallbacks = [...eventsBlock[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const bubblingBlock = baseViewConfigSource.slice(
    baseViewConfigSource.indexOf("const bubblingEventTypes"),
    baseViewConfigSource.indexOf("const directEventTypes"),
  );
  const nativeBubblingEvents = new Set(
    [...bubblingBlock.matchAll(/^\s*(top[A-Za-z0-9_]+):/gm)].map((match) => match[1]),
  );
  const collisions = paperCallbacks
    .map(expoTopLevelEventName)
    .filter((eventName) => nativeBubblingEvents.has(eventName));

  assert.deepEqual(
    collisions,
    [],
    `Expo view callbacks are direct events and cannot reuse bubbling event names: ${collisions.join(", ")}`,
  );
});
