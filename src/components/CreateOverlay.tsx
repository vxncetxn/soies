import { StyleSheet, View } from "react-native";
import { Portal } from "react-native-teleport";

import { useHardwareBackDismiss } from "../hooks/useHardwareBackDismiss";
import { useCreateContext } from "./CreateContext";
import CreatePaperScreen from "./CreatePaperScreen";

const CreateOverlay = () => {
  const { createProgress, createMode, createDate, closeCreate } = useCreateContext();

  // Hardware-back (Android) dismisses the create overlay while a mode is open.
  // `closeCreate` is stable, so the hook only re-subscribes when `createMode`
  // flips between null and a real mode.
  useHardwareBackDismiss(createMode !== null, closeCreate);

  return (
    <Portal hostName="create">
      <View style={styles.root} pointerEvents={createMode ? "auto" : "none"}>
        {createMode === "paper" ? (
          <CreatePaperScreen progress={createProgress} date={createDate} onClose={closeCreate} />
        ) : null}
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
});

export default CreateOverlay;
