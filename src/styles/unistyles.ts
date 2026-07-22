import { StyleSheet } from "react-native-unistyles";

import { styleSystemConfig, type AppTheme } from "./themes";

type SoiesThemes = {
  dark: AppTheme;
  light: AppTheme;
};

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends SoiesThemes {}
}

StyleSheet.configure(styleSystemConfig);
