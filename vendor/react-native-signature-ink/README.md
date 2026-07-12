# react-native-signature-ink (soies fork)

> **Fork of** [`maitrungduc1410/react-native-signature-ink`](https://github.com/maitrungduc1410/react-native-signature-ink)
> **Version:** `1.1.0-soies.1`
> **Consumed by soies as:** `file:vendor/react-native-signature-ink`

True-native signature capture for React Native. **Zero Skia, zero JS canvas, zero WebView.** Buttery-smooth strokes, instant exports, and a clean imperative API — all powered by the platform's own ink engine.

Works with **bare React Native** and **Expo** (via [development builds](https://docs.expo.dev/develop/development-builds/introduction/) / `expo prebuild` — autolinked, no config plugin required; not available in Expo Go).

## soies fork changes

This fork exists so artefact Ink in soies can persist multi-color, multi-width drawings and edit them without visible flicker on iOS. Upstream remains the right starting point for a general signature pad; the deltas below are deliberate product constraints, not general polish.

### Summary

| Change | Platforms | Why |
| --- | --- | --- |
| Per-stroke `color` / `minWidth` / `maxWidth` in stroke JSON | iOS + Android + TS | Artefacts let users change pen color/size between strokes; a single global pen color cannot round-trip that drawing. |
| iOS `getStrokeData` serializes path control points (not interpolated samples) | iOS | Interpolated samples inflated point count ~20×, flattened width on restore, and slowed `replay()`. |
| `setStrokeData` honours per-point `size` and normalized relative milliseconds | iOS + Android | Width and velocity now survive cross-platform round-trips instead of depending on platform-specific timestamp units. |
| Legacy `StrokePoint[]` entries still accepted by `setStrokeData` | iOS + Android | Older / upstream-shaped payloads keep working; they inherit the current pen props. |
| Flicker-free Undo/Redo via two-canvas PencilKit handoff | iOS | Visible `PKCanvasView` replacement flashes every stroke; in-place `.drawing` assignment resurrects undone strokes on the next touch. |
| Gesture-level native eraser history | iOS + Android + TS | One eraser drag produces one undo transaction; Android segment hit-testing catches ink between sampled points and supports Redo. |
| Atomic asynchronous `snapshot()` | iOS + Android + TS | Stroke JSON and PNG share one immutable revision; image encoding and file I/O stay off the UI thread. |

App-layer Ink lifecycle (persistent canvas across Default/Scribble and PNG overlay cache) lives in soies itself — see `docs/adr/0008-artefact-ink-annotations.md`. This README covers only the native library deltas.

---

### 1. Per-stroke color and width round-trip

Upstream `getStrokeData` / `setStrokeData` treat a drawing as `StrokePoint[][]`: an ordered list of strokes, each a list of points. Color and width come from the live pen props, so changing `penColor` mid-session and then exporting loses earlier colors.

#### TypeScript (`src/types.ts`)

```ts
export interface StrokeRecord {
  points: StrokePoint[];
  /** CSS hex color, e.g. `#111111`. */
  color?: string;
  minWidth?: number;
  maxWidth?: number;
}

/** Prefer StrokeRecord. Legacy StrokePoint[] entries remain valid input. */
export type StrokeData = Array<StrokeRecord | StrokePoint[]>;
```

#### Export shape (`getStrokeData`)

Each stroke is now an object:

```json
[
  {
    "color": "#111111",
    "minWidth": 1,
    "maxWidth": 3.4,
    "points": [
      { "x": 12.5, "y": 40.0, "t": 0.0, "pressure": 1, "size": 2.1, "azimuth": 0, "altitude": 0 }
    ]
  }
]
```

- **iOS** (`SignatureInkSurface.buildStrokeDataJson`): emits `color` from `PKStroke.ink.color`, `minWidth` from the current pen min, `maxWidth` from the average control-point size, and each control point's `size` / pressure / azimuth / altitude.
- **Android** (`SignatureCanvasView.getStrokeData`): emits `color`, `minWidth`, and `maxWidth` from the `Stroke` model that already stored those fields while drawing.

#### Import shape (`setStrokeData`)

Both platforms accept:

1. **Enriched objects** — `{ color?, minWidth?, maxWidth?, points }` (preferred).
2. **Legacy arrays** — `StrokePoint[]` (inherits current `penColor` / pen widths).

On iOS, restored `PKStrokePoint` width prefers the captured per-point `size`, then stroke `maxWidth`, then the live pen max. That prevents uniform-width rebuilds after a round-trip.

#### Why control points matter on iOS

An earlier approach serialized PencilKit's *interpolated* path samples. That:

1. Inflated point count roughly 20× per stroke.
2. Dropped per-point size, so `setStrokeData` rebuilt strokes at uniform `penMaxWidth`.
3. Made `replay()` crawl, because replay duration scales with total control-point count.

The fork serializes the path's real control points instead.

---

### 2. Flicker-free Undo/Redo on iOS (PencilKit baseline handoff)

PencilKit exposes two imperfect ways to apply history:

| Approach | Visual result | Next-stroke correctness |
| --- | --- | --- |
| Replace `PKCanvasView` (`resetCanvasWithDrawing`) | Every remaining stroke briefly disappears / redraws | Correct — fresh canvas has a clean internal baseline |
| Assign `canvasView.drawing = …` in place (`setDrawingSilently`) | Stable — pixels never flash | Incorrect — PencilKit keeps a hidden stroke baseline; after Undo, the next new stroke can resurrect the removed stroke |

soies needs both: no flicker *and* no resurrection.

#### Strategy: two canvases, one promotion

Implemented in `ios/SignatureInkSurface.swift`:

1. **`undo()` / `redo()`** apply the history `PKDrawing` to the *visible* canvas with `setDrawingSilently` (no tear-down, no flash).
2. At the same time, **`prepareHistoryCanvas(with:)`** builds a second `PKCanvasView` *behind* the visible one:
   - same drawing, tool, and drawing policy
   - `isUserInteractionEnabled = false`
   - `alpha = 0.001` (imperceptible, but enough for PencilKit layers to prepare)
3. On the next drawing touch, **`hitTest`** calls **`promotePreparedHistoryCanvas()`**:
   - swaps the prepared canvas into `canvasView`
   - enables interaction / restores alpha
   - removes the stale canvas

Because both canvases already display the same `PKDrawing`, the swap does not change pixels. The next stroke then starts from a correctly baselined PencilKit view, so undone strokes stay gone.

```text
  undo/redo
      │
      ├─► setDrawingSilently(history)     // visible pixels update in place
      └─► prepareHistoryCanvas(history)   // offscreen / under-canvas replacement

  next touch ─► hitTest ─► promotePreparedHistoryCanvas()
```

#### What still rebuilds the canvas

`resetCanvasWithDrawing` remains for operations that *must* replace PencilKit state immediately and are already masked at the app layer when needed:

- `clear()`
- `setStrokeData` / external document replacement
- Fabric `prepareForReuse`

soies covers those rebuilds during eraser mode with a PNG preview over the native surface (app code, not this library).

#### Android

Android history already mutates an in-memory stroke list and repaints a bitmap. It does not share PencilKit's baseline bug, so no equivalent two-canvas handoff was added there.

---

### 3. Files touched by the fork

| Path | Role |
| --- | --- |
| `src/types.ts` | `StrokeRecord` / enriched `StrokeData` |
| `ios/SignatureInkSurface.swift` | Stroke JSON encode/decode; Undo/Redo handoff; `hitTest` promotion |
| `android/.../SignatureCanvasView.kt` | Stroke JSON encode/decode with per-stroke color/width |
| `package.json` | Version `1.1.0-soies.1`, fork description |

TypeScript consumers should treat `getStrokeData()` as returning `StrokeRecord[]` (possibly still typed as the union for backward compatibility). Prefer writing the enriched shape when persisting.

---

### 4. Compatibility notes

- **Upstream payloads**: `setStrokeData` still accepts `StrokePoint[][]`.
- **Fork payloads on upstream**: upstream that only understands point arrays will not preserve colors if fed enriched objects without a matching parser — keep this fork (or port the encode/decode) if you need multi-color persistence.
- **Native rebuild required**: iOS Undo/Redo changes are Swift; Expo Go cannot pick them up — use a dev client / `expo run:ios`.

## Demo

| iOS | Android |
| :---: | :---: |
| <video src="https://github.com/user-attachments/assets/296cb656-5614-42d5-b42f-c7c9a656bccb" controls loop muted></video> | <video src="https://github.com/user-attachments/assets/1378bb03-c111-41e8-82a4-8c0db8e5387f" controls loop muted></video> |

## Why this library

Most signature libraries on RN either render in JS (slow, jittery) or pull in Skia (large bundle, extra runtime, fights you on layout). This one is fully native on both sides:

- **Native rendering, native feel.** Strokes are drawn by the OS's own ink pipeline — pressure-aware, sub-frame smooth, identical to what users get in the system Notes app.
- **Tiny footprint.** No Skia, no Reanimated, no WebView, no third-party native deps. Pure Swift on iOS, pure Kotlin on Android.
- **Fabric-first.** Built for the New Architecture from day one: codegen specs, view recycling-safe, deterministic prop diffing.
- **Real exports.** PNG / JPEG / SVG, base64 / file URI / system clipboard / photo library, plus round-trippable raw stroke data with timestamps.
- **Drop-in DX.** One `<SignatureInk />` component, a typed imperative ref, sensible defaults. No setup beyond `pod install`.

## Features

- True native rendering on both platforms
- Built-in toolbar (undo / redo / clear / copy) plus custom icon/text buttons, with an automatic overflow menu
- PNG / JPEG / SVG export — base64, file URI, photo library, system clipboard
- Replay animation with configurable speed
- Round-trippable stroke data (`getStrokeData` / `setStrokeData`)
- **soies:** per-stroke color / width metadata in stroke JSON (multi-color drawings persist)
- **soies:** flicker-free iOS Undo/Redo via PencilKit two-canvas handoff
- Apple Pencil exclusivity (iOS) / stylus-only mode (Android)
- PencilKit system tool picker (iOS)
- Configurable baseline (solid / dashed / dotted, width, offset, color)
- Transparent canvas + dark/light theming hooks
- Fabric-correct view recycling — no state leaks across screens, modals, lists
- Density-independent units everywhere (pen widths render the same physical size on every device)

## Installation

In soies this package is already wired as a local dependency:

```json
"react-native-signature-ink": "file:vendor/react-native-signature-ink"
```

For a standalone host app (or after publishing the fork):

```sh
yarn add react-native-signature-ink
# or
npm install react-native-signature-ink
```

> Using Expo? Skip the two sections below and jump to [Expo](#expo).
> Native fork changes require a development build / `expo run:*` — they are not available in Expo Go.

### iOS (bare React Native)

```sh
cd ios && pod install
```

If you plan to use `saveToPhotoLibrary`, add the permission key to your host app's `Info.plist`:

```xml
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save your signature to your photo library.</string>
```

### Android (bare React Native)

No extra setup needed on API 29+. To support `saveToPhotoLibrary` on API ≤ 28, add the legacy storage permission to your host `AndroidManifest.xml`:

```xml
<uses-permission
  android:name="android.permission.WRITE_EXTERNAL_STORAGE"
  android:maxSdkVersion="28" />
```

The library bundles its own `FileProvider` for clipboard support, so you don't need to declare one yourself.

### Expo

Supported in [Expo development builds](https://docs.expo.dev/develop/development-builds/introduction/) and any project that runs `expo prebuild` (Continuous Native Generation). It is autolinked — **no config plugin needed**. It does **not** run in Expo Go, which can't load custom native code.

```sh
npx expo install react-native-signature-ink
npx expo prebuild   # or build a dev client / EAS build
```

This is a New Architecture (Fabric) component, so make sure the New Architecture is enabled. It's on by default on **SDK 52+**; on SDK 51 set `"newArchEnabled": true` in your `app.json`.

For `saveToPhotoLibrary`, declare the iOS permission via `app.json` (don't hand-edit `Info.plist` — prebuild regenerates it):

```json
{
  "expo": {
    "ios": {
      "infoPlist": {
        "NSPhotoLibraryAddUsageDescription": "Save your signature to your photo library."
      }
    }
  }
}
```

The Android `FileProvider` merges into your app's manifest automatically during prebuild, so clipboard support needs no extra setup. (For `saveToPhotoLibrary` on API ≤ 28 only, add `WRITE_EXTERNAL_STORAGE` via [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/) or a small config plugin.)

### Requirements

- React Native **0.75+** (New Architecture / Fabric enabled), or **Expo SDK 51+** with the New Architecture enabled (default on SDK 52+).
- iOS **13+**.
- Android **API 24+**.

## Quick start

```tsx
import React, { useRef } from 'react';
import { Button, View } from 'react-native';
import { SignatureInk, type SignatureInkHandle } from 'react-native-signature-ink';

export function MySignaturePad() {
  const ref = useRef<SignatureInkHandle>(null);

  return (
    <View style={{ flex: 1 }}>
      <SignatureInk
        ref={ref}
        style={{ flex: 1 }}
        showBaseline
        showToolbar
        penColor="#111"
        onEnd={() => console.log('user lifted the pen')}
      />

      <Button
        title="Export"
        onPress={async () => {
          const base64 = await ref.current?.toBase64({ format: 'png', trim: true });
          console.log(base64?.slice(0, 64));
        }}
      />
    </View>
  );
}
```

## Props

All props are optional. Defaults are documented inline in [`src/types.ts`](src/types.ts).

### Pen

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `penColor` | `ColorValue` | `#111` | Captured literally on iOS (dark-mode auto-inversion disabled). |
| `penMinWidth` | `number` | `1` | Width at the fastest pen velocity (pt on iOS, dp on Android). |
| `penMaxWidth` | `number` | `3` | Width at the slowest pen velocity. Same units. |
| `velocityFilterWeight` | `number` | `0.7` | Android only. 0..1 smoother weight. |

### Canvas & baseline

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `backgroundColor` | `ColorValue` | `transparent` | Pair with a light `penColor` for dark themes. |
| `showBaseline` | `boolean` | `false` | Show the signing line. |
| `baselineColor` | `ColorValue` | system gray @ 50% | |
| `baselineStyle` | `'solid' \| 'dashed' \| 'dotted'` | `'dashed'` | |
| `baselineWidth` | `number` | `0` | `0` = per-style auto value; any positive value overrides. |
| `baselineOffsetFromBottom` | `number` | `8` (iOS) / `16` (Android) | Honoured only when the toolbar is hidden; otherwise the baseline auto-anchors to the toolbar edge. |

### Input policy

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `pencilOnly` | `boolean` | `false` | iOS: Apple Pencil only. Android: `TOOL_TYPE_STYLUS` only. |

### Toolbar

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `showToolbar` | `boolean` | `false` | Render the built-in native toolbar. |
| `toolbarPosition` | `'top' \| 'bottom'` | `'bottom'` | |
| `toolbarButtons` | `ToolbarItem[]` | undo / redo / clear / copy | Array of item objects. Order is preserved. See [Toolbar items](#toolbar-items). |
| `toolbarMaxVisibleButtons` | `number` | `0` | Max inline buttons; extras collapse into an overflow ("…") menu. `0` = compute from available width. |
| `toolbarBackgroundColor` | `ColorValue` | `transparent` | |
| `toolbarTintColor` | `ColorValue` | platform accent | Tints SF Symbols (iOS) / vector drawables (Android). Overridden per-item by `tintColor`. |
| `toolbarHeight` | `number` | `44` (iOS) / `48` (Android) | |
| `toolbarIconSpacing` | `number` | `8` | Horizontal gap between buttons. |

#### Toolbar items

Each `toolbarButtons` entry is a `ToolbarItem` object:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Built-in ids (`undo` / `redo` / `clear` / `copy`) run native behavior; any other id is a custom, "headless" button that only fires `onToolbarAction`. |
| `icon` | `ToolbarIconName` | Curated cross-platform icon (`undo`, `redo`, `clear`, `copy`, `save`, `share`, `download`, `check`). Optional when `text` is set. |
| `text` | `string` | Label. Rendered after the icon when both are present. |
| `tintColor` | `ColorValue` | Per-item color; falls back to `toolbarTintColor`. |
| `accessibilityLabel` | `string` | Defaults to `text`, then `id`. |
| `disabled` | `boolean` | Dim + disable the item. |

Custom items must declare at least one of `icon` or `text` (enforced at compile time). Use the exported `ToolbarAction` / `ToolbarIcon` constants and the `DefaultToolbarItems` presets to avoid typos:

```tsx
import {
  SignatureInk,
  ToolbarAction,
  ToolbarIcon,
} from 'react-native-signature-ink';

<SignatureInk
  showToolbar
  toolbarButtons={[
    { id: ToolbarAction.Undo },                          // default icon
    { id: ToolbarAction.Clear, text: 'Clear' },          // built-in + custom text
    { id: 'save', icon: ToolbarIcon.Save, text: 'Save' },// custom headless action
  ]}
  onToolbarAction={(e) => {
    if (e.id === 'save') handleSave(); // your own save handler
  }}
/>;
```

### iOS-only

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `showToolPicker` | `boolean` | `false` | Attach PencilKit's system tool picker (`PKToolPicker`). |
| `defaultInkType` | `'pen' \| 'pencil' \| 'marker' \| 'monoline' \| 'fountainPen' \| 'watercolor' \| 'crayon'` | `'pen'` | iOS 14+ for the last four. |

### Events

| Prop | Type | Fires |
| --- | --- | --- |
| `onBegin` | `() => void` | Finger / pencil down. |
| `onEnd` | `() => void` | Finger / pencil up. |
| `onChange` | `(e: { isEmpty, strokeCount }) => void` | Any drawing change. |
| `onReplayProgress` | `(e: { progress: number }) => void` | Per-frame while `replay()` runs. |
| `onToolbarAction` | `(e: { id: string }) => void` | After a toolbar button is tapped (built-in or custom). |

## Imperative API

Available via `ref`. All async methods return a `Promise`.

| Method | Returns | Notes |
| --- | --- | --- |
| `clear()` | `void` | Reversible via `undo()`. |
| `undo()` / `redo()` | `void` | No-op when the respective stack is empty. |
| `copyToClipboard()` | `void` | PNG into the system clipboard. |
| `isEmpty()` | `Promise<boolean>` | |
| `toBase64(opts?)` | `Promise<string>` | Raw base64, no `data:` prefix. |
| `toFile(opts?)` | `Promise<string>` | `file://` URI in the app temp dir. |
| `toSvg()` | `Promise<string>` | SVG document string. |
| `getStrokeData()` | `Promise<StrokeData>` | JSON-serializable strokes (with timestamps + pressure on iOS). |
| `setStrokeData(data)` | `void` | Replace canvas contents. |
| `replay(opts?)` | `void` | Animate existing strokes. |
| `saveToPhotoLibrary(opts?)` | `Promise<{ granted, uri? }>` | iOS prompts the permission UI on first use. |

`opts` for image methods: `{ format?: 'png' | 'jpeg', quality?: number, trim?: boolean }`.

## Guides

### Exports & clipboard

```tsx
// Base64 (no `data:` prefix; raw payload).
const png = await ref.current?.toBase64({ format: 'png', trim: true });

// File URI in the app's temporary directory.
const fileUri = await ref.current?.toFile({ format: 'jpeg', quality: 0.85 });

// SVG with embedded paths.
const svg = await ref.current?.toSvg();

// PNG into the system clipboard. On Android this goes through the
// library's bundled FileProvider — no setup required on the host app.
ref.current?.copyToClipboard();
```

`trim: true` crops to the strokes' bounding box (plus a 2pt anti-alias inset). Defaults to `false` for `toBase64` / `toFile` / `toSvg`, `true` for `copyToClipboard` and `saveToPhotoLibrary`.

### Saving to the photo library

```tsx
const result = await ref.current?.saveToPhotoLibrary({ format: 'png' });
if (!result.granted) {
  // iOS user denied the "Add Photos" prompt.
}
```

- **iOS**: prompts the system "Add Photos" permission UI the first time. The host app **must** declare `NSPhotoLibraryAddUsageDescription` in `Info.plist` or iOS will crash the process.
- **Android**: writes into `Pictures/Signatures/` via MediaStore. API 29+ needs no runtime permission; API ≤ 28 requires `WRITE_EXTERNAL_STORAGE`. The promise resolves with the inserted `content://` URI.

### Stroke data round-trip

```tsx
const data = await ref.current?.getStrokeData();
// ... persist, transmit, edit ...
ref.current?.setStrokeData(data);
```

**soies fork:** the preferred format is `StrokeRecord[]` — each stroke carries optional `color`, `minWidth`, and `maxWidth` plus `points`. Legacy `StrokePoint[]` entries are still accepted by `setStrokeData` and inherit the current pen props.

Every point has `{ x, y, t }`, where `t` is relative milliseconds from the start of that stroke. Both platforms preserve per-point `size`; iOS additionally captures `pressure`, `azimuth`, and `altitude`. Unknown fields are ignored on `setStrokeData`, so payloads round-trip cleanly across platforms. See [soies fork changes](#soies-fork-changes) for the full encode/decode behavior.

### Replay animation

```tsx
ref.current?.replay({ speed: 1.5 }); // 1.5× natural pace
```

Speed is clamped to a minimum of `0.05`. Any new stroke (or another `replay()` call) cancels the running animation.

### Theming (dark / light)

The canvas defaults to transparent — the parent view's background shows through. For a dark theme:

```tsx
<SignatureInk
  backgroundColor="#0c0c0c"
  penColor="#ffffff"
  baselineColor="rgba(255,255,255,0.4)"
  toolbarTintColor="#ffffff"
/>
```

iOS pins the underlying `PKCanvasView` to a light trait collection so user-set ink colors render literally (no PencilKit dark-mode auto-inversion surprises).

### Apple Pencil-only

```tsx
<SignatureInk pencilOnly />
```

On iOS, finger touches are silently dropped (`PKCanvasViewDrawingPolicy.pencilOnly`). On Android, only events with `MotionEvent.TOOL_TYPE_STYLUS` are accepted.

### PencilKit tool picker (iOS)

```tsx
<SignatureInk showToolPicker defaultInkType="fountainPen" />
```

Attaches the system `PKToolPicker` so the user can pick ink type, color, width, and switch between pen / eraser. Silently a no-op on Android. Tool-picker state is reset on view recycling so it never leaks across screens.

## Architecture

The library is split along the codegen line: a TypeScript Fabric spec, two thin host wrappers, and one self-contained native rendering surface per platform — `PKCanvasView` (PencilKit) on iOS, a hand-tuned velocity-Bezier algorithm drawing into an offscreen `Bitmap` on Android.

Upstream documents the full walkthrough (layering, codegen pipeline, prop-diff flow, ink algorithm, exports, replay, recycling) in [`ARCHITECTURE.md`](https://github.com/maitrungduc1410/react-native-signature-ink/blob/main/ARCHITECTURE.md). This vendored tree ships only the sources soies needs to build against (`src/`, `ios/`, `android/`, `lib/`).

## Further reading

- [soies fork changes](#soies-fork-changes) — deltas in this tree versus upstream.
- soies `docs/adr/0008-artefact-ink-annotations.md` — how the host app stores Ink and avoids flicker around this library.
- Upstream [`ARCHITECTURE.md`](https://github.com/maitrungduc1410/react-native-signature-ink/blob/main/ARCHITECTURE.md) — how every piece fits together.
- Upstream [`LESSONS_LEARNED.md`](https://github.com/maitrungduc1410/react-native-signature-ink/blob/main/LESSONS_LEARNED.md) — bugs hit while building the original library.
- Upstream [`CONTRIBUTING.md`](https://github.com/maitrungduc1410/react-native-signature-ink/blob/main/CONTRIBUTING.md) — upstream workflow conventions.

## License

MIT

Upstream copyright remains with the original authors; soies fork changes are likewise MIT.
