/**
 * ShareComposition — the two layout variants used for share export/preview.
 *
 *   canvas  — solid background + artefact + “soies app” (Copy / Download / Others)
 *   sticker — transparent root hugging the card + brand below with a transparent gap
 *             (IG / FB Stories). Must be captured as PNG so alpha survives.
 *
 * Preview and export share this tree; only `width` / `height` differ. Export
 * always happens from an offscreen copy at fixed size (see ShareCaptureHost) so
 * carousel scale never affects pixel output.
 */
import { Text, View, type StyleProp, type ViewStyle } from "react-native";

import type { PaperArtefact, PrintArtefact } from "../data/entries";

import {
  SHARE_ARTEFACT_WIDTH,
  SHARE_BG,
  SHARE_BRAND,
  SHARE_EXPORT_HEIGHT,
  SHARE_EXPORT_WIDTH,
  type ShareBackgroundId,
} from "./constants";
import { ShareArtefactCard } from "./ShareArtefactCard";

export type ShareCompositionVariant = "canvas" | "sticker";

type ShareCompositionProps = {
  artefact: PaperArtefact | PrintArtefact;
  variant: ShareCompositionVariant;
  /** Ignored for sticker (transparent). */
  background: ShareBackgroundId;
  /**
   * Layout box. Preview passes a scaled size; export uses
   * SHARE_EXPORT_WIDTH × SHARE_EXPORT_HEIGHT.
   */
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** Fired after layout and every required image have committed to the native view. */
  onReady?: () => void;
  /** Rejects capture instead of leaving the action spinner pending indefinitely. */
  onError?: (error: Error) => void;
};

export function ShareComposition({
  artefact,
  variant,
  background,
  width = SHARE_EXPORT_WIDTH,
  height = SHARE_EXPORT_HEIGHT,
  style,
  onReady,
  onError,
}: ShareCompositionProps) {
  const scale = width / SHARE_EXPORT_WIDTH;
  const artefactWidth = SHARE_ARTEFACT_WIDTH * scale;
  const brandGap = 28 * scale;
  // No preview-only floor: preview and export must be the same composition at
  // different scales, including small brand type.
  const brandFontSize = 36 * scale;
  const brandColor = background === "dark" && variant === "canvas" ? "#D6D3D1" : "#78716C";
  if (variant === "sticker") {
    // Hug the card. Stories `stickerImage` uses the PNG’s full bounds — a 1080×1920
    // frame with a 640-wide card letterboxes into a skinny column in IG.
    return (
      <View
        collapsable={false}
        style={[
          {
            width: artefactWidth,
            paddingBottom: brandGap + brandFontSize * 1.4,
            backgroundColor: "transparent",
            alignItems: "center",
          },
          style,
        ]}
      >
        <ShareArtefactCard
          artefact={artefact}
          width={artefactWidth}
          onReady={onReady}
          onError={onError}
        />
        {/* Transparent gap between card and brand — intentional empty space. */}
        <View style={{ height: brandGap }} />
        <Text
          style={{
            fontFamily: "GeistMono-Regular",
            fontSize: brandFontSize,
            color: brandColor,
          }}
        >
          {SHARE_BRAND}
        </Text>
      </View>
    );
  }

  return (
    <View
      collapsable={false}
      style={[
        {
          width,
          height,
          backgroundColor: SHARE_BG[background],
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 48 * scale,
        },
        style,
      ]}
    >
      <ShareArtefactCard
        artefact={artefact}
        width={artefactWidth}
        onReady={onReady}
        onError={onError}
      />
      <View
        style={{
          position: "absolute",
          right: 40 * scale,
          bottom: 40 * scale,
        }}
      >
        <Text
          style={{
            fontFamily: "GeistMono-Regular",
            fontSize: brandFontSize,
            color: brandColor,
          }}
        >
          {SHARE_BRAND}
        </Text>
      </View>
    </View>
  );
}
