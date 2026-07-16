/**
 * CreateOverlay — the root-owned Paper/Print authoring surface.
 *
 * Root layout renders this as an absolute sibling above the routed app, so it
 * already has the visual escape and full-window coordinates that a Portal would
 * normally provide. Keeping it in that one Fabric hierarchy is a correctness
 * requirement: CreateScreenChrome contains a BloomBar whose small menu portals
 * to the root `bloom` host. Teleporting the complete Create tree as well made
 * that menu a native portal nested inside another native portal; on close,
 * React Native received two incompatible parent relationships and aborted in
 * `unmountChildComponentView`.
 *
 * `CreateContext` keeps this shell mounted with pointer events disabled between
 * sessions. The selected Paper/Print screen remains conditional so every new
 * session receives fresh draft state after the close spring completes.
 */
import { StyleSheet, View } from "react-native";

import { useHardwareBackDismiss } from "../hooks/useHardwareBackDismiss";
import { useCreateContext } from "./CreateContext";
import CreatePaperScreen from "./CreatePaperScreen";
import CreatePrintScreen from "./CreatePrintScreen";

const CreateOverlay = () => {
  const { createProgress, createMode, createDate, createImageUri, createSessionBusy, closeCreate } =
    useCreateContext();

  // Hardware-back dismisses the create overlay while a mode is open — but not
  // mid-save (would orphan an in-flight persist / race a new session).
  useHardwareBackDismiss(createMode !== null && !createSessionBusy, closeCreate);

  const showPrint = createMode === "print" && createImageUri.length > 0;

  return (
    <View style={styles.root} pointerEvents={createMode ? "auto" : "none"}>
      {createMode === "paper" ? (
        <CreatePaperScreen progress={createProgress} date={createDate} onClose={closeCreate} />
      ) : null}
      {showPrint ? (
        <CreatePrintScreen
          progress={createProgress}
          date={createDate}
          imageUri={createImageUri}
          onClose={closeCreate}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    // Root sibling order supplies the overlay z-plane; absolute fill retains
    // the previous edge-to-edge Create geometry without native reparenting.
    ...StyleSheet.absoluteFill,
  },
});

export default CreateOverlay;
