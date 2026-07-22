/**
 * InkOverlay — display-only PNG cache of committed Ink on an artefact.
 *
 * Absolute-fill over Paper/Print content. pointerEvents none so text/image
 * interaction is unchanged outside Scribble.
 */
import { Image } from "expo-image";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

const StyledImage = withUnistyles(Image);

type InkOverlayProps = {
  uri: string;
  /** Optional export barrier callbacks; normal display callers do not need them. */
  onDisplay?: () => void;
  onError?: () => void;
};

const InkOverlay = ({ uri, onDisplay, onError }: InkOverlayProps) => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <StyledImage
      source={uri}
      style={StyleSheet.absoluteFill}
      contentFit="fill"
      cachePolicy="memory-disk"
      transition={0}
      onDisplay={onDisplay}
      onError={onError}
    />
  </View>
);

export default InkOverlay;
