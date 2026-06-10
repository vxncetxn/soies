import "../global.css";
import { useFonts } from "expo-font"; // [1] Import useFonts
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function Layout() {
  // [3] Register the font with the EXACT name used in your CSS
  useFonts({
    "ABCStefan-Simple-Trial": require("../../assets/fonts/ABCStefan-Simple-Trial.otf"),
    "Geist-Regular": require("../../assets/fonts/Geist-Regular.otf"),
    "Geist-Medium": require("../../assets/fonts/Geist-Medium.otf"),
    "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.otf"),
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <StyledSafeAreaView className="flex-1 bg-background">
        <Slot />
      </StyledSafeAreaView>
    </SafeAreaProvider>
  );
}
