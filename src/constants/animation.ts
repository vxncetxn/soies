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

// Snappy folder-open feel for BloomButton morph (subtle overshoot, ~300ms).
export const BLOOM_SPRING = { stiffness: 300, damping: 28, mass: 0.9 };
// Trigger label fades out over the first slice so the button cross-fades into the panel.
export const BLOOM_TRIGGER_FADE_END = 0.2;
// Panel background reaches full opacity over the first slice.
export const BLOOM_PANEL_FADE_END = 0.2;
// Panel content blooms in once the container is visible.
export const BLOOM_CONTENT_START = 0.2;
export const BLOOM_TRIGGER_RADIUS = 32;
export const BLOOM_MENU_RADIUS = 16;
export const BLOOM_MENU_GAP = 12;
export const BLOOM_CONTENT_TRANSLATE = 24;
