/** Font registration aliases shared by every JavaScript-rendered surface. */
export const fontFamilies = {
  artefact: "ABCStefan-Simple-Trial",
  mono: "GeistMono-Regular",
  sansMedium: "Geist-Medium",
  sansRegular: "Geist-Regular",
} as const;

/**
 * Theme-independent presentation values.
 *
 * These values describe authored or published journal material, not app
 * chrome. A device appearance change must never recolor an Artefact that is
 * being edited, captured, shared, or rendered into a Widget frame.
 */
export const fixedTokens = {
  common: {
    transparent: "transparent",
  },
  artefact: {
    paperSurface: "#FFFFFF",
    text: {
      color: "#0C0A09",
      fontFamily: fontFamilies.artefact,
      nativeFontFamily: "ABCStefanUnlicensedTrial-Simple",
      placeholderColor: "#79716B",
    },
    typography: {
      default: {
        fontFamily: fontFamilies.artefact,
        fontSize: 16,
        lineHeight: 22.4,
      },
      large: {
        fontFamily: fontFamilies.artefact,
        fontSize: 20,
        lineHeight: 28,
      },
      thumbnail: {
        fontFamily: fontFamilies.artefact,
        fontSize: 6,
        lineHeight: 8,
      },
      xLarge: {
        fontFamily: fontFamilies.artefact,
        fontSize: 24,
        lineHeight: 33.6,
      },
    },
  },
  artefactType: {
    paper: "#E4DF00",
    printCalendar: "#F32DD5",
    printCreate: "#E879F9",
    unknown: "#99938E",
  },
  bootstrap: {
    android: {
      primary: "#023C69",
      splash: "#FFFFFF",
    },
  },
  export: {
    background: {
      dark: "#44403B",
      light: "#EEEEEE",
    },
  },
  effects: {
    closeButtonShadow: "0 4px 6px rgba(0,0,0,0.1)",
    keyboardToolbarShadow: "0 4px 16px rgba(0,0,0,0.16)",
    previewShadow: "0 1px 2px rgba(0,0,0,0.05)",
    shadowColor: "#000000",
  },
  frame: {
    artefactSurface: "#FFFFFF",
    boardBorder: "rgba(255,255,255,0.9)",
    boardSurface: "#F8F8F8",
    matSurface: "#F9F9F7",
    shadow: {
      artefact: "rgba(0,0,0,0.05)",
      boardAmbient: "rgba(0,0,0,0.11)",
      boardKey: "rgba(0,0,0,0.20)",
      boardRim: "rgba(255,255,255,0.72)",
      inset: "rgba(0,0,0,0.18)",
      matHighlight: "rgba(255,255,255,0.92)",
    },
    wellSurface: "rgba(255,255,255,0.18)",
  },
  ink: {
    colors: ["#1C1917", "#DC2626", "#2563EB", "#16A34A", "#EA580C", "#9333EA"],
    legacyFallback: "#111111",
    strokeSizes: {
      L: { max: 7, min: 3.5 },
      M: { max: 4, min: 2 },
      S: { max: 2.5, min: 1 },
    },
  },
  share: {
    brand: {
      baseFontSize: 36,
      darkCanvasText: "#D6D3D1",
      defaultText: "#78716C",
      fontFamily: fontFamilies.mono,
      lineHeightRatio: 1.4,
    },
    cardShadow: "rgba(0,0,0,0.18)",
    facebook: "#1877F2",
    glyphOnBrand: "#FFFFFF",
    instagramGradient:
      "linear-gradient(145deg, #833AB4 0%, #C13584 38%, #FD1D1D 68%, #FCAF45 100%)",
    swatchBorder: {
      dark: "#FAFAF9",
      light: "#1C1917",
    },
    toast: {
      background: "rgba(28, 25, 23, 0.92)",
      text: "#FAFAF9",
    },
  },
  widget: {
    background: {
      dark: "#44403B",
      light: "#EEEEEE",
    },
    text: {
      dark: "#F8F5F1",
      light: "#282421",
    },
    typography: {
      body: {
        textStyle: "body",
        weight: "medium",
      },
      heading: {
        size: 20,
        weight: "semibold",
      },
      slotLabelHeight: 18,
    },
  },
} as const;
