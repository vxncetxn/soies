import "../global.css";
import { Tabs, TabList, TabTrigger, TabSlot } from "expo-router/ui";
import { StatusBar } from "expo-status-bar";
import { View, Pressable } from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import IconFrame from "../components/icons/IconFrame";
import IconHome from "../components/icons/IconHome";

const WUSafeAreaView = withUniwind(SafeAreaView);

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <WUSafeAreaView className="flex-1 bg-background">
        <Tabs>
          <TabSlot />
          <TabList className="mx-auto h-[44px] w-[136px] flex-row rounded-[32px] border border-controls-border bg-controls-background p-1">
            <TabTrigger name="home" href="/" asChild>
              <Pressable>
                <View className="flex h-[36px] w-[64px] items-center justify-center rounded-[28px]">
                  <IconHome />
                </View>
              </Pressable>
            </TabTrigger>
            <TabTrigger
              name="gallery"
              href="/gallery"
              className="flex h-[36px] w-[64px] items-center justify-center rounded-[28px]"
              asChild
            >
              <Pressable>
                <View className="flex h-[36px] w-[64px] items-center justify-center rounded-[28px]">
                  <IconFrame />
                </View>
              </Pressable>
            </TabTrigger>
          </TabList>
        </Tabs>
      </WUSafeAreaView>
    </SafeAreaProvider>
  );
}
