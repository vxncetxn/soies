/**
 * Share-row glyphs backed by the SVGs in assets/icons.
 *
 * react-native-nano-icons compiles those SVGs into the app icon font during
 * prebuild. Brand glyphs use a one-item color array so their source SVG's
 * hardcoded black fill is intentionally overridden with white.
 */
import { type ColorValue, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { Icon } from "../components/Icon";
import { fixedTokens } from "../styles/tokens";

const CIRCLE = 56;
const BRAND_GLYPH_COLOR: ColorValue[] = [fixedTokens.share.glyphOnBrand];
const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));

type GlyphProps = { size?: number };

export function CopyGlyph({ size = 22 }: GlyphProps) {
  return <ThemedIcon name="clipboard" size={size} />;
}

export function DownloadGlyph({ size = 22 }: GlyphProps) {
  return <ThemedIcon name="folder-arrow-down" size={size} />;
}

export function InstagramGlyph({ size = 25 }: GlyphProps) {
  return <Icon name="instagram" size={size} color={BRAND_GLYPH_COLOR} />;
}

export function FacebookGlyph({ size = 27 }: GlyphProps) {
  return <Icon name="facebook" size={size} color={BRAND_GLYPH_COLOR} />;
}

export function OthersGlyph({ size = 22 }: GlyphProps) {
  return <ThemedIcon name="ellipsis-horizontal" size={size} />;
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

const styles = StyleSheet.create((theme) => ({
  actionCircle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: theme.colors.surface.subtle,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  instagramCircle: {
    experimental_backgroundImage: fixedTokens.share.instagramGradient,
  },
  facebookCircle: {
    backgroundColor: fixedTokens.share.facebook,
  },
}));
