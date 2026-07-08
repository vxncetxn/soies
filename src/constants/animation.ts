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

/** Create overlay: Home exit finishes at this progress slice. */
export const CREATE_HOME_EXIT_END = 0.5;
/** Create overlay: entries slide down this many px during Home exit. */
export const CREATE_SLIDE_DISTANCE = 120;
/** Create overlay open/close spring (reuses bloom feel). */
export const CREATE_SPRING = BLOOM_SPRING;
