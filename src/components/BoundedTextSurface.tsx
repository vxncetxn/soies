/**
 * BoundedTextSurface fallback — representative rendering outside native iOS.
 *
 * Android/web deliberately share the same adapter contract so Paper and Print
 * do not fork at the product layer. They still lack native pre-paint capacity
 * enforcement; the iOS implementation remains the production WYSIWYG engine
 * until an Android native adapter is added. Alignment remains representative on
 * the fallback so Print's centered composition does not silently become top-led.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { BoundedTextSurfaceHandle, BoundedTextSurfaceProps } from "./BoundedTextSurface.types";

import { parsePaperDocument } from "../data/paperDocument";
import { clampArtefactTextPresentationScale } from "./artefactTextStyle";

/**
 * Provides a JS-thread compatibility renderer; it intentionally cannot claim
 * the pre-paint capacity guarantees owned by the future Android native adapter.
 */
const BoundedTextSurface = forwardRef<BoundedTextSurfaceHandle, BoundedTextSurfaceProps>(
  function BoundedTextSurface(
    {
      document,
      onChangeDocument,
      onFocus,
      onBlur,
      onContentReady,
      editable = false,
      presentationScale = 1,
      placeholder = "",
      configuration,
    },
    ref,
  ) {
    /** Supplies the shared pager responder seam when native TextKit is unavailable. */
    const inputRef = useRef<TextInput>(null);
    const scale = clampArtefactTextPresentationScale(presentationScale);
    // React Native names UIKit's `natural` writing-direction behavior `auto`.
    // Resolve the vocabulary once so editable and read-only fallbacks cannot drift.
    const horizontalTextAlign = configuration.horizontalAlignment === "center" ? "center" : "auto";

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      // Capability placeholder only: fallback TextInput cannot apply atomic
      // paragraph formatting, so Android/web must not claim it succeeded.
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
          onLayout={onContentReady}
          editable
          multiline
          scrollEnabled={false}
          allowFontScaling={false}
          placeholder={placeholder}
          placeholderTextColor={configuration.placeholderTextColor}
          textAlignVertical={configuration.verticalAlignment}
          style={[
            StyleSheet.absoluteFill,
            styles.text,
            {
              padding: configuration.contentPadding * scale,
              fontFamily: configuration.fontFamily,
              color: configuration.textColor,
              textAlign: horizontalTextAlign,
              fontSize: configuration.presetMetrics.default.fontSize * scale,
              lineHeight: configuration.presetMetrics.default.lineHeight * scale,
            },
          ]}
        />
      );
    }

    const paragraphs = document.text.split("\n");
    return (
      <View
        onLayout={onContentReady}
        style={[
          StyleSheet.absoluteFill,
          {
            padding: configuration.contentPadding * scale,
            justifyContent: configuration.verticalAlignment === "center" ? "center" : "flex-start",
          },
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.text,
            {
              fontFamily: configuration.fontFamily,
              color: configuration.textColor,
              textAlign: horizontalTextAlign,
            },
          ]}
        >
          {paragraphs.map((paragraph, index) => {
            const metrics =
              configuration.presetMetrics[document.paragraphPresets[index] ?? "default"];
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
  // Adapter geometry scales at the call site; these remove React Native's
  // implicit text insets so fallback output remains as representative as possible.
  text: {
    margin: 0,
    padding: 0,
    includeFontPadding: false,
  },
});

export default BoundedTextSurface;
