/**
 * pickPrintImage — acquisition seam for Print create.
 *
 * v1 uses the system camera / library via expo-image-picker. A future in-app
 * camera should replace the launch step here and still return the same
 * PickPrintImageResult so CreateEntryButton / openCreate stay unchanged.
 *
 * After a successful pick, the image is downscaled (never upscaled) to cover
 * the expanded Print frame, then center-cropped to the Print aspect so we do
 * not keep pixels that `contentFit="cover"` would discard at display time.
 * Media is NOT copied into Documents/artefacts here; that happens on submit
 * via saveMediaFile (cancel must leave no orphan files).
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Dimensions, PixelRatio, Platform } from "react-native";

import { PRINT_CONTENT_WIDTH_RATIO, PRINT_IMAGE_ASPECT_RATIO } from "../components/printLayout";

export type PickPrintImageSource = "camera" | "library";

export type PickPrintImageResult =
  | { status: "success"; uri: string }
  | { status: "cancelled" }
  | { status: "permission_denied"; source: PickPrintImageSource }
  | { status: "error"; message: string };

/**
 * Pixel size of the expanded Print photo frame (card width − 20pt gutter,
 * inner image at 86.79% × aspect 244/367, × PixelRatio).
 */
export function expandedPrintImagePixelSize(windowWidth?: number): {
  width: number;
  height: number;
} {
  const widthPt = windowWidth ?? Dimensions.get("window").width;
  const expandedCardWidth = widthPt - 20;
  const imageWidthPt = expandedCardWidth * PRINT_CONTENT_WIDTH_RATIO;
  const imageHeightPt = imageWidthPt / PRINT_IMAGE_ASPECT_RATIO;
  const ratio = PixelRatio.get();
  return {
    width: Math.max(1, Math.round(imageWidthPt * ratio)),
    height: Math.max(1, Math.round(imageHeightPt * ratio)),
  };
}

/**
 * Cover-scale (never upscale) then center-crop to the expanded Print frame.
 */
async function resizeAndCropToCoverExpandedFrame(
  uri: string,
  width: number,
  height: number,
): Promise<string> {
  const target = expandedPrintImagePixelSize();
  const scale = Math.max(target.width / width, target.height / height);

  // Already smaller than the frame on the covering axis — keep original
  // (never upscale). Display still uses contentFit cover.
  if (!Number.isFinite(scale) || scale >= 1) {
    return uri;
  }

  const scaledWidth = Math.max(1, Math.round(width * scale));
  const scaledHeight = Math.max(1, Math.round(height * scale));
  const cropWidth = Math.min(target.width, scaledWidth);
  const cropHeight = Math.min(target.height, scaledHeight);
  const originX = Math.max(0, Math.round((scaledWidth - cropWidth) / 2));
  const originY = Math.max(0, Math.round((scaledHeight - cropHeight) / 2));

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      { resize: { width: scaledWidth, height: scaledHeight } },
      {
        crop: {
          originX,
          originY,
          width: cropWidth,
          height: cropHeight,
        },
      },
    ],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
  );
  return result.uri;
}

async function resolvePickerResult(
  picked: ImagePicker.ImagePickerResult,
): Promise<PickPrintImageResult> {
  if (picked.canceled || !picked.assets[0]?.uri) {
    return { status: "cancelled" };
  }

  const asset = picked.assets[0];
  const uri = await resizeAndCropToCoverExpandedFrame(
    asset.uri,
    asset.width || expandedPrintImagePixelSize().width,
    asset.height || expandedPrintImagePixelSize().height,
  );

  return { status: "success", uri };
}

let pendingRecoveryPromise: Promise<PickPrintImageResult | null> | null = null;

/**
 * Recover a result after Android destroys the picker Activity under memory
 * pressure. The module-level single flight prevents multiple mounted consumers
 * from racing to consume the same native pending result during app resume.
 */
export function recoverPendingPrintImage(): Promise<PickPrintImageResult | null> {
  if (Platform.OS !== "android") {
    return Promise.resolve(null);
  }
  if (pendingRecoveryPromise) {
    return pendingRecoveryPromise;
  }

  const recovery = (async (): Promise<PickPrintImageResult | null> => {
    try {
      const pending = await ImagePicker.getPendingResultAsync();
      if (!pending) {
        return null;
      }
      if ("code" in pending) {
        return {
          status: "error",
          message: pending.message || "Couldn’t restore the selected image.",
        };
      }
      return await resolvePickerResult(pending);
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Couldn’t restore the selected image.",
      };
    }
  })();

  pendingRecoveryPromise = recovery;
  void recovery.then(() => {
    if (pendingRecoveryPromise === recovery) {
      pendingRecoveryPromise = null;
    }
  });
  return recovery;
}

export async function pickPrintImage(source: PickPrintImageSource): Promise<PickPrintImageResult> {
  try {
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return { status: "permission_denied", source };
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.85,
      exif: false,
    };

    const picked =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    return await resolvePickerResult(picked);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn’t get that image.";
    return { status: "error", message };
  }
}
