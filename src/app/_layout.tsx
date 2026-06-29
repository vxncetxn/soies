import { BlurTargetView } from "expo-blur";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";

import "../global.css";
import { StatusBar } from "expo-status-bar";
import { useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost, PortalProvider } from "react-native-teleport";
import { withUniwind } from "uniwind";

import { BlurTargetViewProvider } from "../components/BlurTargetViewContext";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledPortalHost = withUniwind(PortalHost);

export default function Layout() {
  const blurTargetRef = useRef<View | null>(null);

  useFonts({
    "ABCStefan-Simple-Trial": require("../../assets/fonts/ABCStefan-Simple-Trial.otf"),
    "Geist-Regular": require("../../assets/fonts/Geist-Regular.otf"),
    "Geist-Medium": require("../../assets/fonts/Geist-Medium.otf"),
    "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.otf"),
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PortalProvider>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <BlurTargetViewProvider blurTargetRef={blurTargetRef}>
            <View style={{ flex: 1 }}>
              <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
                <StyledSafeAreaView className="bg-background flex-1">
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                  </Stack>
                  <StyledPortalHost name="overlay" className="absolute inset-0" />
                </StyledSafeAreaView>
              </BlurTargetView>
              <StyledPortalHost name="morph" className="absolute inset-0" />
            </View>
          </BlurTargetViewProvider>
        </SafeAreaProvider>
      </PortalProvider>
    </GestureHandlerRootView>
  );
}
