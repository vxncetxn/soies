import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const config = require("../metro.config");

test("Bundle Mode still routes application React Native imports through its shim", () => {
  const context = {
    originModulePath: "/app/src/App.tsx",
    resolveRequest: (_context, moduleName) => ({
      type: "sourceFile",
      filePath: `/resolved/${moduleName}.js`,
    }),
  };

  const result = config.resolver.resolveRequest(context, "react-native", "ios");

  assert.match(
    result.filePath,
    /react-native-worklets[/\\]bundleMode[/\\]shims[/\\]reactNativeShim\.js$/,
  );
});

test("Bundle Mode's shim can reach the real React Native entry without a facade loop", () => {
  const resolved = [];
  const appContext = {
    originModulePath: "/app/src/App.tsx",
    resolveRequest: (_context, moduleName) => ({
      type: "sourceFile",
      filePath: `/resolved/${moduleName}.js`,
    }),
  };
  const shim = config.resolver.resolveRequest(appContext, "react-native", "ios");
  const shimContext = {
    originModulePath: shim.filePath,
    resolveRequest: (context, moduleName) => {
      resolved.push({ context, moduleName });
      return {
        type: "sourceFile",
        filePath: `/resolved/${moduleName}.js`,
      };
    },
  };

  const result = config.resolver.resolveRequest(shimContext, "react-native", "ios");

  assert.equal(result.filePath, "/resolved/react-native.js");
  assert.deepEqual(resolved, [{ context: shimContext, moduleName: "react-native" }]);
});
