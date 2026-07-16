/**
 * Print — final renderer for one canonical image-and-caption artefact.
 *
 * `PrintCanvas` owns the fixed reference geometry shared by Home, Create,
 * frames, widgets and Share. Callers may supply either the read-only caption
 * adapter or Create's editable one, but image placement, caption frame, clipping
 * and Ink composition stay identical. Presentation scale changes only the
 * complete raster surface; caption capacity remains canonical.
 */
import { Image } from "expo-image";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useArtefactPresentationScale } from "./ArtefactPresentationScale";
import InkOverlay from "./InkOverlay";
import PrintCaptionSurface from "./PrintCaptionSurface";
import {
  PRINT_CANVAS_HEIGHT,
  PRINT_CANVAS_WIDTH,
  PRINT_CAPTION_HEIGHT,
  PRINT_CAPTION_WIDTH,
  PRINT_CAPTION_X,
  PRINT_CAPTION_Y,
  PRINT_IMAGE_HEIGHT,
  PRINT_IMAGE_WIDTH,
  PRINT_CONTENT_X,
  PRINT_TOP_PADDING,
} from "./printLayout";

export type PrintCanvasProps = {
  /** Durable local/remote photo source occupying the canonical crop. */
  imagePath: string;
  /** Caption renderer placed in the one canonical caption frame. */
  captionSurface: ReactNode;
  /** Explicit authoring scale; Home/read output inherit their presentation host. */
  presentationScale: number;
  /** Optional flattened Ink image aligned to the complete canonical canvas. */
  inkOverlayPath?: string;
  /** Capture barriers fire only after native image pixels enter the tree. */
  onImageDisplay?: () => void;
  /** Releases capture waiters when the photo cannot enter the native tree. */
  onImageError?: () => void;
  /** Releases capture waiters after optional Ink pixels enter the native tree. */
  onInkDisplay?: () => void;
  /** Releases capture waiters when the optional Ink overlay cannot render. */
  onInkError?: () => void;
};

/** Shared canonical composition; interactive adapters layer their responder above/below it. */
export function PrintCanvas({
  imagePath,
  captionSurface,
  presentationScale,
  inkOverlayPath,
  onImageDisplay,
  onImageError,
  onInkDisplay,
  onInkError,
}: PrintCanvasProps) {
  const scale = presentationScale;
  return (
    <View
      pointerEvents="box-none"
      className="bg-paper"
      style={[
        styles.canvas,
        { width: PRINT_CANVAS_WIDTH * scale, height: PRINT_CANVAS_HEIGHT * scale },
      ]}
    >
      <Image
        pointerEvents="none"
        source={imagePath}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={0}
        onDisplay={onImageDisplay}
        onError={onImageError}
        style={{
          position: "absolute",
          left: PRINT_CONTENT_X * scale,
          top: PRINT_TOP_PADDING * scale,
          width: PRINT_IMAGE_WIDTH * scale,
          height: PRINT_IMAGE_HEIGHT * scale,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: PRINT_CAPTION_X * scale,
          top: PRINT_CAPTION_Y * scale,
          width: PRINT_CAPTION_WIDTH * scale,
          height: PRINT_CAPTION_HEIGHT * scale,
        }}
      >
        {captionSurface}
      </View>
      {inkOverlayPath ? (
        <InkOverlay uri={inkOverlayPath} onDisplay={onInkDisplay} onError={onInkError} />
      ) : null}
    </View>
  );
}

/** Read-only Print inherits every media/capture seam from the shared canvas. */
type PrintProps = Omit<PrintCanvasProps, "captionSurface" | "presentationScale"> & {
  /** Persisted plain caption content adapted into the shared native renderer. */
  children?: ReactNode;
};

const Print = ({
  imagePath,
  inkOverlayPath,
  onImageDisplay,
  onImageError,
  onInkDisplay,
  onInkError,
  children,
}: PrintProps) => {
  const presentationScale = useArtefactPresentationScale();
  const caption = typeof children === "string" ? children : String(children ?? "");

  return (
    <PrintCanvas
      imagePath={imagePath}
      presentationScale={presentationScale}
      inkOverlayPath={inkOverlayPath}
      onImageDisplay={onImageDisplay}
      onImageError={onImageError}
      onInkDisplay={onInkDisplay}
      onInkError={onInkError}
      captionSurface={<PrintCaptionSurface value={caption} presentationScale={presentationScale} />}
    />
  );
};

const styles = StyleSheet.create({
  // The canonical card clips photo, caption and Ink at one shared boundary.
  canvas: {
    position: "relative",
    overflow: "hidden",
  },
});

export default Print;
