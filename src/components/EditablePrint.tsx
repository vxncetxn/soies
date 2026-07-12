import type { ReactNode, Ref, RefObject } from "react";

/**
 * EditablePrint — polaroid Print artefact for Create Print.
 *
 * Layout mirrors `Print.tsx` (aspect-print card, image frame, caption band).
 * Sizing mirrors Home print decks: collapsed BASE_WIDTH matches ArtefactWrapper
 * for prints; focus blooms to EXPANDED_WIDTH / BASE_WIDTH with the same spring
 * as Paper / Stack, then translates so the scaled card's bottom sits just above
 * the keyboard (no ScrollView — caption is only 2 lines).
 *
 * Caption capacity: hard max 2 lines (visual fit via mirror Text onTextLayout)
 * plus ARTEFACT_TEXT_LIMITS.print (500) as a ceiling. No scrolling in the field.
 * Tap anywhere on the card focuses the caption input.
 *
 * Scale (inner) and pin-translate (outer) are separate nodes so translate isn't
 * composed through the scale matrix — a single-node transform left a large
 * on-screen gutter even when pin math said the gap was ~0.
 */
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextLayoutEventData,
  View,
  useWindowDimensions,
} from "react-native";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { withUniwind } from "uniwind";

import { SPRING_CONFIG } from "../constants/animation";
import { ARTEFACT_TEXT_LIMITS } from "../constants/artefact";
import InkOverlay from "./InkOverlay";

const StyledImage = withUniwind(Image);

const PRINT_FONT_FAMILY = "ABCStefan-Simple-Trial";
const PRINT_FONT_SIZE = 16;
const INPUT_LINE_HEIGHT = PRINT_FONT_SIZE * 1.4;
const MAX_CAPTION_LINES = 2;
const PRINT_BOTTOM_GUTTER = 16;
// Must match CreateScreenChrome header content heights (below top safe padding).
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

type EditablePrintProps = {
  imageUri: string;
  value: string;
  onChangeText: (text: string) => void;
  expandProgress: SharedValue<number>;
  textInputRef: Ref<TextInput | null>;
  /**
   * When true, blur must not collapse Type state — used while Prev/Next moves
   * focus to another artefact without dismissing the keyboard.
   */
  keepExpandedOnBlurRef?: RefObject<boolean>;
  /** Set by the horizontal pager while a drag may steal the touch into focus. */
  suppressArtefactFocusRef?: RefObject<boolean>;
  /** Locked while the entry is saving. */
  editable?: boolean;
  /** Committed Ink fallback for pager pages that do not own the live canvas. */
  inkOverlayUri?: string | null;
  scribbleActive?: boolean;
  /** Mounted pager page's native canvas; it persists across Default and Scribble. */
  scribbleCanvas?: ReactNode;
};

const EditablePrint = ({
  imageUri,
  value,
  onChangeText,
  expandProgress,
  textInputRef,
  keepExpandedOnBlurRef,
  suppressArtefactFocusRef,
  editable = true,
  inkOverlayUri = null,
  scribbleActive = false,
  scribbleCanvas = null,
}: EditablePrintProps) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const topPad = insets.top + 12;
  const localInputRef = useRef<TextInput>(null);

  // Print collapsed width matches ArtefactWrapper: same height as A4 paper deck,
  // width = (53/86) × that height.
  const paperHeight = ((windowWidth - 80) / 210) * 297;
  const BASE_WIDTH = (53 / 86) * paperHeight;
  const BASE_HEIGHT = paperHeight;
  const EXPANDED_WIDTH = windowWidth - 20;
  const expandedScale = EXPANDED_WIDTH / BASE_WIDTH;

  const [captionWidth, setCaptionWidth] = useState(0);
  const [maxChars, setMaxChars] = useState(ARTEFACT_TEXT_LIMITS.print);

  const handleCaptionLayout = (event: LayoutChangeEvent) => {
    setCaptionWidth(event.nativeEvent.layout.width);
  };

  const truncateToLines = (lines: TextLayoutEventData["lines"], src: string) => {
    let fitTextLen = 0;
    for (let i = 0; i < lines.length && i < MAX_CAPTION_LINES; i++) {
      fitTextLen += lines[i].text.length;
    }
    let count = 0;
    let cut = 0;
    for (let i = 0; i < src.length && count < fitTextLen; i++) {
      if (src[i] !== "\n") {
        count += 1;
      }
      cut = i + 1;
    }
    return src.slice(0, cut);
  };

  const handleMirrorTextLayout = (event: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (captionWidth <= 0) {
      return;
    }
    const lines = event.nativeEvent.lines;

    if (lines.length > MAX_CAPTION_LINES) {
      const truncated = truncateToLines(lines, value);
      if (truncated.length < value.length) {
        onChangeText(truncated);
        setMaxChars(truncated.length);
      }
      return;
    }

    let nextMaxChars = ARTEFACT_TEXT_LIMITS.print;
    const last = lines.length > 0 ? lines[lines.length - 1] : null;
    if (lines.length === MAX_CAPTION_LINES && last && last.text.length > 0) {
      const avgCharWidth = last.width / last.text.length;
      if (last.width + avgCharWidth > captionWidth) {
        nextMaxChars = value.length;
      }
    }
    setMaxChars(nextMaxChars);
  };

  const handleChangeText = (next: string) => {
    if (next.length < value.length) {
      setMaxChars(ARTEFACT_TEXT_LIMITS.print);
    }
    onChangeText(next);
  };

  const handleFocus = () => {
    if (scribbleActive) {
      queueMicrotask(() => {
        localInputRef.current?.blur();
      });
      return;
    }
    if (suppressArtefactFocusRef?.current) {
      queueMicrotask(() => {
        localInputRef.current?.blur();
      });
      return;
    }
    expandProgress.set(withSpring(1, SPRING_CONFIG));
  };

  const handleBlur = () => {
    if (keepExpandedOnBlurRef?.current) {
      return;
    }
    expandProgress.set(withSpring(0, SPRING_CONFIG));
  };

  const focusCaption = () => {
    if (!editable || scribbleActive) {
      return;
    }
    localInputRef.current?.focus();
  };

  // One animated style for both modes — switching between two useAnimatedStyle
  // results left Type-mode translateY stuck on the native view.
  const scribbleModeSV = useSharedValue(scribbleActive ? 1 : 0);

  useEffect(() => {
    scribbleModeSV.set(scribbleActive ? 1 : 0);
  }, [scribbleActive, scribbleModeSV]);

  const pinStyle = useAnimatedStyle(() => {
    if (scribbleModeSV.get() === 1) {
      return { transform: [{ translateY: 0 }] };
    }
    const p = expandProgress.get();
    const scale = interpolate(p, [0, 1], [1, expandedScale]);
    const keyboardOpen = Math.max(0, -keyboardHeight.get());
    const headerContent = interpolate(p, [0, 1], [CREATE_HEADER_HEIGHT, EXPANDED_HEADER_HEIGHT]);
    const contentTop = topPad + headerContent;
    const visualBottom = contentTop + BASE_HEIGHT * scale;
    const targetBottom = windowHeight - keyboardOpen - PRINT_BOTTOM_GUTTER;
    const pinTranslate = targetBottom - visualBottom;
    const translateY = interpolate(p, [0, 1], [0, pinTranslate], "clamp");
    return { transform: [{ translateY }] };
  });

  const scaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(expandProgress.get(), [0, 1], [1, expandedScale]) }],
  }));

  return (
    <Animated.View style={pinStyle}>
      <Animated.View
        className="aspect-print overflow-hidden bg-paper"
        style={[
          scaleStyle,
          {
            transformOrigin: "top",
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
          },
        ]}
      >
        {/* Whole card is the hit target — tap image or chrome focuses caption. */}
        <Pressable
          onPress={focusCaption}
          accessibilityRole="button"
          accessibilityLabel="Edit print caption"
          className="h-full w-full items-center gap-4 bg-paper pt-8"
        >
          <StyledImage
            className="aspect-print-image w-[86.79%]"
            source={imageUri}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            pointerEvents="none"
          />

          <View className="w-[86.79%]" onLayout={handleCaptionLayout}>
            <Text
              pointerEvents="none"
              onTextLayout={handleMirrorTextLayout}
              style={[styles.mirror, { width: captionWidth }]}
            >
              {value}
            </Text>

            <TextInput
              ref={(node) => {
                localInputRef.current = node;
                assignRef(textInputRef, node);
              }}
              value={value}
              onChangeText={handleChangeText}
              onFocus={handleFocus}
              onBlur={handleBlur}
              editable={editable && !scribbleActive}
              multiline
              scrollEnabled={false}
              placeholder="TAP TO START TYPING"
              placeholderTextColor="#79716B"
              maxLength={maxChars}
              textAlignVertical="top"
              className="w-full font-paper text-base text-primary"
              style={[styles.input, { maxHeight: INPUT_LINE_HEIGHT * MAX_CAPTION_LINES }]}
            />
          </View>
        </Pressable>
        {scribbleCanvas == null && inkOverlayUri ? <InkOverlay uri={inkOverlayUri} /> : null}
        {scribbleCanvas}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  mirror: {
    position: "absolute",
    opacity: 0,
    left: 0,
    top: 0,
    fontFamily: PRINT_FONT_FAMILY,
    fontSize: PRINT_FONT_SIZE,
    lineHeight: INPUT_LINE_HEIGHT,
  },
  input: {
    fontFamily: PRINT_FONT_FAMILY,
    fontSize: PRINT_FONT_SIZE,
    lineHeight: INPUT_LINE_HEIGHT,
    padding: 0,
    margin: 0,
  },
});

export default EditablePrint;
