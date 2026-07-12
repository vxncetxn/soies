import type { ReactNode, Ref, RefObject } from "react";

import { useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextLayoutEventData,
  useWindowDimensions,
} from "react-native";
import Animated, {
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import { SPRING_CONFIG } from "../constants/animation";
import { ARTEFACT_TEXT_LIMITS } from "../constants/artefact";
import { deckClassName } from "./CollapsedDeck";
import InkOverlay from "./InkOverlay";

const PAPER_PADDING = 24;
const PAPER_FONT_FAMILY = "ABCStefan-Simple-Trial";
const PAPER_FONT_SIZE = 16;
// lineHeight applied to BOTH the mirror <Text> (styles.mirror) and the TextInput
// (styles.input) so their line geometry tracks each other. Its exact value is
// NOT used for the WYSIWYG cap math — iOS multiline's effective line height
// doesn't equal the set value (see the measure-not-derive note below) — so the
// cap keys off the mirror's measured textBottom/last.height instead.
const INPUT_LINE_HEIGHT = PAPER_FONT_SIZE * 1.4;

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

type EditablePaperProps = {
  value: string;
  onChangeText: (text: string) => void;
  // 0 = collapsed (default), 1 = expanded (focused). Owned by CreatePaperScreen
  // so the header cross-fade and controls fade ride the same value as the
  // sheet's scale — the whole chrome transitions together on focus.
  expandProgress: SharedValue<number>;
  // Ref to the inner TextInput so the expanded header's back button can blur it
  // (which collapses the sheet and dismisses the keyboard via onFocus/onBlur).
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
  /** When true, TextInput ignores focus (Scribble owns the expand). */
  scribbleActive?: boolean;
  /** Mounted pager page's native canvas; it persists across Default and Scribble. */
  scribbleCanvas?: ReactNode;
};

/**
 * EditablePaper — a fixed one-page A4 text canvas with WYSIWYG capacity.
 *
 * Sizing mirrors the artefact deck (`deckClassName("paper")`): width-constrained
 * to `100vw - 80px` with `aspect-a4`, so the sheet is exactly a *collapsed*
 * artefact by default. It never derives width from height (the old `h-full` +
 * `aspect-a4` did, overflowing the right edge on narrow screens).
 *
 * Expand: a tap focuses the text area AND blooms the sheet to the *expanded*
 * artefact size — the same scale factor (`EXPANDED_WIDTH / BASE_WIDTH`) and the
 * same `SPRING_CONFIG` the Stack uses (`ArtefactWrapper`), so the grow feels
 * identical to expanding an entry on Home. Driven by focus so dismissing the
 * keyboard collapses it back to the default. The layout box stays at the
 * collapsed size (so `onLayout`/the WYSIWYG cap are based on the collapsed
 * inner area — the binding constraint, since the collapsed artefact is the
 * tightest view that will display this text on Home); only the visual scales.
 *
 * WYSIWYG cap (two layers, both driven by a hidden mirror `<Text>` that lays out
 * `value` with the exact same font/size/lineHeight/wrap-width as the TextInput,
 * so `onTextLayout` reports the real line geometry):
 *
 *  1. Truncation, not revert. When the laid-out text overflows the inner area,
 *     we cut `value` to the last fitting line (preserving explicit newlines via
 *     a char-offset scan). So a paste that exceeds the page keeps its first page
 *     instead of being rejected wholesale (the old revert-to-prevTextRef wiped
 *     the entire paste). `onContentSizeChange` can't be used instead: with
 *     `scrollEnabled={false}` iOS reports the *frame* height as the content
 *     size, so it fired on every layout change and wiped the text.
 *  2. Flash-free cap via a dynamic native `maxLength`. The native TextInput
 *     rejects/truncates before the overflowing text renders, so there's no
 *     one-frame flash. `maxChars` is loose (the hard limit) until the paper
 *     fills up; once the text sits on the last fitting line AND that line is
 *     effectively full (another avg-width char would wrap), `maxChars` tightens
 *     to the current length — the next keystroke is then blocked silently. It
 *     loosens again on delete so the user can retype. The truncation layer
 *     remains the backstop for pastes that arrive while `maxChars` is still
 *     loose (the first paste) and for any overflow the prediction misses.
 *
 * Both layers key off the mirror's measured `textBottom` + `last.height` rather
 * than a derived line count. iOS multiline doesn't honor the set `lineHeight`
 * verbatim for this font (~18.4px effective vs the 22.4 assigned by
 * `INPUT_LINE_HEIGHT`), so a `maxLines` computed from the constant would lock
 * at the wrong row. The same `lineHeight` is still applied to both the mirror
 * and the TextInput so their layouts match each other; measuring the mirror's
 * real geometry (rather than deriving from the constant) is what keeps the cap
 * accurate regardless of that set-vs-effective drift.
 *
 * Known limitation (to revisit): on a large paste, layer 1 can overshoot by
 * ~1 line — the char cut is computed from the overflow layout, and the
 * truncated text can re-flow to one more line, so the page briefly shows an
 * extra overflowing line that snaps back on the next keystroke. The
 * re-truncate-on-reflow path (why the overflow branch doesn't reduce again at
 * the re-laid-out overflow) is not yet root-caused.
 */
const EditablePaper = ({
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
}: EditablePaperProps) => {
  const { width: windowWidth } = useWindowDimensions();
  const localInputRef = useRef<TextInput>(null);

  // Collapsed/expanded widths mirror ArtefactWrapper exactly, so the sheet
  // matches a collapsed artefact at rest and an expanded artefact when focused.
  const BASE_WIDTH = windowWidth - 80;
  const EXPANDED_WIDTH = windowWidth - 20;
  const expandedScale = EXPANDED_WIDTH / BASE_WIDTH;

  const [innerWidth, setInnerWidth] = useState(0);
  const [innerHeight, setInnerHeight] = useState(0);
  // Dynamic char ceiling for the native TextInput. Loose (the hard limit) until
  // the paper fills up, then tightened to the current length so the native input
  // rejects further keystrokes before they render (no overflow flash). Loosened
  // again on delete so the user can retype.
  const [maxChars, setMaxChars] = useState(ARTEFACT_TEXT_LIMITS.paper);

  const handlePaperLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setInnerWidth(Math.max(0, width - PAPER_PADDING * 2));
    setInnerHeight(Math.max(0, height - PAPER_PADDING * 2));
  };

  // Offset in `src` at which the non-newline char count reaches the total text
  // length of the lines that fit — so the slice keeps explicit newlines that
  // fall within the fitting part (join(lines.text) would drop them).
  const truncateToFit = (lines: TextLayoutEventData["lines"], src: string) => {
    let fitTextLen = 0;
    for (const line of lines) {
      if (line.y + line.height <= innerHeight + 1) {
        fitTextLen += line.text.length;
      } else {
        break;
      }
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
    if (innerHeight <= 0 || innerWidth <= 0) {
      return;
    }
    const lines = event.nativeEvent.lines;
    const last = lines.length > 0 ? lines[lines.length - 1] : null;
    const textBottom = last ? last.y + last.height : 0;

    // (1) Overflow: truncate to the last fitting line, and tighten maxChars so
    // further keystrokes are blocked silently (no flash).
    if (textBottom > innerHeight + 1) {
      const truncated = truncateToFit(lines, value);
      if (truncated.length < value.length) {
        onChangeText(truncated);
        setMaxChars(truncated.length);
      }
      return;
    }

    // (2) Fits. Predict whether the next keystroke would wrap past the page.
    // The lock fires only when the CURRENT last line is the LAST fitting line
    // (the next line would overflow: textBottom + last.height > innerHeight)
    // AND it's effectively full (another avg-width char would wrap). Both
    // terms come from the mirror's real line geometry, so the cap is always at
    // the true page bottom regardless of the font's actual line height — which
    // does not match INPUT_LINE_HEIGHT on iOS multiline.
    let nextMaxChars = ARTEFACT_TEXT_LIMITS.paper;
    const nextLineOverflows = last != null && textBottom + last.height > innerHeight + 1;
    if (nextLineOverflows && last && last.text.length > 0) {
      const avgCharWidth = last.width / last.text.length;
      if (last.width + avgCharWidth > innerWidth) {
        nextMaxChars = value.length;
      }
    }
    setMaxChars(nextMaxChars);
  };

  const handleChangeText = (next: string) => {
    // Loosen the cap on delete so the user can retype after hitting the limit.
    // (The native maxLength only caps the max; deletes are always allowed, so
    // we detect a shrink here and reset maxChars — the mirror re-tightens it
    // once the remaining text is laid out.)
    if (next.length < value.length) {
      setMaxChars(ARTEFACT_TEXT_LIMITS.paper);
    }
    onChangeText(next);
  };

  // Focus blooms the sheet to the expanded artefact size; blur collapses it
  // back — unless the parent is transferring focus to another artefact (Prev/Next).
  const handleFocus = () => {
    if (scribbleActive) {
      queueMicrotask(() => {
        localInputRef.current?.blur();
      });
      return;
    }
    // Horizontal pager drag ended on the input — reject accidental Type entry.
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

  // The sheet scales from collapsed (1) to expanded (expandedScale). Layout
  // stays at the collapsed size — only the visual grows — so the WYSIWYG cap
  // (based on the collapsed inner area) stays constant and matches the
  // collapsed artefact that will display this text on Home.
  const paperStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(expandProgress.get(), [0, 1], [1, expandedScale]) }],
  }));

  return (
    <Animated.View
      className={`${deckClassName("paper")} bg-paper`}
      onLayout={handlePaperLayout}
      style={[paperStyle, { transformOrigin: "top" }]}
    >
      {/*
        Hidden mirror: lays out `value` with the same font, size, lineHeight,
        and wrap width (innerWidth) as the TextInput, so onTextLayout gives the
        real line geometry the WYSIWYG cap clamps on. Invisible (opacity 0,
        pointerEvents none) — it never affects layout or receives touches. Its
        wrap width follows the paper's measured inner width so it matches the
        TextInput's text area exactly across screen sizes.
      */}
      <Text
        pointerEvents="none"
        onTextLayout={handleMirrorTextLayout}
        style={[styles.mirror, { width: innerWidth }]}
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
        // The outer ScrollView (in CreatePaperScreen) scrolls the sheet above
        // the keyboard; the input itself never scrolls (its content is clamped
        // to the frame by the WYSIWYG cap, so it has nothing to scroll).
        scrollEnabled={false}
        placeholder="TAP TO START TYPING"
        placeholderTextColor="#79716B"
        // Native cap: the first line of defense. Rejects keystrokes past
        // maxChars before they render (flash-free) and truncates pastes to
        // maxChars. The mirror's truncation is the backstop for overflows that
        // slip through while maxChars is loose.
        maxLength={maxChars}
        textAlignVertical="top"
        className="h-full w-full p-6 font-paper text-base text-primary"
        style={styles.input}
      />
      {inkOverlayUri && !scribbleActive ? <InkOverlay uri={inkOverlayUri} /> : null}
      {scribbleCanvas}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  mirror: {
    position: "absolute",
    opacity: 0,
    left: PAPER_PADDING,
    top: PAPER_PADDING,
    fontFamily: PAPER_FONT_FAMILY,
    fontSize: PAPER_FONT_SIZE,
    lineHeight: INPUT_LINE_HEIGHT,
  },
  input: {
    fontFamily: PAPER_FONT_FAMILY,
    fontSize: PAPER_FONT_SIZE,
    lineHeight: INPUT_LINE_HEIGHT,
  },
});

export default EditablePaper;
