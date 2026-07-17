/**
 * Share destinations — Copy / Photos / Stories / system share.
 *
 * Stories require `EXPO_PUBLIC_META_APP_ID` and the target app installed.
 * Install checks use URL schemes on iOS and package names on Android.
 *
 * Photos uses SDK 57’s class API (`Asset.create`). The main package’s
 * `saveToLibraryAsync` is a deprecation stub that throws at runtime.
 */
import * as Clipboard from "expo-clipboard";
import { File } from "expo-file-system";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { Image } from "expo-image";
import { Asset, requestPermissionsAsync } from "expo-media-library";
import { Linking, Platform } from "react-native";
import Share, { Social } from "react-native-share";

export type ShareDestinationErrorCode =
  | "META_APP_ID_MISSING"
  | "PHOTO_PERMISSION_DENIED"
  | "SHARE_FILE_UNAVAILABLE"
  | "SHARE_IMAGE_INVALID";

export class ShareDestinationError extends Error {
  readonly code: ShareDestinationErrorCode;

  constructor(code: ShareDestinationErrorCode) {
    super(code);
    this.name = "ShareDestinationError";
    this.code = code;
  }
}

function metaAppId(): string | undefined {
  const id = process.env.EXPO_PUBLIC_META_APP_ID?.trim();
  return id ? id : undefined;
}

export function getMetaAppId(): string | undefined {
  return metaAppId();
}

/** Read a captured tmpfile as raw base64 (no data-URI prefix) for Clipboard. */
export async function fileUriToBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

export async function copyImageToClipboard(fileUri: string): Promise<void> {
  const base64 = await fileUriToBase64(fileUri);
  await Clipboard.setImageAsync(base64);
}

function ensureFileUri(uri: string): string {
  if (uri.startsWith("file://") || uri.startsWith("content://") || uri.startsWith("ph://")) {
    return uri;
  }
  return `file://${uri}`;
}

/**
 * Ask for write-only Photos access before capture starts. A denied request must
 * not make the user wait for an export that will be immediately discarded.
 */
export async function requestPhotoLibraryWritePermission(): Promise<void> {
  const permission = await requestPermissionsAsync(true, []);
  if (!permission.granted) {
    throw new ShareDestinationError("PHOTO_PERMISSION_DENIED");
  }
}

export async function saveImageToPhotos(fileUri: string): Promise<void> {
  const localUri = ensureFileUri(fileUri);
  await Asset.create(localUri);
}

export async function shareWithSystemSheet(fileUri: string): Promise<void> {
  await Share.open({
    url: fileUri,
    type: fileUri.toLowerCase().includes(".jpg") ? "image/jpeg" : "image/png",
    failOnCancel: false,
  });
}

export async function isInstagramAvailable(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const result = await Share.isPackageInstalled("com.instagram.android");
      return result.isInstalled;
    } catch {
      return false;
    }
  }
  return Linking.canOpenURL("instagram-stories://share");
}

export async function isFacebookAvailable(): Promise<boolean> {
  if (Platform.OS === "android") {
    try {
      const result = await Share.isPackageInstalled("com.facebook.katana");
      return result.isInstalled;
    } catch {
      return false;
    }
  }
  const stories = await Linking.canOpenURL("facebook-stories://share");
  if (stories) {
    return true;
  }
  return Linking.canOpenURL("fb://");
}

function stickerPayload(fileUri: string): string {
  if (
    fileUri.startsWith("file://") ||
    fileUri.startsWith("content://") ||
    fileUri.startsWith("data:")
  ) {
    return fileUri;
  }
  return `file://${fileUri}`;
}

/**
 * Validate the native boundary before react-native-share receives the URI.
 * `File.exists` catches released/unreadable tmpfiles; `Image.loadAsync` proves
 * the payload is decodable instead of letting Objective-C/Java fail opaquely.
 */
async function validatedStickerPayload(stickerFileUri: string): Promise<string> {
  const uri = stickerPayload(stickerFileUri);
  if (uri.startsWith("data:")) {
    return uri;
  }

  let fileIsReadable = false;
  try {
    const file = new File(uri);
    fileIsReadable = file.exists && file.size > 0;
  } catch {
    // Unsupported/inaccessible URI schemes are the same user-facing failure.
  }
  if (!fileIsReadable) {
    throw new ShareDestinationError("SHARE_FILE_UNAVAILABLE");
  }

  try {
    const image = await Image.loadAsync(uri);
    if (image.width <= 0 || image.height <= 0) {
      throw new Error("Image has empty dimensions");
    }
  } catch {
    throw new ShareDestinationError("SHARE_IMAGE_INVALID");
  }

  return uri;
}

export async function shareToInstagramStories(
  stickerFileUri: string,
  backgroundColor: string,
): Promise<void> {
  const appId = metaAppId();
  if (!appId) {
    throw new ShareDestinationError("META_APP_ID_MISSING");
  }
  const stickerImage = await validatedStickerPayload(stickerFileUri);
  await Share.shareSingle({
    social: Social.InstagramStories,
    appId,
    stickerImage,
    backgroundTopColor: backgroundColor,
    backgroundBottomColor: backgroundColor,
  });
}

export async function shareToFacebookStories(
  stickerFileUri: string,
  backgroundColor: string,
): Promise<void> {
  const appId = metaAppId();
  if (!appId) {
    throw new ShareDestinationError("META_APP_ID_MISSING");
  }
  const stickerImage = await validatedStickerPayload(stickerFileUri);
  await Share.shareSingle({
    social: Social.FacebookStories,
    appId,
    stickerImage,
    backgroundTopColor: backgroundColor,
    backgroundBottomColor: backgroundColor,
  });
}
