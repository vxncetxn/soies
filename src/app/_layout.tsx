import "../global.css";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

const StyledSafeAreaView = withUniwind(SafeAreaView);

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <StyledSafeAreaView className="flex-1 bg-background">
        <Slot />
      </StyledSafeAreaView>
    </SafeAreaProvider>
  );
}
