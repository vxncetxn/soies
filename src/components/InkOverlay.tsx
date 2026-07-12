/**
 * InkOverlay — display-only PNG cache of committed Ink on an artefact.
 *
 * Absolute-fill over Paper/Print content. pointerEvents none so text/image
 * interaction is unchanged outside Scribble.
 */
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { withUniwind } from "uniwind";

const StyledImage = withUniwind(Image);

type InkOverlayProps = {
  uri: string;
};

const InkOverlay = ({ uri }: InkOverlayProps) => (
  <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <StyledImage
      source={uri}
      style={StyleSheet.absoluteFill}
      contentFit="fill"
      cachePolicy="memory-disk"
      transition={0}
    />
  </View>
);

export default InkOverlay;
