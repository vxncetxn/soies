/**
 * FeaturedArtefactWidget — the single configurable iOS WidgetKit layout.
 *
 * Every installed instance receives the same five-slot snapshot and reads the
 * build-time AppIntent selection from `environment.configuration.featuredSlot`.
 * This keeps publication to one atomic `updateSnapshot` while letting several
 * Home Screen instances point at the same stable slot.
 *
 * Widget layouts are serialized by expo-widgets rather than mounted in the app,
 * so this follows the SDK 57 widget contract and returns SwiftUI components
 * directly. The file is explicitly iOS-only: importing `@expo/ui/swift-ui` on
 * Android would attempt to resolve unavailable native view managers.
 *
 * Map:
 * - the serialized root selects one stable key and defaults to Slot 1;
 * - inline branches cover empty, unavailable, and missing-raster states;
 * - occupied layout gives the shadow-safe frame canvas all space inside a
 *   deliberate eight-point widget inset;
 * - adaptive colour, URL, and VoiceOver copy live inside the isolated function.
 *
 * Expo's Babel plugin serializes only the function marked `"widget"`; ordinary
 * module helpers and constants are not closures at runtime. Keep every value
 * used by the layout inside that function. Imported SwiftUI identifiers are
 * the supported exception because the native widget runtime supplies them.
 */
import { Image, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityLabel,
  aspectRatio,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  padding,
  resizable,
  widgetAccentedRenderingMode,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import type { FeaturedArtefactWidgetSnapshot, FeaturedWidgetSlotKey } from "./widgetSnapshot";

type FeaturedWidgetConfiguration = {
  /** Static AppIntent enum generated from app.json (`slot1` through `slot5`). */
  featuredSlot: FeaturedWidgetSlotKey;
};

/** Select and render one of the five records from the shared atomic snapshot. */
function FeaturedArtefactWidgetLayout(
  props: FeaturedArtefactWidgetSnapshot,
  environment: WidgetEnvironment<FeaturedWidgetConfiguration>,
) {
  "widget";
  const configuredKey = environment.configuration?.featuredSlot ?? "slot1";
  const slotIndex = configuredKey.slice(-1);
  // Keep a malformed/missing snapshot tappable to its configured management
  // page instead of throwing in a long-lived WidgetKit extension process.
  const slot = props?.slots?.[configuredKey] ?? {
    state: "empty",
    url: `soies:///?widgetSlot=${slotIndex}`,
    accessibilityLabel: `Featured Artefact ${slotIndex} is empty. Feature an artefact in Soies.`,
  };
  const dark = environment.colorScheme === "dark";
  // STX-002: these mirror fixedTokens.widget because Expo Widgets serializes
  // only this function and cannot capture the imported TypeScript catalog.
  const background = dark ? "#44403B" : "#EEEEEE";
  const textColor = dark ? "#F8F5F1" : "#282421";
  // WidgetKit's default margins are disabled in app.json so the frame can grow,
  // but this controlled inset keeps even the faint shadow tail off the edge.
  const contentInset = 8;
  const stateMessage =
    slot.state === "unavailable"
      ? "Artefact in Recently Deleted"
      : slot.state === "featured"
        ? "Open Soies to refresh this widget"
        : "Feature an artefact in Soies";

  return (
    <VStack
      alignment="center"
      spacing={0}
      modifiers={[
        padding({ all: contentInset }),
        frame({ maxWidth: 1000, maxHeight: 1000, alignment: "center" }),
        containerBackground(background, "widget"),
        widgetURL(slot.url),
        accessibilityElement("ignore"),
        accessibilityLabel(slot.accessibilityLabel),
      ]}
    >
      {slot.state === "featured" && slot.frameUri ? (
        <Image
          uiImage={slot.frameUri}
          modifiers={[
            resizable(),
            // 114:139 is the tight asymmetric crop around the 3:4 board shadow.
            aspectRatio({ ratio: 114 / 139, contentMode: "fit" }),
            frame({ maxWidth: 1000, maxHeight: 1000, alignment: "center" }),
            layoutPriority(1),
            widgetAccentedRenderingMode("fullColor"),
          ]}
        />
      ) : (
        <VStack
          alignment="center"
          spacing={10}
          modifiers={[
            padding({ all: 16 }),
            frame({ maxWidth: 1000, maxHeight: 1000, alignment: "center" }),
          ]}
        >
          <Text modifiers={[font({ size: 20, weight: "semibold" }), foregroundStyle(textColor)]}>
            Soies
          </Text>
          <Text
            modifiers={[
              font({ textStyle: "body", weight: "medium" }),
              foregroundStyle(textColor),
              lineLimit(2),
            ]}
          >
            {stateMessage}
          </Text>
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget<FeaturedArtefactWidgetSnapshot, FeaturedWidgetConfiguration>(
  "FeaturedArtefactWidget",
  FeaturedArtefactWidgetLayout,
);
