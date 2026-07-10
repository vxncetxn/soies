import { useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { type SharedValue, useSharedValue } from "react-native-reanimated";

import { savePrintEntry } from "../data/savePrintEntry";
import { useEntriesVersion } from "./CreateContext";
import CreateScreenChrome from "./CreateScreenChrome";
import EditablePrint from "./EditablePrint";

type CreatePrintScreenProps = {
  progress: SharedValue<number>;
  date: string;
  imageUri: string;
  onClose: () => void;
};

/**
 * CreatePrintScreen — author a single-artefact Print entry.
 *
 * Same chrome as Create Paper (title, headers, bottom controls, enter animation).
 * Artefact is EditablePrint: no ScrollView; Type state scales + pins above the
 * keyboard with a 2-line caption. Image is locked for this iteration.
 */
const CreatePrintScreen = ({
  progress,
  date,
  imageUri,
  onClose,
}: CreatePrintScreenProps) => {
  const { bumpEntriesVersion } = useEntriesVersion();
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const expandProgress = useSharedValue(0);

  const handleSubmit = async () => {
    if (saving || !imageUri) {
      return;
    }

    const resolvedTitle = title.trim() || "Untitled";
    setSaving(true);
    await savePrintEntry({
      date,
      title: resolvedTitle,
      text: caption,
      imageUri,
    })
      .then(() => {
        bumpEntriesVersion();
        onClose();
      })
      .finally(() => {
        setSaving(false);
      });
  };

  const handleBack = () => {
    textInputRef.current?.blur();
  };

  return (
    <CreateScreenChrome
      progress={progress}
      expandProgress={expandProgress}
      typeLabel="PRINT"
      title={title}
      onChangeTitle={setTitle}
      onClose={onClose}
      onSubmit={handleSubmit}
      saving={saving}
      onBack={handleBack}
    >
      <View className="flex-1 items-center" style={{ overflow: "visible" }}>
        <EditablePrint
          imageUri={imageUri}
          value={caption}
          onChangeText={setCaption}
          expandProgress={expandProgress}
          textInputRef={textInputRef}
        />
      </View>
    </CreateScreenChrome>
  );
};

export default CreatePrintScreen;
