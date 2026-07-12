import { PropsWithChildren } from "react";
import { View, Text } from "react-native";

import InkOverlay from "./InkOverlay";

type PaperProps = {
  inkOverlayPath?: string;
};

const Paper = ({ children, inkOverlayPath }: PropsWithChildren<PaperProps>) => {
  return (
    <View className="relative aspect-a4 h-full w-full overflow-hidden bg-paper">
      <View className="h-full w-full p-6">
        <Text className="font-paper text-base text-primary">{children}</Text>
      </View>
      {inkOverlayPath ? <InkOverlay uri={inkOverlayPath} /> : null}
    </View>
  );
};

export default Paper;
