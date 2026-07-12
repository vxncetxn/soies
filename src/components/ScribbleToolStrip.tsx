/**
 * ScribbleToolStrip — Undo/Redo · sizes · colors · eraser for Scribble mode.
 */
import { Pressable, Text, View } from "react-native";

import {
  INK_COLORS,
  INK_STROKE_SIZES,
  type InkStrokeSizeKey,
  type InkTool,
} from "../constants/ink";

const CONTROL_COLOR = "#79716B";
const ACTIVE_COLOR = "#1C1917";

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
    <View className="flex-row flex-wrap items-center justify-center gap-3 px-4">
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel="Undo stroke"
          hitSlop={8}
          className="rounded-full border border-controls-border bg-controls-background px-3 py-1.5"
        >
          <Text className="font-sans-medium text-sm text-secondary">Undo</Text>
        </Pressable>
        <Pressable
          onPress={onRedo}
          accessibilityRole="button"
          accessibilityLabel="Redo stroke"
          hitSlop={8}
          className="rounded-full border border-controls-border bg-controls-background px-3 py-1.5"
        >
          <Text className="font-sans-medium text-sm text-secondary">Redo</Text>
        </Pressable>
      </View>

      <View className="flex-row items-center gap-2">
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
              className={`h-8 w-8 items-center justify-center rounded-full border ${
                active ? "border-primary bg-paper" : "border-controls-border bg-controls-background"
              }`}
            >
              <Text
                className="font-mono text-xs"
                style={{ color: active ? ACTIVE_COLOR : CONTROL_COLOR }}
              >
                {key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="flex-row items-center gap-2">
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
              style={{
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: swatch,
                borderWidth: active ? 2 : 1,
                borderColor: active ? "#FFFFFF" : "rgba(0,0,0,0.15)",
                borderCurve: "continuous",
              }}
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
        className={`rounded-full border px-3 py-1.5 ${
          tool === "eraser"
            ? "border-primary bg-paper"
            : "border-controls-border bg-controls-background"
        }`}
      >
        <Text
          className="font-sans-medium text-sm"
          style={{ color: tool === "eraser" ? ACTIVE_COLOR : CONTROL_COLOR }}
        >
          Eraser
        </Text>
      </Pressable>
    </View>
  );
};

export default ScribbleToolStrip;
