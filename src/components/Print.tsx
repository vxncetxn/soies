import { Image } from "expo-image";
import { PropsWithChildren } from "react";
import { View, Text } from "react-native";
import { withUniwind } from "uniwind";

import { PRINT_FONT_FAMILY, PRINT_FONT_SIZE, PRINT_LINE_HEIGHT } from "./artefactLayout";
import InkOverlay from "./InkOverlay";

const StyledImage = withUniwind(Image);

type PrintProps = {
  imagePath: string;
  inkOverlayPath?: string;
  /** Share capture waits for display, not decode, so pixels are in the native tree. */
  onImageDisplay?: () => void;
  onImageError?: () => void;
  onInkDisplay?: () => void;
  onInkError?: () => void;
};

const Print = ({
  imagePath,
  inkOverlayPath,
  onImageDisplay,
  onImageError,
  onInkDisplay,
  onInkError,
  children,
}: PropsWithChildren<PrintProps>) => {
  return (
    <View className="relative flex aspect-print h-full w-full items-center gap-4 overflow-hidden bg-paper pt-8">
      <StyledImage
        className="aspect-print-image w-[86.79%]"
        source={imagePath}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        onDisplay={onImageDisplay}
        onError={onImageError}
      />
      <View className="w-[86.79%]">
        <Text className="text-primary" style={styles.caption}>
          {children}
        </Text>
      </View>
      {inkOverlayPath ? (
        <InkOverlay uri={inkOverlayPath} onDisplay={onInkDisplay} onError={onInkError} />
      ) : null}
    </View>
  );
};

const styles = {
  caption: {
    fontFamily: PRINT_FONT_FAMILY,
    fontSize: PRINT_FONT_SIZE,
    lineHeight: PRINT_LINE_HEIGHT,
    padding: 0,
    margin: 0,
  },
} as const;

export default Print;
