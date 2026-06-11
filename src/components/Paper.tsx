import { Link } from "expo-router";
import { PropsWithChildren } from "react";
import { View, Text, Pressable } from "react-native";

const Paper = ({ children }: PropsWithChildren) => {
  return (
    <Link href="/expanded" asChild>
      <Pressable>
        <View className="aspect-a4 max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)] bg-paper p-6 shadow-sm">
          <Text className="font-paper text-base text-primary">{children}</Text>
        </View>
      </Pressable>
    </Link>
  );
};

export default Paper;
