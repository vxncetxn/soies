import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { darkTheme, lightTheme, styleSystemConfig } from "../src/styles/themes.ts";
import { fixedTokens } from "../src/styles/tokens.ts";

const leafPaths = (value, prefix = "") =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return child !== null && typeof child === "object" ? leafPaths(child, path) : [path];
  });

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const relativeLuminance = (color) => {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
};

const contrastRatio = (foreground, background) => {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

test("adaptive themes expose one stable semantic interface", () => {
  assert.deepEqual(leafPaths(darkTheme), leafPaths(lightTheme));
  assert.equal(lightTheme.colors.canvas.app, "#EEEEEE");
  assert.equal(darkTheme.colors.canvas.app, "#44403B");
  assert.equal(lightTheme.typography.ui.body.fontFamily, "Geist-Regular");
  assert.equal(lightTheme.typography.ui.body.fontSize, 16);
  assert.equal(lightTheme.typography.ui.body.lineHeight, 24);
  assert.deepEqual(lightTheme.typography.calendar.homeDate, {
    fontFamily: "GeistMono-Regular",
    fontSize: 16,
    lineHeight: 24,
  });
});

test("disabled action labels retain readable contrast in both appearances", () => {
  for (const theme of [lightTheme, darkTheme]) {
    assert.ok(
      contrastRatio(theme.colors.content.onDisabledAction, theme.colors.action.disabled) >= 4.5,
    );
  }
});

test("authored artefact presentation is independent of adaptive chrome", () => {
  assert.deepEqual(fixedTokens.artefact.text, {
    color: "#0C0A09",
    fontFamily: "ABCStefan-Simple-Trial",
    nativeFontFamily: "ABCStefanUnlicensedTrial-Simple",
    placeholderColor: "#79716B",
  });
  assert.equal(fixedTokens.artefact.paperSurface, "#FFFFFF");
  assert.deepEqual(fixedTokens.export.background, {
    dark: "#44403B",
    light: "#EEEEEE",
  });
});

test("fixed palettes centralize persisted ink, type identity, widgets, and bootstrap mirrors", () => {
  assert.deepEqual(fixedTokens.artefactType, {
    paper: "#E4DF00",
    printCalendar: "#F32DD5",
    printCreate: "#E879F9",
    unknown: "#99938E",
  });
  assert.equal(fixedTokens.ink.colors[0], "#1C1917");
  assert.deepEqual(fixedTokens.widget.background, fixedTokens.export.background);
  assert.deepEqual(fixedTokens.widget.typography, {
    body: { textStyle: "body", weight: "medium" },
    heading: { size: 20, weight: "semibold" },
    slotLabelHeight: 18,
  });
  assert.deepEqual(fixedTokens.bootstrap.android, {
    primary: "#023C69",
    splash: "#FFFFFF",
  });
});

test("the serialized widget mirror stays synchronized with its fixed tokens", () => {
  const widgetSource = readFileSync(
    new URL("../src/widgets/FeaturedArtefactWidget.ios.tsx", import.meta.url),
    "utf8",
  );

  for (const value of [
    ...Object.values(fixedTokens.widget.background),
    ...Object.values(fixedTokens.widget.text),
  ]) {
    assert.match(widgetSource, new RegExp(value.replace("#", "\\#")));
  }
  assert.match(
    widgetSource,
    new RegExp(
      `font\\(\\{ size: ${fixedTokens.widget.typography.heading.size}, weight: "${fixedTokens.widget.typography.heading.weight}" \\}\\)`,
    ),
  );
  assert.match(
    widgetSource,
    new RegExp(
      `font\\(\\{ textStyle: "${fixedTokens.widget.typography.body.textStyle}", weight: "${fixedTokens.widget.typography.body.weight}" \\}\\)`,
    ),
  );
  assert.match(widgetSource, /STX-002/);
});

test("Home keeps its pre-migration header geometry and authored handoff surface", () => {
  const homeHeaderSource = readFileSync(
    new URL("../src/components/HomeHeader.tsx", import.meta.url),
    "utf8",
  );
  const preparedHomeSource = readFileSync(
    new URL("../src/components/PreparedHomeEntry.tsx", import.meta.url),
    "utf8",
  );

  assert.match(homeHeaderSource, /\.\.\.theme\.typography\.calendar\.homeDate/);
  assert.doesNotMatch(homeHeaderSource, /triggerContent:\s*\{[\s\S]*?\bflex:\s*1/);
  assert.match(
    preparedHomeSource,
    /silhouette:\s*\{[\s\S]*?backgroundColor:\s*fixedTokens\.artefact\.paperSurface/,
  );
});

test("the UIKit launch mirror stays synchronized with fixed Artefact typography", () => {
  const nativeSource = readFileSync(
    new URL("../modules/paper-text-input/ios/PaperTextInputView.swift", import.meta.url),
    "utf8",
  );
  const presets = [
    ["defaultPreset", fixedTokens.artefact.typography.default],
    ["large", fixedTokens.artefact.typography.large],
    ["xLarge", fixedTokens.artefact.typography.xLarge],
  ];

  assert.match(nativeSource, /STX-001/);
  assert.match(nativeSource, new RegExp(escapeRegex(fixedTokens.artefact.text.nativeFontFamily)));
  for (const [name, typography] of presets) {
    assert.match(
      nativeSource,
      new RegExp(
        `\\.${name}: PresetMetrics\\(fontSize: ${escapeRegex(typography.fontSize)}, lineHeight: ${escapeRegex(typography.lineHeight)}\\)`,
      ),
    );
  }

  for (const color of [
    fixedTokens.artefact.text.color,
    fixedTokens.artefact.text.placeholderColor,
  ]) {
    const channels = color
      .slice(1)
      .match(/.{2}/g)
      .map((channel) => Number.parseInt(channel, 16));
    assert.match(
      nativeSource,
      new RegExp(
        `red: ${channels[0]} / 255,[\\s\\S]{0,80}green: ${channels[1]} / 255,[\\s\\S]{0,80}blue: ${channels[2]} / 255`,
      ),
    );
  }
});

test("the style system follows the device appearance without an initial override", () => {
  assert.deepEqual(styleSystemConfig.settings, { adaptiveThemes: true });
  assert.deepEqual(Object.keys(styleSystemConfig.themes).sort(), ["dark", "light"]);
  assert.equal("initialTheme" in styleSystemConfig.settings, false);
});

test("Unistyles is configured before Expo Router on native and static web", () => {
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const nativeEntry = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  const htmlEntry = readFileSync(new URL("../src/app/+html.tsx", import.meta.url), "utf8");

  assert.equal(packageJson.main, "index.ts");
  assert.ok(
    nativeEntry.indexOf("./src/styles/unistyles") < nativeEntry.indexOf("expo-router/entry"),
  );
  assert.match(htmlEntry, /import "\.\.\/styles\/unistyles"/);
});
