/** @type {import("react-native-worklets/plugin").PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  strictGlobal: true,
};

/** @type {import("react-native-boost/plugin").PluginOptions} */
const boostPluginOptions = {
  // Boost must preserve Unistyles' native-state registration when it swaps a
  // React Native wrapper for a lean host. Keep this explicit even though Boost
  // can auto-detect the dependency so upgrades cannot silently change mode.
  unistyles: true,
  // Unknown ancestors may resolve to Text-like hosts. A conservative bailout
  // is safer than changing native nesting semantics for marginal coverage.
  dangerouslyOptimizeTextWithUnknownAncestors: false,
  dangerouslyOptimizeViewWithUnknownAncestors: false,
  optimizations: {
    image: false,
    text: true,
    view: true,
  },
  silent: true,
};

module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        "babel-preset-expo",
        {
          // Configure the Worklets plugin explicitly below so Bundle Mode can
          // opt into its stricter global validation. Disable both automatic
          // paths because Expo otherwise falls back to Reanimated's alias for
          // the same plugin.
          reanimated: false,
          worklets: false,
          "react-compiler": {
            // Diagnostics are hard build failures (not soft bail-outs). Shared
            // values use `.get()` / `.set()` so the compiler does not treat
            // them as illegal mutations. Rollback: set
            // experiments.reactCompiler false in app.json and restart Metro
            // with --clear.
            panicThreshold: "all_errors",
          },
        },
      ],
    ],
    plugins: [
      ["react-native-unistyles/plugin", { root: "src" }],
      ["react-native-boost/plugin", boostPluginOptions],
      // Worklets' plugin must stay last, including after Unistyles and Boost.
      ["react-native-worklets/plugin", workletsPluginOptions],
    ],
  };
};
