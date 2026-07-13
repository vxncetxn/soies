/**
 * Share-row glyphs backed by the SVGs in assets/icons.
 *
 * react-native-nano-icons compiles those SVGs into the app icon font during
 * prebuild. Brand glyphs use a one-item color array so their source SVG's
 * hardcoded black fill is intentionally overridden with white.
 */
import { type ColorValue, View, StyleSheet } from "react-native";

import { Icon } from "../components/Icon";

const CIRCLE = 56;
const BRAND_GLYPH_COLOR: ColorValue[] = ["#FFFFFF"];

type GlyphProps = { size?: number };

export function CopyGlyph({ size = 22 }: GlyphProps) {
  return <Icon name="clipboard" size={size} color="#57534E" />;
}

export function DownloadGlyph({ size = 22 }: GlyphProps) {
  return <Icon name="folder-arrow-down" size={size} color="#57534E" />;
}

export function InstagramGlyph({ size = 25 }: GlyphProps) {
  return <Icon name="instagram" size={size} color={BRAND_GLYPH_COLOR} />;
}

export function FacebookGlyph({ size = 27 }: GlyphProps) {
  return <Icon name="facebook" size={size} color={BRAND_GLYPH_COLOR} />;
}

export function OthersGlyph({ size = 22 }: GlyphProps) {
  return <Icon name="ellipsis-horizontal" size={size} color="#57534E" />;
}

export function ActionCircle({
  children,
  variant = "neutral",
}: {
  children: React.ReactNode;
  variant?: "neutral" | "instagram" | "facebook";
}) {
  return (
    <View
      style={[
        styles.actionCircle,
        variant === "instagram" && styles.instagramCircle,
        variant === "facebook" && styles.facebookCircle,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  actionCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: "#F2F2F2",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  instagramCircle: {
    experimental_backgroundImage:
      "linear-gradient(145deg, #833AB4 0%, #C13584 38%, #FD1D1D 68%, #FCAF45 100%)",
  },
  facebookCircle: {
    backgroundColor: "#1877F2",
  },
});
