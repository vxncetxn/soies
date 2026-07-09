module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      [
        "babel-preset-expo",
        {
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
  };
};
