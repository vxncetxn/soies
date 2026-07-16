import "../global.css";
import { BottomSheetProvider } from "@swmansion/react-native-bottom-sheet";
import { BlurTargetView } from "expo-blur";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StrictMode, useRef } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { PortalHost, PortalProvider } from "react-native-teleport";
import { withUniwind } from "uniwind";

import { BlurTargetViewProvider } from "../components/BlurTargetViewContext";
import { CreateProvider } from "../components/CreateContext";
import CreateOverlay from "../components/CreateOverlay";
import { DatabaseProvider } from "../db/DatabaseProvider";
import { ShareProvider } from "../share/ShareContext";
import { FeaturedWidgetsProvider } from "../widgets/FeaturedWidgetsContext";

const StyledSafeAreaView = withUniwind(SafeAreaView);
const StyledPortalHost = withUniwind(PortalHost);

export default function Layout() {
  const blurTargetRef = useRef<View>(null);

  useFonts({
    "ABCStefan-Simple-Trial": require("../../assets/fonts/ABCStefan-Simple-Trial.otf"),
    "Geist-Regular": require("../../assets/fonts/Geist-Regular.otf"),
    "Geist-Medium": require("../../assets/fonts/Geist-Medium.otf"),
    "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.otf"),
  });

  // GestureHandlerRootView stays outermost for native gesture integration.
  // StrictMode wraps the app/provider subtree; production has no double-invoke
  // cost. Database init is single-flight; bloom/focus use previousOpenRef guards.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StrictMode>
        <KeyboardProvider>
          <BottomSheetProvider>
            <PortalProvider>
              <SafeAreaProvider>
                <StatusBar style="auto" />
                <ShareProvider>
                  <CreateProvider>
                    {/* This provider contributes React context, not a native
                        view. It must span the root overlays because BloomPanel
                        reads the blur target before branching by platform. */}
                    <BlurTargetViewProvider blurTargetRef={blurTargetRef}>
                      <BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
                        <DatabaseProvider>
                          <FeaturedWidgetsProvider>
                            <StyledSafeAreaView className="flex-1 bg-background">
                              <Stack screenOptions={{ headerShown: false }}>
                                <Stack.Screen name="(tabs)" />
                              </Stack>
                              <StyledPortalHost name="overlay" className="absolute inset-0" />
                            </StyledSafeAreaView>
                          </FeaturedWidgetsProvider>
                        </DatabaseProvider>
                      </BlurTargetView>
                      <StyledPortalHost name="morph" className="absolute inset-0" />
                      {/* Create is already a root-level overlay and must remain in
                          this Fabric hierarchy. Its BloomBar portals only the small
                          menu into `bloom`; teleporting both levels caused duplicate
                          native-parent teardown on iOS. */}
                      <CreateOverlay />
                      <StyledPortalHost name="bloom" className="absolute inset-0" />
                    </BlurTargetViewProvider>
                  </CreateProvider>
                </ShareProvider>
              </SafeAreaProvider>
            </PortalProvider>
          </BottomSheetProvider>
        </KeyboardProvider>
      </StrictMode>
    </GestureHandlerRootView>
  );
}
