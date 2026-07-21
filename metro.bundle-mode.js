const path = require("node:path");

const { getBundleModeMetroConfig } = require("react-native-worklets/bundleMode");

const uniwindPackageRoot = path.dirname(require.resolve("uniwind/package.json"));

const isPathInside = (parentPath, candidatePath) => {
  const relativePath = path.relative(parentPath, candidatePath);

  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath))
  );
};

const isUniwindInternal = (originModulePath) => isPathInside(uniwindPackageRoot, originModulePath);

/**
 * Compose Worklets Bundle Mode outside Uniwind while preserving both shims.
 *
 * Both packages intercept bare `react-native` imports and exempt only imports
 * made by their own shim. Without this bridge, Worklets' shim resolves to
 * Uniwind's component facade, whose fallback getters resolve back to the
 * Worklets shim and recurse. Uniwind already knows how to resolve its own
 * internal imports to the real React Native entry, so only that forwarding
 * edge bypasses the outer Worklets resolver.
 */
const withBundleModeAndUniwind = (uniwindConfig) => {
  const uniwindResolveRequest = uniwindConfig.resolver.resolveRequest;
  const bundleModeConfig = getBundleModeMetroConfig({
    ...uniwindConfig,
    resolver: { ...uniwindConfig.resolver },
    serializer: { ...uniwindConfig.serializer },
    transformer: { ...uniwindConfig.transformer },
  });
  const bundleModeResolveRequest = bundleModeConfig.resolver.resolveRequest;

  return {
    ...bundleModeConfig,
    resolver: {
      ...bundleModeConfig.resolver,
      resolveRequest: (context, moduleName, platform) => {
        if (moduleName === "react-native" && isUniwindInternal(context.originModulePath)) {
          return uniwindResolveRequest(context, moduleName, platform);
        }

        return bundleModeResolveRequest(context, moduleName, platform);
      },
    },
  };
};

module.exports = {
  isUniwindInternal,
  uniwindPackageRoot,
  withBundleModeAndUniwind,
};
