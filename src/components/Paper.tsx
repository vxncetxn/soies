import { PropsWithChildren } from "react";
import { View, Text } from "react-native";

const Paper = ({ children }: PropsWithChildren) => {
  return (
    <View className="bg-paper aspect-a4 h-full w-full p-6">
      <Text className="text-primary font-paper text-base">{children}</Text>
    </View>
  );
};

export default Paper;
