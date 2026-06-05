import "../global.css";
import { Tabs, TabList, TabTrigger, TabSlot } from "expo-router/ui";
import { StatusBar } from "expo-status-bar";
import { View, Pressable } from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const WUSafeAreaView = withUniwind(SafeAreaView);
const WUSvg = withUniwind(Svg);
const WUPath = withUniwind(Path);

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
                  <WUSvg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    strokeWidth={1.5}
                    className="h-6 w-6 stroke-icon"
                    viewBox="0 0 24 24"
                  >
                    <WUPath
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                    />
                  </WUSvg>
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
                  <WUSvg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    strokeWidth={1.5}
                    className="h-6 w-6 stroke-icon"
                    viewBox="0 0 24 24"
                  >
                    <WUPath
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  </WUSvg>
                </View>
              </Pressable>
            </TabTrigger>
          </TabList>
        </Tabs>
      </WUSafeAreaView>
    </SafeAreaProvider>
  );
}
