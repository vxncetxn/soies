import { fontFamilies } from "./tokens";

const typography = {
  authoring: {
    title: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 30,
      lineHeight: 36,
    },
  },
  calendar: {
    body: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 16,
      lineHeight: 24,
    },
    button: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 14,
      lineHeight: 20,
    },
    day: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 19,
      lineHeight: 24,
    },
    footer: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 13,
      lineHeight: 18,
    },
    homeDate: {
      fontFamily: fontFamilies.mono,
      fontSize: 16,
      lineHeight: 24,
    },
    hero: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 29,
      lineHeight: 36,
    },
    metadata: {
      fontFamily: fontFamilies.mono,
      fontSize: 13,
      letterSpacing: 0.3,
      lineHeight: 18,
    },
    month: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 17,
      lineHeight: 24,
    },
    previewLabel: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 10,
      lineHeight: 14,
    },
    tab: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 18,
      lineHeight: 24,
    },
    weekday: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 17,
      lineHeight: 22,
    },
    year: {
      fontFamily: fontFamilies.mono,
      fontSize: 18,
      lineHeight: 24,
    },
  },
  feedback: {
    action: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 15,
      lineHeight: 20,
    },
    body: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 16,
      lineHeight: 22,
    },
    compact: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 13,
      lineHeight: 18,
    },
    detail: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 12,
      lineHeight: 16,
    },
    title: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 20,
      lineHeight: 28,
    },
  },
  ui: {
    body: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 16,
      lineHeight: 24,
    },
    bodyMedium: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 16,
      lineHeight: 24,
    },
    caption: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 12,
      lineHeight: 16,
    },
    captionMedium: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 12,
      lineHeight: 16,
    },
    label: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 14,
      lineHeight: 20,
    },
    labelMedium: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 14,
      lineHeight: 20,
    },
    metadataCaps: {
      fontFamily: fontFamilies.mono,
      fontSize: 12,
      letterSpacing: 1.2,
      lineHeight: 16,
    },
    metadataCapsMedium: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 12,
      letterSpacing: 1.2,
      lineHeight: 18,
    },
    screenTitle: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 20,
      lineHeight: 28,
    },
    title: {
      fontFamily: fontFamilies.sansRegular,
      fontSize: 18,
      lineHeight: 28,
    },
    titleMedium: {
      fontFamily: fontFamilies.sansMedium,
      fontSize: 18,
      lineHeight: 28,
    },
  },
} as const;

export const lightTheme = {
  colors: {
    action: {
      disabled: "#D6D3D1",
      primary: "#0C0A09",
      pressed: "#342F2B",
    },
    border: {
      control: "rgba(214, 211, 209, 0.5)",
      focus: "#79716B",
      subtle: "#DEDAD7",
    },
    canvas: {
      app: "#EEEEEE",
    },
    content: {
      disabled: "#A8A29E",
      inverse: "#FFFFFF",
      muted: "#79716B",
      onAction: "#FFFFFF",
      onDisabledAction: "#57534D",
      primary: "#0C0A09",
      secondary: "#57534D",
    },
    icon: {
      default: "#79716B",
      inverse: "#FFFFFF",
      muted: "#A8A29E",
    },
    overlay: {
      backdrop: "rgba(0, 0, 0, 0.6)",
      scrim: "rgba(0, 0, 0, 0.35)",
    },
    status: {
      danger: "#DC2626",
      dangerStrong: "#B91C1C",
      warning: "#B45309",
    },
    surface: {
      control: "rgba(255, 255, 255, 0.5)",
      controlPressed: "rgba(255, 255, 255, 0.72)",
      disabled: "#D6D3D1",
      elevated: "#FFFFFF",
      sheet: "#F5F5F4",
      subtle: "#FAFAF9",
    },
  },
  typography,
} as const;

type WidenLeaves<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends Record<string, unknown>
      ? { [K in keyof T]: WidenLeaves<T[K]> }
      : T;

export type AppTheme = WidenLeaves<typeof lightTheme>;

export const darkTheme: AppTheme = {
  colors: {
    action: {
      disabled: "#79716B",
      primary: "#0C0A09",
      pressed: "#282421",
    },
    border: {
      control: "rgba(87, 83, 77, 0.5)",
      focus: "#BEB9B6",
      subtle: "#79716B",
    },
    canvas: {
      app: "#44403B",
    },
    content: {
      disabled: "#79716B",
      inverse: "#0C0A09",
      muted: "#BEB9B6",
      onAction: "#FFFFFF",
      onDisabledAction: "#FFFFFF",
      primary: "#F8F5F1",
      secondary: "#D6D3D1",
    },
    icon: {
      default: "#BEB9B6",
      inverse: "#0C0A09",
      muted: "#A8A29E",
    },
    overlay: {
      backdrop: "rgba(0, 0, 0, 0.68)",
      scrim: "rgba(0, 0, 0, 0.48)",
    },
    status: {
      danger: "#F87171",
      dangerStrong: "#FCA5A5",
      warning: "#FBBF24",
    },
    surface: {
      control: "rgba(87, 83, 77, 0.5)",
      controlPressed: "rgba(121, 113, 107, 0.62)",
      disabled: "#79716B",
      elevated: "#57534D",
      sheet: "#4C4742",
      subtle: "#504A45",
    },
  },
  typography,
};

export const themes = {
  dark: darkTheme,
  light: lightTheme,
};

export const styleSystemConfig = {
  settings: {
    adaptiveThemes: true,
  },
  themes,
} as const;

export type ThemeName = keyof typeof themes;
