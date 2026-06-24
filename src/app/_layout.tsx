import "../global.css";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost, PortalProvider } from "react-native-teleport";
import { withUniwind } from "uniwind";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledPortalHost = withUniwind(PortalHost);

export default function Layout() {
  useFonts({
    "ABCStefan-Simple-Trial": require("../../assets/fonts/ABCStefan-Simple-Trial.otf"),
    "Geist-Regular": require("../../assets/fonts/Geist-Regular.otf"),
    "Geist-Medium": require("../../assets/fonts/Geist-Medium.otf"),
    "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.otf"),
  });

  return (
    <PortalProvider>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <StyledSafeAreaView className="flex-1 bg-background">
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="expanded"
              options={{
                presentation: "modal",
                headerShown: true,
                title: "Paper Details",
              }}
            />
          </Stack>
          <StyledPortalHost name="overlay" className="absolute inset-0" />
        </StyledSafeAreaView>
      </SafeAreaProvider>
    </PortalProvider>
  );
}
