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
 * session receives fresh draft state after the return Entry transition completes.
 */
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { useCreateContext } from "./CreateContext";
import CreatePaperScreen from "./CreatePaperScreen";
import CreatePrintScreen from "./CreatePrintScreen";

const CreateOverlay = () => {
  const { createMode, createDate, createImageUri, closeCreate } = useCreateContext();
  const entryTransition = useEntryTransition();
  const targetRequestId =
    entryTransition.state.target === "create" ? entryTransition.state.requestId : null;
  const createIsInteractive =
    createMode !== null &&
    entryTransition.state.phase === "idle" &&
    entryTransition.state.canonicalParticipant === "create";

  useEffect(() => {
    if (
      targetRequestId === null ||
      !entryTransition.state.targetMounted ||
      entryTransition.state.targetReady
    ) {
      return;
    }
    const watchdog = setTimeout(() => {
      entryTransition.targetReady(targetRequestId);
    }, 1000);
    return () => clearTimeout(watchdog);
  }, [entryTransition, targetRequestId]);

  const showPrint = createMode === "print" && createImageUri.length > 0;
  const signalFirstArtefactReady = () => {
    if (targetRequestId !== null) {
      entryTransition.targetReady(targetRequestId);
    }
  };

  return (
    <View
      style={styles.root}
      pointerEvents={createIsInteractive ? "auto" : "none"}
      accessibilityElementsHidden={!createIsInteractive}
      importantForAccessibility={createIsInteractive ? "yes" : "no-hide-descendants"}
    >
      {createMode ? (
        <View
          style={styles.screen}
          onLayout={() => {
            if (targetRequestId !== null) {
              entryTransition.targetMounted(targetRequestId);
            }
          }}
        >
          {createMode === "paper" ? (
            <CreatePaperScreen
              date={createDate}
              onClose={closeCreate}
              onFirstArtefactReady={signalFirstArtefactReady}
            />
          ) : null}
          {showPrint ? (
            <CreatePrintScreen
              date={createDate}
              imageUri={createImageUri}
              onClose={closeCreate}
              onFirstArtefactReady={signalFirstArtefactReady}
            />
          ) : null}
        </View>
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
  screen: { flex: 1 },
});

export default CreateOverlay;
