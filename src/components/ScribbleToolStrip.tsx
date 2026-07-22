/**
 * ScribbleToolStrip — Undo/Redo · sizes · colors · eraser for Scribble mode.
 */
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import {
  INK_COLORS,
  INK_STROKE_SIZES,
  type InkStrokeSizeKey,
  type InkTool,
} from "../constants/ink";

type ScribbleToolStripProps = {
  tool: InkTool;
  onToolChange: (tool: InkTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  sizeKey: InkStrokeSizeKey;
  onSizeChange: (size: InkStrokeSizeKey) => void;
  onUndo: () => void;
  onRedo: () => void;
};

const ScribbleToolStrip = ({
  tool,
  onToolChange,
  color,
  onColorChange,
  sizeKey,
  onSizeChange,
  onUndo,
  onRedo,
}: ScribbleToolStripProps) => {
  return (
    <View style={styles.strip}>
      <View style={styles.group}>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo stroke"
          hitSlop={8}
          style={styles.actionButton}
        >
          <Text style={styles.actionLabel}>Undo</Text>
        </Pressable>
        <Pressable
          onPress={onRedo}
          accessibilityRole="button"
          accessibilityLabel="Redo stroke"
          hitSlop={8}
          style={styles.actionButton}
        >
          <Text style={styles.actionLabel}>Redo</Text>
        </Pressable>
      </View>

      <View style={styles.group}>
        {(Object.keys(INK_STROKE_SIZES) as InkStrokeSizeKey[]).map((key) => {
          const active = sizeKey === key && tool === "pen";
          return (
            <Pressable
              key={key}
              onPress={() => {
                onToolChange("pen");
                onSizeChange(key);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Stroke size ${key}`}
              accessibilityState={{ selected: active }}
              hitSlop={6}
              style={[styles.sizeButton, active ? styles.selectedButton : styles.actionButton]}
            >
              <Text style={[styles.sizeLabel, active ? styles.activeLabel : styles.inactiveLabel]}>
                {key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.group}>
        {INK_COLORS.map((swatch) => {
          const active = color === swatch && tool === "pen";
          return (
            <Pressable
              key={swatch}
              onPress={() => {
                onToolChange("pen");
                onColorChange(swatch);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Ink color ${swatch}`}
              accessibilityState={{ selected: active }}
              hitSlop={4}
              style={[
                styles.swatch,
                { backgroundColor: swatch, borderWidth: active ? 2 : 1 },
                active ? styles.activeSwatch : styles.inactiveSwatch,
              ]}
            />
          );
        })}
      </View>

      <Pressable
        onPress={() => onToolChange(tool === "eraser" ? "pen" : "eraser")}
        accessibilityRole="button"
        accessibilityLabel="Stroke eraser"
        accessibilityState={{ selected: tool === "eraser" }}
        hitSlop={8}
        style={[styles.actionButton, tool === "eraser" && styles.selectedButton]}
      >
        <Text style={[styles.actionLabel, tool === "eraser" && styles.activeLabel]}>Eraser</Text>
      </Pressable>
    </View>
  );
};

export default ScribbleToolStrip;

const styles = StyleSheet.create((theme) => ({
  actionButton: {
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionLabel: {
    ...theme.typography.ui.labelMedium,
    color: theme.colors.content.secondary,
  },
  activeLabel: {
    color: theme.colors.content.primary,
  },
  activeSwatch: {
    borderColor: theme.colors.icon.inverse,
  },
  group: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  inactiveLabel: {
    color: theme.colors.icon.default,
  },
  inactiveSwatch: {
    borderColor: theme.colors.border.subtle,
  },
  selectedButton: {
    backgroundColor: theme.colors.surface.elevated,
    borderColor: theme.colors.content.primary,
  },
  sizeButton: {
    alignItems: "center",
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 0,
    paddingVertical: 0,
    width: 32,
  },
  sizeLabel: theme.typography.ui.captionMedium,
  strip: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  swatch: {
    borderCurve: "continuous",
    borderRadius: 11,
    height: 22,
    width: 22,
  },
}));
