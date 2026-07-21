import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { uniwindPackageRoot, withBundleModeAndUniwind } = require("../metro.bundle-mode");

const createMetroConfig = () => {
  const resolutions = [];
  const resolveRequest = (context, moduleName) => {
    resolutions.push({ context, moduleName });
    return {
      type: "sourceFile",
      filePath: `/resolved/${moduleName}.js`,
    };
  };

  return {
    config: withBundleModeAndUniwind({
      resolver: { resolveRequest },
      serializer: {},
      transformer: {},
    }),
    resolutions,
  };
};

test("Bundle Mode lets Uniwind's facade forward to the real React Native entry", () => {
  const { config, resolutions } = createMetroConfig();
  const context = {
    originModulePath: path.join(uniwindPackageRoot, "src/components/index.ts"),
  };

  const result = config.resolver.resolveRequest(context, "react-native", "ios");

  assert.equal(result.filePath, "/resolved/react-native.js");
  assert.deepEqual(resolutions, [{ context, moduleName: "react-native" }]);
});

test("Bundle Mode still routes application React Native imports through its shim", () => {
  const { config, resolutions } = createMetroConfig();
  const context = {
    originModulePath: "/app/src/App.tsx",
  };

  const result = config.resolver.resolveRequest(context, "react-native", "ios");

  assert.match(
    result.filePath,
    /react-native-worklets[/\\]bundleMode[/\\]shims[/\\]reactNativeShim\.js$/,
  );
  assert.deepEqual(resolutions, []);
});
