import { PropsWithChildren } from "react";
import { View, Text } from "react-native";

import InkOverlay from "./InkOverlay";

type PaperProps = {
  inkOverlayPath?: string;
  onInkDisplay?: () => void;
  onInkError?: () => void;
};

const Paper = ({
  children,
  inkOverlayPath,
  onInkDisplay,
  onInkError,
}: PropsWithChildren<PaperProps>) => {
  return (
    <View className="bg-paper relative aspect-a4 h-full w-full overflow-hidden">
      <View className="h-full w-full p-6">
        <Text className="text-primary font-paper text-base">{children}</Text>
      </View>
      {inkOverlayPath ? (
        <InkOverlay uri={inkOverlayPath} onDisplay={onInkDisplay} onError={onInkError} />
      ) : null}
    </View>
  );
};

export default Paper;
