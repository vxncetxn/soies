/**
 * FeaturedArtefactsButton — bottom-left launcher for the five widget slots.
 *
 * Its 40-point round surface mirrors CreateEntryButton across Home. It shares
 * Home's chrome fade, so expanding an entry or opening Create removes both
 * launchers from the interaction layer together.
 */
import { Pressable, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import { Icon } from "./Icon";
import { StackChromeMotion } from "./StackChromeMotion";

const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));

const FeaturedArtefactsButton = () => {
  const { openFeatured } = useFeaturedWidgets();
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  return (
    <EntryChromeMotion
      visible={entryChromeIsVisible}
      pointerEvents="box-none"
      style={styles.position}
    >
      <StackChromeMotion pointerEvents="box-none">
        <Pressable
          onPress={() => openFeatured()}
          accessibilityRole="button"
          accessibilityLabel="Open Featured Artefacts"
        >
          <View style={styles.button}>
            <ThemedIcon name="photo" size={24} />
          </View>
        </Pressable>
      </StackChromeMotion>
    </EntryChromeMotion>
  );
};

export default FeaturedArtefactsButton;

const styles = StyleSheet.create((theme) => ({
  button: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    padding: 8,
  },
  position: {
    bottom: 20,
    left: 20,
    position: "absolute",
    zIndex: 50,
  },
}));
