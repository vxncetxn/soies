import { Image } from "expo-image";
import { PropsWithChildren } from "react";
import { View, Text } from "react-native";
import { withUniwind } from "uniwind";

import InkOverlay from "./InkOverlay";

const StyledImage = withUniwind(Image);

type PrintProps = {
  imagePath: string;
  inkOverlayPath?: string;
};

const Print = ({ imagePath, inkOverlayPath, children }: PropsWithChildren<PrintProps>) => {
  return (
    <View className="relative flex aspect-print h-full w-full items-center gap-4 overflow-hidden bg-paper pt-8">
      <StyledImage
        className="aspect-print-image w-[86.79%]"
        source={imagePath}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <Text className="font-paper text-base text-primary">{children}</Text>
      {inkOverlayPath ? <InkOverlay uri={inkOverlayPath} /> : null}
    </View>
  );
};

export default Print;
