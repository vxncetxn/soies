import { PropsWithChildren } from "react";
import { View, Text } from "react-native";

const Paper = ({ children }: PropsWithChildren) => {
  return (
    <View className="aspect-a4 h-full w-full bg-paper p-6 shadow-sm">
      <Text className="font-paper text-base text-primary">{children}</Text>
    </View>
  );
};

export default Paper;
