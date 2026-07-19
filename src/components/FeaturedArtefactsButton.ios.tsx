/**
 * FeaturedArtefactsButton — bottom-left launcher for the five widget slots.
 *
 * Its 40-point round surface mirrors CreateEntryButton across Home. It shares
 * Home's chrome fade, so expanding an entry or opening Create removes both
 * launchers from the interaction layer together.
 */
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import { Icon } from "./Icon";

const FeaturedArtefactsButton = () => {
  const { openFeatured } = useFeaturedWidgets();
  const chromeFadeStyle = useHomeChromeFade();
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  return (
    <EntryChromeMotion
      visible={entryChromeIsVisible}
      pointerEvents="box-none"
      className="absolute bottom-5 left-5 z-50"
    >
      <Animated.View style={chromeFadeStyle}>
        <Pressable
          onPress={() => openFeatured()}
          accessibilityRole="button"
          accessibilityLabel="Open Featured Artefacts"
        >
          <View className="items-center justify-center rounded-full border border-controls-border bg-controls-background p-2">
            <Icon name="photo" size={24} color="#79716B" />
          </View>
        </Pressable>
      </Animated.View>
    </EntryChromeMotion>
  );
};

export default FeaturedArtefactsButton;
