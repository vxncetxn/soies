/**
 * PaperTextPresetToolbar — Paper adapter over the shared keyboard pill.
 *
 * Native TextKit owns selection and capacity. This component only maps the
 * three product preset tokens into the generic keyboard pill and returns the
 * selected token to the active Paper surface.
 */
import type { PaperParagraphPreset } from "../data/paperDocument";
import type { PaperSelectionState } from "./PaperTextSurface.types";

import KeyboardSegmentedToolbar from "./KeyboardSegmentedToolbar";

/** Product order is stable across selection changes and native capacity events. */
const PRESET_BUTTONS: { preset: PaperParagraphPreset; label: string }[] = [
  { preset: "default", label: "Default" },
  { preset: "large", label: "Large" },
  { preset: "x-large", label: "X-Large" },
];

type PaperTextPresetToolbarProps = {
  /** Latest native selection + capacity result for the active artefact. */
  selectionState: PaperSelectionState;
  /** Routes a chosen token to the active native TextKit surface. */
  onSelectPreset: (preset: PaperParagraphPreset) => void;
};

export default function PaperTextPresetToolbar({
  selectionState,
  onSelectPreset,
}: PaperTextPresetToolbarProps) {
  return (
    <KeyboardSegmentedToolbar
      options={PRESET_BUTTONS.map(({ preset, label }) => ({
        id: preset,
        label,
        accessibilityLabel: `${label} paragraph size`,
        selected: selectionState.selectedPreset === preset,
        enabled: selectionState.canApply[preset],
      }))}
      onSelect={(id) => onSelectPreset(id as PaperParagraphPreset)}
    />
  );
}
