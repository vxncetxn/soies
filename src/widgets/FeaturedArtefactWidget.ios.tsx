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
 * - occupied layout presents metadata plus the complete full-colour frame;
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
  truncationMode,
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
  // Hex values serialize into SwiftUI; the WidgetEnvironment supplies the
  // semantic appearance because app-side React Native tokens are unavailable.
  const background = dark ? "#211F1D" : "#F5F2ED";
  const textColor = dark ? "#F8F5F1" : "#282421";
  const stateMessage =
    slot.state === "unavailable" ? "Artefact in Recently Deleted" : "Feature an artefact in Soies";

  return (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        padding({ all: 14 }),
        containerBackground(background, "widget"),
        widgetURL(slot.url),
        accessibilityElement("ignore"),
        accessibilityLabel(slot.accessibilityLabel),
      ]}
    >
      {slot.state !== "featured" ? (
        <VStack
          alignment="center"
          spacing={10}
          modifiers={[frame({ maxWidth: 1000, maxHeight: 1000, alignment: "center" })]}
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
      ) : (
        <VStack alignment="leading" spacing={4}>
          <Text
            modifiers={[
              font({ textStyle: "subheadline", weight: "semibold" }),
              foregroundStyle(textColor),
              lineLimit(1),
              truncationMode("tail"),
            ]}
          >
            From {slot.entryTitle ?? "Soies"}
          </Text>
          <Text
            modifiers={[
              font({ textStyle: "caption" }),
              foregroundStyle({ type: "hierarchical", style: "secondary" }),
              lineLimit(1),
            ]}
          >
            {slot.displayDate ?? ""}
          </Text>
          {slot.frameUri ? (
            <Image
              uiImage={slot.frameUri}
              modifiers={[
                resizable(),
                aspectRatio({ ratio: 3 / 4, contentMode: "fit" }),
                frame({ maxWidth: 1000, maxHeight: 252, alignment: "center" }),
                layoutPriority(1),
                widgetAccentedRenderingMode("fullColor"),
              ]}
            />
          ) : (
            <VStack
              alignment="center"
              spacing={10}
              modifiers={[frame({ maxWidth: 1000, maxHeight: 1000, alignment: "center" })]}
            >
              <Text
                modifiers={[font({ size: 20, weight: "semibold" }), foregroundStyle(textColor)]}
              >
                Soies
              </Text>
              <Text
                modifiers={[
                  font({ textStyle: "body", weight: "medium" }),
                  foregroundStyle(textColor),
                  lineLimit(2),
                ]}
              >
                Open Soies to refresh this widget
              </Text>
            </VStack>
          )}
        </VStack>
      )}
    </VStack>
  );
}

export default createWidget<FeaturedArtefactWidgetSnapshot, FeaturedWidgetConfiguration>(
  "FeaturedArtefactWidget",
  FeaturedArtefactWidgetLayout,
);
