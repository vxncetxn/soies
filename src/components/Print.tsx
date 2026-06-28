import { Image, type ImageSource } from "expo-image";
import { PropsWithChildren } from "react";
import { View, Text } from "react-native";
import { withUniwind } from "uniwind";

const StyledImage = withUniwind(Image);

type PrintProps = {
  img: ImageSource | number;
};

const Print = ({ img, children }: PropsWithChildren<PrintProps>) => {
  return (
    <View className="flex aspect-print h-full w-full items-center gap-4 bg-paper pt-8">
      <StyledImage
        className="aspect-print-image w-[86.79%]"
        source={img}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
      />
      <Text className="font-paper text-base text-primary">{children}</Text>
    </View>
  );
};

export default Print;
