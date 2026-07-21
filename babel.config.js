/** @type {import("react-native-worklets/plugin").PluginOptions} */
const workletsPluginOptions = {
  bundleMode: true,
  strictGlobal: true,
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
    plugins: [["react-native-worklets/plugin", workletsPluginOptions]],
  };
};
