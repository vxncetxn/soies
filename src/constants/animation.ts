import type { CubicBezier, SpringTransition, TimingTransition } from "react-native-ease";

/** Shared Entry navigation contract for both outgoing and incoming surfaces. */
export const ENTRY_TRANSITION_DURATION_MS = 350;

/** Legacy Reanimated timing defaults preserved by the Ease migrations. */
export const EASE_DEFAULT_TIMING: TimingTransition = {
  type: "timing",
  duration: 300,
  easing: [0.455, 0.03, 0.515, 0.955],
};
export const EASE_CALENDAR_CURVE: CubicBezier = [0.25, 0.46, 0.45, 0.94];
export const EASE_APPENDED_ARTEFACT_CURVE: CubicBezier = [0.215, 0.61, 0.355, 1];
export const EASE_LEGACY_SPRING: SpringTransition = {
  type: "spring",
  damping: 120,
  stiffness: 900,
  mass: 4,
};

/** Phase-synchronized Stack bloom tuned against the former clamped spring. */
export const EASE_STACK_EXPANSION_SPRING: SpringTransition = {
  type: "spring",
  damping: 120,
  stiffness: 900,
  mass: 4,
};

/** Fast companion fade used by Home chrome while the Stack bloom continues. */
export const EASE_STACK_CHROME_TIMING: TimingTransition = {
  type: "timing",
  duration: 180,
  easing: EASE_DEFAULT_TIMING.easing,
};

/** Create card/body bloom tuned against the former authoring spring. */
export const EASE_CREATE_EXPANSION_SPRING: SpringTransition = {
  type: "spring",
  damping: 120,
  stiffness: 900,
  mass: 4,
};

/** Header and control crossfade companion for Create authoring phases. */
export const EASE_CREATE_CHROME_TIMING: TimingTransition = {
  type: "timing",
  duration: 180,
  easing: EASE_DEFAULT_TIMING.easing,
};

/** Focus shell fades stay discrete while trigger measurement remains Reanimated. */
export const EASE_FOCUS_BACKDROP_TIMING: TimingTransition = {
  type: "timing",
  duration: 140,
  easing: EASE_DEFAULT_TIMING.easing,
};
export const EASE_FOCUS_CLONE_TIMING: TimingTransition = {
  type: "timing",
  duration: 180,
  easing: EASE_DEFAULT_TIMING.easing,
};

export const SPRING_CONFIG = {
  stiffness: 900,
  damping: 110,
  mass: 4,
  overshootClamping: true,
  energyThreshold: 6e-9,
  velocity: 0,
};

export const CHROME_FADE_END = 0.3;

export const TITLE_TRAVEL = 28;

export const SHADOW_SM = { offsetY: 1, opacity: 0.05, radius: 2, elevation: 1 };
export const SHADOW_XL = { offsetY: 14, opacity: 0.18, radius: 20, elevation: 16 };

// export const BLOOM_SPRING = { stiffness: 20, damping: 20, mass: 5 };
export const BLOOM_SPRING = {
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};
// Trigger label fades out over the first slice so the button cross-fades into the panel.
export const BLOOM_TRIGGER_FADE_END = 0.2;
// Panel background reaches full opacity almost immediately (over the first ~1%
// of progress) so the morphing rounded shape is visible from the very first
// frame rather than fading in gradually over the morph.
export const BLOOM_PANEL_FADE_END = 0.01;
// Panel content blooms in once the container is visible.
export const BLOOM_CONTENT_START = 0.2;
export const BLOOM_TRIGGER_RADIUS = 32;
export const BLOOM_MENU_RADIUS = 16;
export const BLOOM_MENU_GAP = 12;
// Shared by BloomButton's inline trigger and bloomed panel (both variants).
// "light" frosts; FocusOverlay uses "dark" to dim. Intensity is higher than
// FocusOverlay's 30 so panel content (menu rows, calendar grid) stays legible.
export const BLOOM_BLUR_TINT = "light" as const;
export const BLOOM_BLUR_INTENSITY = 60;
// Gentler than BLOOM_SPRING — used when menu content height changes while open.
export const BLOOM_RESIZE_SPRING = {
  stiffness: 200,
  damping: 28,
  mass: 0.9,
};
