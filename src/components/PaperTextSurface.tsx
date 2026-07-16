/**
 * PaperTextSurface fallback — proportional Paper rendering outside native iOS.
 *
 * iPhone/iPad production resolves `PaperTextSurface.ios.tsx`, where attributed
 * TextKit enforces physical capacity and paragraph presets. This fallback keeps
 * read output visually representative and provides a plain Default-size editor
 * for web/Android development; it deliberately does not claim native pre-paint
 * enforcement or selection-aware paragraph formatting.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { PaperTextSurfaceHandle, PaperTextSurfaceProps } from "./PaperTextSurface.types";

import { parsePaperDocument } from "../data/paperDocument";
import {
  PAPER_FONT_FAMILY,
  PAPER_PADDING,
  PAPER_PLACEHOLDER_COLOR,
  PAPER_PRESET_METRICS,
  PAPER_TEXT_COLOR,
  clampPaperPresentationScale,
} from "./paperLayout";

const PaperTextSurface = forwardRef<PaperTextSurfaceHandle, PaperTextSurfaceProps>(
  function PaperTextSurface(
    {
      document,
      onChangeDocument,
      onFocus,
      onBlur,
      editable = false,
      presentationScale = 1,
      placeholder = "",
    },
    ref,
  ) {
    /** Supplies the shared pager focus seam when the platform uses React Native TextInput. */
    const inputRef = useRef<TextInput>(null);
    const scale = clampPaperPresentationScale(presentationScale);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      setParagraphPreset: () => Promise.resolve(),
    }));

    if (editable) {
      return (
        <TextInput
          ref={inputRef}
          value={document.text}
          onChangeText={(text) =>
            onChangeDocument?.(
              parsePaperDocument({ text, paragraphPresets: document.paragraphPresets }),
            )
          }
          onFocus={onFocus}
          onBlur={onBlur}
          editable
          multiline
          scrollEnabled={false}
          allowFontScaling={false}
          placeholder={placeholder}
          placeholderTextColor={PAPER_PLACEHOLDER_COLOR}
          textAlignVertical="top"
          style={[
            StyleSheet.absoluteFill,
            styles.text,
            {
              padding: PAPER_PADDING * scale,
              fontSize: PAPER_PRESET_METRICS.default.fontSize * scale,
              lineHeight: PAPER_PRESET_METRICS.default.lineHeight * scale,
            },
          ]}
        />
      );
    }

    const paragraphs = document.text.split("\n");
    return (
      <View style={[StyleSheet.absoluteFill, { padding: PAPER_PADDING * scale }]}>
        <Text allowFontScaling={false} style={styles.text}>
          {paragraphs.map((paragraph, index) => {
            const metrics = PAPER_PRESET_METRICS[document.paragraphPresets[index] ?? "default"];
            return (
              <Text
                key={index}
                style={{
                  fontSize: metrics.fontSize * scale,
                  lineHeight: metrics.lineHeight * scale,
                }}
              >
                {paragraph}
                {index < paragraphs.length - 1 ? "\n" : ""}
              </Text>
            );
          })}
        </Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  // Geometry is supplied at the call site because it scales with the physical
  // raster surface; these properties remain invariant authored typography.
  text: {
    margin: 0,
    padding: 0,
    fontFamily: PAPER_FONT_FAMILY,
    color: PAPER_TEXT_COLOR,
    includeFontPadding: false,
  },
});

export default PaperTextSurface;
