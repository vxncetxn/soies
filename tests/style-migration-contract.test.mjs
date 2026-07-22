import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the application shell uses only Unistyles and semantic visual tokens", () => {
  const layoutSource = source("src/app/_layout.tsx");
  const shellSource = [
    layoutSource,
    ...[
      "src/app/index.tsx",
      "src/db/DatabaseProvider.tsx",
      "src/components/app-error-fallback.tsx",
    ].map(source),
  ].join("\n");

  assert.doesNotMatch(shellSource, /className=|withUniwind|from ["']uniwind["']/);
  assert.doesNotMatch(shellSource, /#[\dA-Fa-f]{3,8}|rgba?\(/);
  assert.doesNotMatch(layoutSource, /style=\{\{/);
  assert.match(shellSource, /react-native-unistyles/);
});

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));
const centralizedVisualTokenFiles = new Set([
  "styles/themes.ts",
  "styles/tokens.ts",
  // STX-002 is an audited mirror: Expo serializes only the widget function,
  // so imported runtime token objects cannot cross into the extension.
  "widgets/FeaturedArtefactWidget.ios.tsx",
]);

const collectSourceFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(path);
    }

    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });

test("application styling is Unistyles-only and visual literals stay in token registries", () => {
  const violations = collectSourceFiles(sourceRoot)
    .map((path) => ({
      path: relative(sourceRoot, path),
      contents: readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, ""),
    }))
    .filter(({ path }) => !centralizedVisualTokenFiles.has(path))
    .flatMap(({ path, contents }) => {
      const checks = [
        [
          "legacy styling API",
          /className=|withUniwind|from ["']uniwind(?:\/[^"']*)?["']|global\.css/g,
        ],
        [
          "non-Unistyles StyleSheet",
          /import\s*\{[^;]*\bStyleSheet\b[^;]*\}\s*from\s*["']react-native["']/g,
        ],
        ["legacy Ease styling adapter", /react-native-ease\/uniwind/g],
        ["literal color", /#[\dA-Fa-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/g],
        ["named literal color", /["'](?:black|transparent|white)["']/g],
        ["literal font family", /fontFamily\s*:\s*["'][^"']+["']/g],
        ["literal font weight", /fontWeight\s*:\s*(?:["'][^"']+["']|-?\d)/g],
        ["literal type metric", /(?:fontSize|letterSpacing|lineHeight)\s*:\s*-?\d/g],
        ["Boost-incompatible Text style", /\b(?:userSelect|verticalAlign)\s*:/g],
      ];

      return checks.flatMap(([kind, pattern]) => {
        const matches = [...contents.matchAll(pattern)];
        return matches.map((match) => `${path}: ${kind}: ${match[0]}`);
      });
    });

  assert.deepEqual(violations, []);
});

test("the build toolchain uses Boost's conservative Unistyles integration only", () => {
  const packageJson = JSON.parse(source("package.json"));
  const babel = source("babel.config.js");
  const metro = source("metro.config.js");
  const pluginList = babel.slice(babel.indexOf("plugins: ["));
  const unistylesPlugin = pluginList.indexOf("react-native-unistyles/plugin");
  const boostPlugin = pluginList.indexOf("react-native-boost/plugin");
  const workletsPlugin = pluginList.indexOf("react-native-worklets/plugin");

  assert.equal(packageJson.dependencies["react-native-boost"], "1.6.0");
  assert.equal(packageJson.dependencies.uniwind, undefined);
  assert.equal(packageJson.dependencies.tailwindcss, undefined);
  assert.ok(0 <= unistylesPlugin && unistylesPlugin < boostPlugin);
  assert.ok(boostPlugin < workletsPlugin);
  assert.match(pluginList, /react-native-boost\/plugin["'],\s*boostPluginOptions/);
  assert.match(babel, /const boostPluginOptions = \{[\s\S]*?unistyles:\s*true/);
  assert.match(babel, /dangerouslyOptimizeTextWithUnknownAncestors:\s*false/);
  assert.match(babel, /dangerouslyOptimizeViewWithUnknownAncestors:\s*false/);
  assert.match(metro, /getBundleModeMetroConfig\(config\)/);
  assert.doesNotMatch(metro, /Uniwind|uniwind|metro\.bundle-mode/);
  assert.equal(existsSync(new URL("../src/global.css", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/uniwind-types.d.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../metro.bundle-mode.js", import.meta.url)), false);

  const forceAnnotations = collectSourceFiles(sourceRoot).flatMap((path) => {
    const contents = readFileSync(path, "utf8");
    return contents.includes("@boost-force") ? [relative(sourceRoot, path)] : [];
  });

  assert.deepEqual(forceAnnotations, []);
});
