import ExpoModulesCore
import UIKit

/** Stable style tokens persisted by JavaScript rather than native font ranges. */
private enum ParagraphPreset: String, CaseIterable {
  case defaultPreset = "default"
  case large = "large"
  case xLarge = "x-large"
}

/** Canonical metrics are scaled only for raster presentation, never capacity. */
private struct PresetMetrics {
  var fontSize: CGFloat
  var lineHeight: CGFloat
}

/** One inferred UIKit mutation, retained so delegate-bypass edits can be repaired precisely. */
private struct InferredTextEdit {
  var document: NativeTextDocument
  var replacedRange: NSRange
  var replacement: String
}

/** Native mirror of the versioned top-level Paper data payload. */
private struct NativeTextDocument: Equatable {
  var text: String
  var paragraphPresets: [ParagraphPreset]

  init(text: String, paragraphPresets: [ParagraphPreset]) {
    self.text = text
    let count = NativeTextDocument.paragraphCount(in: text)
    self.paragraphPresets = (0..<count).map { index in
      index < paragraphPresets.count ? paragraphPresets[index] : .defaultPreset
    }
  }

  /** Newline-delimited paragraphs include empty and final trailing paragraphs. */
  static func paragraphCount(in text: String) -> Int {
    let value = text as NSString
    var count = 1
    for index in 0..<value.length where value.character(at: index) == 10 {
      count += 1
    }
    return count
  }
}

/**
 * PaperTextInputView — reusable bounded TextKit rendering and editing surface.
 *
 * Paper is the first adapter, but the engine accepts canonical geometry,
 * typography presets, presentation scale, and an optional visible-line limit.
 * Print captions reuse the same pre-paint acceptance path with one Default
 * preset, a fixed one-line limit, and centering on both axes.
 *
 * There are intentionally two coordinate systems:
 *   1. Candidate documents are always laid out in the canonical artefact box.
 *      This is the persisted capacity contract and cannot vary by device.
 *   2. The live UITextView lays out proportionally at `presentationScale`.
 *      Expanded Type renders at actual screen size instead of magnifying a
 *      310-point layer, eliminating the blurry focused text regression.
 *
 * Every proposed edit is styled and measured in `shouldChangeTextIn`, before
 * UIKit paints it. Oversized paste inserts only its largest fitting grapheme
 * prefix. Paragraph preset changes use the same candidate measurement and are
 * rejected atomically; existing text is never truncated to make a style fit.
 *
 * `pendingNativeDocuments` protects fast native typing from stale controlled
 * React props. React may echo edit N after UIKit has accepted N+1; recognizing
 * those acknowledgements prevents the older document from rolling the caret,
 * text, or paragraph styles backward.
 */
final class PaperTextInputView: ExpoView, UITextViewDelegate {
  let onPaperDocumentChange = EventDispatcher()
  let onPaperSelectionStateChange = EventDispatcher()
  let onPaperInputFocus = EventDispatcher()
  let onPaperInputBlur = EventDispatcher()

  /** Sole TextKit renderer/responder; read and edit modes never swap view classes. */
  private let textView = UITextView()
  /** Separate noninteractive prompt avoids polluting durable attributed storage. */
  private let placeholderLabel = UILabel()

  /** Last state accepted by canonical layout; used to recover bypass edits. */
  private var lastAcceptedDocument = NativeTextDocument(text: "", paragraphPresets: [])
  /** React acknowledgements still in flight, ordered by native acceptance. */
  private var pendingNativeDocuments: [NativeTextDocument] = []
  /** Candidate prepared before UIKit applies the corresponding text mutation. */
  private var pendingEditDocument: NativeTextDocument?
  /** Attribute/programmatic updates must not be mistaken for user mutations. */
  private var applyingProgrammaticDocument = false

  /** Stable style tokens corresponding one-for-one with newline-delimited paragraphs. */
  private var paragraphPresets: [ParagraphPreset] = [.defaultPreset]
  /** Safe launch default mirrors Paper props until Expo applies the configured PostScript name. */
  private var fontPostScriptName = "ABCStefanUnlicensedTrial-Simple"
  /** Safe launch metrics mirror JS product tokens; Expo props remain authoritative. */
  private var presetMetrics: [ParagraphPreset: PresetMetrics] = [
    .defaultPreset: PresetMetrics(fontSize: 16, lineHeight: 22.4),
    .large: PresetMetrics(fontSize: 20, lineHeight: 28),
    .xLarge: PresetMetrics(fontSize: 24, lineHeight: 33.6),
  ]
  /** Display-only raster multiplier; never used to decide persisted capacity. */
  private var presentationScale: CGFloat = 1
  /** Adapter-supplied logical bounds shared by every device and output surface. */
  private var canonicalWidth: CGFloat = 310
  private var canonicalHeight: CGFloat = 438.43
  /** Sole logical inset; UITextView's implicit padding is disabled during init. */
  private var canonicalContentPadding: CGFloat = 24
  /** Zero means physical height only; Print supplies its fixed one-line cap. */
  private var maximumVisibleLines = 0
  /** Print is Default-only; Paper enables selection-aware paragraph commands. */
  private var allowsParagraphPresets = true
  /** Print centers each paragraph; Paper follows the paragraph's writing direction. */
  private var horizontalTextAlignment = NSTextAlignment.natural
  /** Print centers its complete line block; Paper preserves its top text origin. */
  private var centersTextVertically = false
  /** Initial sRGB values prevent a wrong-color frame before Expo applies React props. */
  private var textColor = UIColor(red: 12 / 255, green: 10 / 255, blue: 9 / 255, alpha: 1)
  private var placeholderColor = UIColor(
    red: 121 / 255,
    green: 113 / 255,
    blue: 107 / 255,
    alpha: 1
  )
  /** Authoring prompt only; output adapters leave it empty. */
  private var placeholder = ""

  /** TextKit probe gives a zero-length trailing paragraph its persisted line metrics. */
  private let trailingEmptyParagraphProbe = "\u{200B}"
  /** Mirrors Paper's JS mount guard; real responsive scales are always much larger. */
  private let minimumPresentationScale: CGFloat = 0.01
  /** Absorbs sub-point TextKit rounding without permitting another physical line. */
  private let capacityRoundingTolerance: CGFloat = 0.5

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = .clear

    // UIKit owns the responder, selection, marked text, autocorrection, Undo,
    // and glyph layout. Removing every implicit inset leaves the adapter's
    // canonical padding as the sole wrapping boundary.
    textView.delegate = self
    textView.backgroundColor = .clear
    textView.contentInset = .zero
    textView.contentInsetAdjustmentBehavior = .never
    textView.isScrollEnabled = false
    textView.alwaysBounceVertical = false
    textView.showsVerticalScrollIndicator = false
    textView.showsHorizontalScrollIndicator = false
    textView.textContainer.lineFragmentPadding = 0
    textView.textContainer.lineBreakMode = .byWordWrapping
    textView.textContainer.widthTracksTextView = true
    textView.textContainer.heightTracksTextView = true
    textView.layoutManager.usesFontLeading = false
    textView.adjustsFontForContentSizeCategory = false
    textView.textAlignment = horizontalTextAlignment
    textView.accessibilityLabel = "Artefact text"
    addSubview(textView)

    // The placeholder is display-only and cannot steal the full-canvas input
    // target. It uses the exact Default line box at the presentation scale.
    placeholderLabel.numberOfLines = 0
    placeholderLabel.textAlignment = horizontalTextAlignment
    placeholderLabel.isUserInteractionEnabled = false
    placeholderLabel.isAccessibilityElement = false
    addSubview(placeholderLabel)

    applyPresentationConfiguration()
    updatePlaceholderVisibility()
  }

  /**
   * Lay out the renderer and prompt on UIKit's main thread.
   *
   * Print's offset is applied through native frame and text-container geometry,
   * never a transform. Increasing the frame by the same amount added to the top
   * inset preserves the canonical usable height, so visual centering cannot
   * change wrap or one-line capacity. Paper's disabled flag resolves to zero and
   * retains its established top origin.
   */
  override func layoutSubviews() {
    super.layoutSubviews()
    // Reset to the canonical display box before measuring; this prevents the
    // previous one-line offset from feeding back into the next layout pass.
    textView.frame = bounds
    let padding = canonicalContentPadding * presentationScale
    textView.textContainerInset = UIEdgeInsets(
      top: padding,
      left: padding,
      bottom: padding,
      right: padding
    )
    let verticalOffset = verticalTextOffset()
    // Add the offset to both the top inset and the view's clipped bottom edge.
    // Their difference leaves TextKit's usable height unchanged, so centering
    // cannot reduce one-line capacity. Native frame/inset geometry also avoids
    // the transform rasterization that previously softened enlarged text.
    textView.frame = CGRect(
      x: bounds.minX,
      y: bounds.minY,
      width: bounds.width,
      height: bounds.height + verticalOffset
    )
    textView.textContainerInset = UIEdgeInsets(
      top: padding + verticalOffset,
      left: padding,
      bottom: padding,
      right: padding
    )
    let placeholderBounds = bounds.insetBy(dx: padding, dy: padding)
    // Restrict UILabel to one measured line box so its implicit vertical
    // alignment cannot diverge from Paper's top origin or Print's explicit
    // empty-caret offset.
    let placeholderSize = placeholderLabel.sizeThatFits(
      CGSize(width: placeholderBounds.width, height: .greatestFiniteMagnitude)
    )
    placeholderLabel.frame = CGRect(
      x: placeholderBounds.minX,
      y: placeholderBounds.minY + verticalOffset,
      width: placeholderBounds.width,
      height: min(placeholderBounds.height, ceil(placeholderSize.height))
    )
  }

  /** Apply one atomic React-controlled payload on UIKit's main thread. */
  func setDocumentJson(_ documentJson: String) {
    guard let incoming = decodeDocument(documentJson) else {
      return
    }
    let current = currentDocument()

    if let acknowledgedIndex = pendingNativeDocuments.lastIndex(of: incoming) {
      pendingNativeDocuments.removeFirst(acknowledgedIndex + 1)

      // A remaining queued current value proves UIKit has already advanced
      // beyond this acknowledgement; applying it would recreate rollback flicker.
      if incoming != current, pendingNativeDocuments.contains(current) {
        return
      }
    } else if incoming != current {
      // A document never emitted here is an intentional external replacement,
      // such as pager virtualization mounting a different Paper artefact.
      pendingNativeDocuments.removeAll()
    }

    guard incoming != current else {
      paragraphPresets = incoming.paragraphPresets
      lastAcceptedDocument = incoming
      updateTypingAttributes()
      return
    }

    let end = (incoming.text as NSString).length
    applyDocument(incoming, selectedRange: NSRange(location: end, length: 0))
    lastAcceptedDocument = incoming
  }

  func setEditable(_ editable: Bool) {
    textView.isEditable = editable
    textView.isSelectable = editable
    textView.isUserInteractionEnabled = editable
    if !editable {
      textView.resignFirstResponder()
    }
  }

  func setPlaceholder(_ value: String) {
    placeholder = value
    applyPlaceholderTypography()
  }

  func setFontFamily(_ value: String) {
    fontPostScriptName = value
    applyPresentationConfiguration()
  }

  func setDefaultFontSize(_ value: CGFloat) {
    presetMetrics[.defaultPreset]?.fontSize = value
    applyPresentationConfiguration()
  }

  func setDefaultLineHeight(_ value: CGFloat) {
    presetMetrics[.defaultPreset]?.lineHeight = value
    applyPresentationConfiguration()
  }

  func setLargeFontSize(_ value: CGFloat) {
    presetMetrics[.large]?.fontSize = value
    applyPresentationConfiguration()
  }

  func setLargeLineHeight(_ value: CGFloat) {
    presetMetrics[.large]?.lineHeight = value
    applyPresentationConfiguration()
  }

  func setXLargeFontSize(_ value: CGFloat) {
    presetMetrics[.xLarge]?.fontSize = value
    applyPresentationConfiguration()
  }

  func setXLargeLineHeight(_ value: CGFloat) {
    presetMetrics[.xLarge]?.lineHeight = value
    applyPresentationConfiguration()
  }

  func setPresentationScale(_ value: CGFloat) {
    presentationScale = max(minimumPresentationScale, value)
    applyPresentationConfiguration()
  }

  func setCanonicalWidth(_ value: CGFloat) {
    canonicalWidth = max(0, value)
    reportSelectionState()
  }

  func setCanonicalHeight(_ value: CGFloat) {
    canonicalHeight = max(0, value)
    reportSelectionState()
  }

  func setContentPadding(_ value: CGFloat) {
    canonicalContentPadding = max(0, value)
    applyPresentationConfiguration()
  }

  /**
   * Apply the adapter's fixed line cap on UIKit's main thread.
   * Zero leaves Paper governed by canonical height; Print supplies one.
   */
  func setMaximumVisibleLines(_ value: Int) {
    maximumVisibleLines = max(0, value)
    reportSelectionState()
  }

  /**
   * Enable selection-aware formatting on UIKit's main thread for Paper only.
   * Print returns early from toolbar reporting because its typography is fixed.
   */
  func setAllowsParagraphPresets(_ value: Bool) {
    allowsParagraphPresets = value
    reportSelectionState()
  }

  /**
   * Apply the adapter's horizontal paragraph origin on UIKit's main thread.
   *
   * Both live and off-screen attributed strings read this value, so centering
   * changes presentation without creating a second wrapping or capacity path.
   * The UILabel property keeps Print's empty prompt on the same center axis as
   * its caret and accepted caption.
   */
  func setHorizontalTextAlignment(_ value: String) {
    horizontalTextAlignment = value == "center" ? .center : .natural
    textView.textAlignment = horizontalTextAlignment
    placeholderLabel.textAlignment = horizontalTextAlignment
    applyPresentationConfiguration()
  }

  /**
   * Select top or centered display geometry on UIKit's main thread.
   *
   * The adapter prop never changes TextKit's canonical measurement box. A
   * layout invalidation is sufficient because the next pass derives the frame
   * offset from the already accepted live document.
   */
  func setCentersTextVertically(_ value: Bool) {
    centersTextVertically = value
    setNeedsLayout()
  }

  func setTextColor(_ color: UIColor) {
    textColor = color
    applyPresentationConfiguration()
  }

  func setPlaceholderTextColor(_ color: UIColor) {
    placeholderColor = color
    applyPlaceholderTypography()
  }

  func focus() {
    guard textView.isEditable else {
      return
    }
    textView.becomeFirstResponder()
  }

  func blur() {
    textView.resignFirstResponder()
  }

  /**
   * Apply a toolbar preset to the caret paragraph or selected paragraphs.
   * Returns false without changing text or attributes when canonical TextKit
   * proves the larger candidate would exceed the artefact's physical capacity.
   */
  func setParagraphPreset(_ rawPreset: String) -> Bool {
    guard
      textView.isEditable,
      allowsParagraphPresets,
      let preset = ParagraphPreset(rawValue: rawPreset)
    else {
      return false
    }
    let current = currentDocument()
    let candidate = applying(preset, toSelectionIn: current)
    guard candidate == current || candidateFits(candidate) else {
      reportSelectionState()
      return false
    }
    guard candidate != current else {
      updateTypingAttributes()
      reportSelectionState()
      return true
    }

    paragraphPresets = candidate.paragraphPresets
    normalizeDisplayedAttributes(for: candidate)
    lastAcceptedDocument = candidate
    emitDocument(candidate)
    reportSelectionState()
    return true
  }

  /**
   * Main-thread pre-paint gate. An invalid single edit leaves text, selection,
   * and styles untouched. Multi-grapheme paste is reduced to the longest prefix
   * whose fully styled document fits the canonical box.
   */
  func textView(
    _ textView: UITextView,
    shouldChangeTextIn range: NSRange,
    replacementText replacement: String
  ) -> Bool {
    // IME composition owns temporary marked text. Its committed result is
    // validated in `textViewDidChange`; interrupting composition here breaks
    // multi-stage keyboards and dictation.
    if textView.markedTextRange != nil {
      pendingEditDocument = nil
      return true
    }

    let current = currentDocument()
    guard let candidate = replacing(current, in: range, with: replacement) else {
      return false
    }
    if candidateFits(candidate) {
      pendingEditDocument = candidate
      return true
    }
    let fitting = longestFittingReplacementPrefix(
      of: replacement,
      replacing: range,
      in: current
    )
    // If no incoming grapheme fits, preserve the selected suffix as well. A
    // failed replacement must never become an accidental deletion.
    if let fitting, !fitting.text.isEmpty {
      applyAcceptedReplacement(fitting.text, document: fitting.document, in: range)
    }
    pendingEditDocument = nil
    return false
  }

  /**
   * Reconcile UIKit's completed mutation on the main thread before display.
   *
   * Normal keystrokes consume the candidate prepared by `shouldChangeTextIn`.
   * IME commit, dictation, and autocorrection may bypass that candidate, so we
   * infer their exact replacement and run the same canonical fit test here.
   * Repair applies only the fitting incoming prefix; prior accepted content is
   * never truncated. Marked composition remains temporary and is evaluated only
   * when UIKit commits it, preserving multi-stage keyboard behavior.
   */
  func textViewDidChange(_ textView: UITextView) {
    updatePlaceholderVisibility()
    setNeedsLayout()
    guard !applyingProgrammaticDocument else {
      return
    }
    guard textView.markedTextRange == nil else {
      pendingEditDocument = nil
      return
    }

    let nextText = textView.text ?? ""
    let inferredEdit = inferredEdit(afterBypassChangeTo: nextText)
    let candidate: NativeTextDocument
    if let pending = pendingEditDocument, pending.text == nextText {
      candidate = pending
    } else {
      candidate = inferredEdit.document
    }
    pendingEditDocument = nil

    if candidateFits(candidate) {
      paragraphPresets = candidate.paragraphPresets
      normalizeDisplayedAttributes(for: candidate)
      lastAcceptedDocument = candidate
      emitDocument(candidate)
      reportSelectionState()
      return
    }

    // IME commit, dictation, and autocorrection can bypass the normal delegate
    // gate. Apply the largest fitting grapheme prefix to the exact inferred
    // replacement range, matching paste behavior while preserving every
    // previously accepted character before and after the edit.
    if
      !inferredEdit.replacement.isEmpty,
      let fitting = longestFittingReplacementPrefix(
        of: inferredEdit.replacement,
        replacing: inferredEdit.replacedRange,
        in: lastAcceptedDocument
      )
    {
      applyAcceptedReplacement(
        fitting.text,
        document: fitting.document,
        in: inferredEdit.replacedRange
      )
      return
    }

    // No incoming grapheme fits. This synchronous delegate callback restores
    // the pre-edit state before UIKit's next display pass; it never truncates a
    // valid suffix in order to make the new input fit.
    let caret = min(textView.selectedRange.location, (lastAcceptedDocument.text as NSString).length)
    applyDocument(
      lastAcceptedDocument,
      selectedRange: NSRange(location: caret, length: 0)
    )
  }

  func textViewDidChangeSelection(_ textView: UITextView) {
    guard !applyingProgrammaticDocument else {
      return
    }
    updateTypingAttributes()
    reportSelectionState()
  }

  func textViewDidBeginEditing(_ textView: UITextView) {
    reportSelectionState()
    onPaperInputFocus()
  }

  func textViewDidEndEditing(_ textView: UITextView) {
    onPaperInputBlur()
  }

  /** Resolve the bundled face by its native PostScript name. */
  private func font(at size: CGFloat) -> UIFont {
    if let font = UIFont(name: fontPostScriptName, size: size) {
      return font
    }
    assertionFailure("Paper font is not registered under PostScript name \(fontPostScriptName)")
    return UIFont.systemFont(ofSize: size)
  }

  /** Build explicit line boxes without Dynamic Type or platform font leading. */
  private func textAttributes(
    preset: ParagraphPreset,
    scale: CGFloat,
    color: UIColor
  ) -> [NSAttributedString.Key: Any] {
    let canonical = presetMetrics[preset] ?? presetMetrics[.defaultPreset]!
    let resolvedFont = font(at: canonical.fontSize * scale)
    let lineHeight = canonical.lineHeight * scale
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
    paragraph.lineBreakMode = .byWordWrapping
    paragraph.lineSpacing = 0
    paragraph.paragraphSpacing = 0
    paragraph.paragraphSpacingBefore = 0
    paragraph.hyphenationFactor = 0
    paragraph.alignment = horizontalTextAlignment
    let baselineOffset = max(0, (lineHeight - resolvedFont.lineHeight) / 2)
    return [
      .font: resolvedFont,
      .foregroundColor: color,
      .paragraphStyle: paragraph,
      .baselineOffset: baselineOffset,
    ]
  }

  /**
   * Construct one attributed string from stable paragraph tokens. Newline
   * characters belong to the paragraph before them; a trailing empty paragraph
   * has no glyph attributes but still owns `typingAttributes` at its caret.
   */
  private func attributedDocument(
    _ document: NativeTextDocument,
    scale: CGFloat,
    color: UIColor
  ) -> NSAttributedString {
    let result = NSMutableAttributedString(
      string: document.text,
      attributes: textAttributes(preset: .defaultPreset, scale: scale, color: color)
    )
    let ranges = paragraphRanges(in: document.text)
    for (index, range) in ranges.enumerated() where range.length > 0 {
      let preset = document.paragraphPresets[index]
      result.addAttributes(textAttributes(preset: preset, scale: scale, color: color), range: range)
    }
    return result
  }

  private func paragraphRanges(in text: String) -> [NSRange] {
    let value = text as NSString
    var ranges: [NSRange] = []
    var start = 0
    for index in 0..<value.length where value.character(at: index) == 10 {
      ranges.append(NSRange(location: start, length: index - start + 1))
      start = index + 1
    }
    ranges.append(NSRange(location: start, length: value.length - start))
    return ranges
  }

  /**
   * Rebuild display-only TextKit attributes after an adapter prop changes.
   *
   * This runs on Expo's native view thread (UIKit's main thread). Insets, font
   * sizes, and line boxes receive `presentationScale`; the stored document and
   * canonical capacity geometry do not. Restyling in place preserves responder
   * state and selection while a device rotates or a presentation host remounts.
   */
  private func applyPresentationConfiguration() {
    let padding = canonicalContentPadding * presentationScale
    textView.textContainerInset = UIEdgeInsets(
      top: padding,
      left: padding,
      bottom: padding,
      right: padding
    )
    normalizeDisplayedAttributes(for: currentDocument())
    applyPlaceholderTypography()
    setNeedsLayout()
    reportSelectionState()
  }

  private func applyPlaceholderTypography() {
    placeholderLabel.attributedText = NSAttributedString(
      string: placeholder,
      attributes: textAttributes(
        preset: .defaultPreset,
        scale: presentationScale,
        color: placeholderColor
      )
    )
  }

  /**
   * Measure the live TextKit line block on UIKit's main thread.
   *
   * `usedRect` describes visible glyph lines while `extraLineFragmentUsedRect`
   * represents the physical empty line after a trailing newline. Empty content
   * still reserves one Default line so the caret and placeholder share the same
   * centered origin before the first keystroke.
   */
  private func displayedTextBlockHeight() -> CGFloat {
    guard !(textView.text ?? "").isEmpty else {
      let metrics = presetMetrics[.defaultPreset]!
      return metrics.lineHeight * presentationScale
    }
    let layoutManager = textView.layoutManager
    let container = textView.textContainer
    layoutManager.ensureLayout(for: container)
    return max(
      layoutManager.usedRect(for: container).maxY,
      layoutManager.extraLineFragmentUsedRect.maxY
    )
  }

  /**
   * Return a screen-pixel-aligned display offset for Print's complete text block.
   *
   * This is presentation-only and runs on UIKit's main thread during layout.
   * Canonical measurement remains top-origin, so centering cannot change wrap or
   * acceptance. Print's sole line uses half the unused height. Pixel alignment
   * avoids softening the native baseline.
   */
  private func verticalTextOffset() -> CGFloat {
    guard centersTextVertically else {
      return 0
    }
    let padding = canonicalContentPadding * presentationScale
    let availableHeight = max(0, bounds.height - padding * 2)
    let rawOffset = max(0, (availableHeight - displayedTextBlockHeight()) / 2)
    let pixelScale = max(1, traitCollection.displayScale)
    return (rawOffset * pixelScale).rounded() / pixelScale
  }

  /**
   * Install one complete document atomically on the main thread.
   *
   * Programmatic replacement is guarded so delegate callbacks cannot re-emit a
   * controlled acknowledgement as a fresh user edit. Selection is clamped in
   * UTF-16 coordinates because UIKit ranges and JavaScript string offsets may
   * otherwise diverge around emoji or an external document replacement.
   */
  private func applyDocument(_ document: NativeTextDocument, selectedRange: NSRange) {
    applyingProgrammaticDocument = true
    paragraphPresets = document.paragraphPresets
    textView.attributedText = attributedDocument(
      document,
      scale: presentationScale,
      color: textColor
    )
    let length = (document.text as NSString).length
    let location = min(selectedRange.location, length)
    textView.selectedRange = NSRange(
      location: location,
      length: min(selectedRange.length, max(0, length - location))
    )
    textView.tintColor = textColor
    updateTypingAttributes()
    applyingProgrammaticDocument = false
    updatePlaceholderVisibility()
    setNeedsLayout()
    reportSelectionState()
  }

  /** Re-style the unchanged live storage without resetting its text or caret. */
  private func normalizeDisplayedAttributes(for document: NativeTextDocument) {
    guard (textView.text ?? "") == document.text else {
      applyDocument(document, selectedRange: textView.selectedRange)
      return
    }
    applyingProgrammaticDocument = true
    let selection = textView.selectedRange
    textView.textStorage.beginEditing()
    let length = (document.text as NSString).length
    if length > 0 {
      let ranges = paragraphRanges(in: document.text)
      for (index, range) in ranges.enumerated() where range.length > 0 {
        textView.textStorage.setAttributes(
          textAttributes(
            preset: document.paragraphPresets[index],
            scale: presentationScale,
            color: textColor
          ),
          range: range
        )
      }
    }
    textView.textStorage.endEditing()
    textView.selectedRange = selection
    textView.tintColor = textColor
    updateTypingAttributes()
    applyingProgrammaticDocument = false
    updatePlaceholderVisibility()
    setNeedsLayout()
  }

  private func updateTypingAttributes() {
    let document = currentDocument()
    let index = paragraphIndex(at: textView.selectedRange.location, in: document.text)
    let preset = document.paragraphPresets[min(index, document.paragraphPresets.count - 1)]
    textView.typingAttributes = textAttributes(
      preset: preset,
      scale: presentationScale,
      color: textColor
    )
  }

  private func updatePlaceholderVisibility() {
    placeholderLabel.isHidden = !(textView.text ?? "").isEmpty
  }

  private func currentDocument() -> NativeTextDocument {
    NativeTextDocument(text: textView.text ?? "", paragraphPresets: paragraphPresets)
  }

  /**
   * Decode the atomic React prop at the native boundary.
   *
   * Invalid preset tokens degrade to Default and the document initializer
   * normalizes paragraph count, mirroring JavaScript's forgiving persistence
   * parser. Malformed JSON is ignored so a transient bad prop cannot erase the
   * currently displayed and last-accepted document.
   */
  private func decodeDocument(_ json: String) -> NativeTextDocument? {
    guard
      let data = json.data(using: .utf8),
      let decoded = try? JSONSerialization.jsonObject(with: data),
      let object = decoded as? [String: Any]
    else {
      return nil
    }
    let text = object["text"] as? String ?? ""
    let rawPresets = object["paragraphPresets"] as? [String] ?? []
    let presets = rawPresets.map { ParagraphPreset(rawValue: $0) ?? .defaultPreset }
    return NativeTextDocument(text: text, paragraphPresets: presets)
  }

  /**
   * Transform paragraph tokens alongside a UTF-16 text replacement. New
   * paragraphs inherit the paragraph at the insertion start; deleting a newline
   * similarly makes the leading paragraph own the merged result.
   */
  private func replacing(
    _ document: NativeTextDocument,
    in range: NSRange,
    with replacement: String
  ) -> NativeTextDocument? {
    let current = document.text as NSString
    guard range.location <= current.length, range.location + range.length <= current.length else {
      return nil
    }
    let nextText = current.replacingCharacters(in: range, with: replacement)
    let startParagraph = paragraphIndex(at: range.location, in: document.text)
    let endParagraph = paragraphIndex(at: range.location + range.length, in: document.text)
    let inherited = document.paragraphPresets[startParagraph]
    let insertedParagraphCount = NativeTextDocument.paragraphCount(in: replacement)

    var nextPresets = Array(document.paragraphPresets.prefix(startParagraph))
    nextPresets.append(contentsOf: repeatElement(inherited, count: insertedParagraphCount))
    if endParagraph + 1 < document.paragraphPresets.count {
      nextPresets.append(contentsOf: document.paragraphPresets[(endParagraph + 1)...])
    }
    return NativeTextDocument(text: nextText, paragraphPresets: nextPresets)
  }

  /**
   * Canonical TextKit is the single capacity oracle for all devices and scales.
   * `extraLineFragmentUsedRect` reserves a physical blank line after a trailing
   * newline. Print's configured one-line cap is checked after the same physical
   * height measurement; Paper uses zero to rely on page height alone.
   */
  private func candidateFits(_ document: NativeTextDocument) -> Bool {
    let availableWidth = canonicalWidth - canonicalContentPadding * 2
    let availableHeight = canonicalHeight - canonicalContentPadding * 2
    guard availableWidth > 0, availableHeight > 0 else {
      return true
    }
    guard !document.text.isEmpty else {
      return true
    }

    let measuredDocument = NSMutableAttributedString(
      attributedString: attributedDocument(document, scale: 1, color: textColor)
    )
    if document.text.hasSuffix("\n") {
      // An attributed string cannot attach attributes to a zero-length range.
      // A zero-width probe makes TextKit reserve the trailing paragraph's
      // selected line box without adding visible content or horizontal width.
      measuredDocument.append(
        NSAttributedString(
          string: trailingEmptyParagraphProbe,
          attributes: textAttributes(
            preset: document.paragraphPresets.last ?? .defaultPreset,
            scale: 1,
            color: textColor
          )
        )
      )
    }
    let storage = NSTextStorage(attributedString: measuredDocument)
    let layoutManager = NSLayoutManager()
    layoutManager.usesFontLeading = false
    let container = NSTextContainer(
      size: CGSize(width: availableWidth, height: CGFloat.greatestFiniteMagnitude)
    )
    container.lineFragmentPadding = 0
    container.lineBreakMode = .byWordWrapping
    storage.addLayoutManager(layoutManager)
    layoutManager.addTextContainer(container)
    layoutManager.ensureLayout(for: container)

    let usedBottom = max(
      layoutManager.usedRect(for: container).maxY,
      layoutManager.extraLineFragmentUsedRect.maxY
    )
    if ceil(usedBottom) > availableHeight + capacityRoundingTolerance {
      return false
    }
    guard maximumVisibleLines > 0 else {
      return true
    }

    var lineCount = 0
    let glyphRange = layoutManager.glyphRange(for: container)
    layoutManager.enumerateLineFragments(forGlyphRange: glyphRange) { _, _, _, _, _ in
      lineCount += 1
    }
    if layoutManager.extraLineFragmentUsedRect.height > 0 {
      lineCount += 1
    }
    return lineCount <= maximumVisibleLines
  }

  /** Binary-search paste by grapheme count; physical capacity is prefix-monotonic. */
  private func longestFittingReplacementPrefix(
    of replacement: String,
    replacing range: NSRange,
    in current: NativeTextDocument
  ) -> (text: String, document: NativeTextDocument)? {
    var low = 0
    var high = replacement.count
    var best: NativeTextDocument?
    while low < high {
      let mid = (low + high + 1) / 2
      let prefix = String(replacement.prefix(mid))
      if let candidate = replacing(current, in: range, with: prefix), candidateFits(candidate) {
        low = mid
        best = candidate
      } else {
        high = mid - 1
      }
    }
    guard low > 0 else {
      return nil
    }
    let prefix = String(replacement.prefix(low))
    let document = best ?? replacing(current, in: range, with: prefix)!
    return (prefix, document)
  }

  /**
   * Apply a premeasured partial paste/IME replacement without asking UIKit to
   * replay the rejected original edit. The caret lands after the accepted
   * grapheme prefix, then one atomic document event enters the controlled queue.
   */
  private func applyAcceptedReplacement(
    _ replacement: String,
    document: NativeTextDocument,
    in range: NSRange
  ) {
    let caret = range.location + (replacement as NSString).length
    applyDocument(document, selectedRange: NSRange(location: caret, length: 0))
    lastAcceptedDocument = document
    emitDocument(document)
  }

  /**
   * Diff UIKit's current UTF-16 text against the last accepted document.
   *
   * IME commit, dictation, and autocorrection may skip our prepared candidate.
   * Retaining the exact old range and replacement lets the recovery path apply
   * only a fitting grapheme prefix instead of rolling back or truncating an
   * unrelated accepted suffix.
   */
  private func inferredEdit(afterBypassChangeTo nextText: String) -> InferredTextEdit {
    let previous = lastAcceptedDocument.text as NSString
    let next = nextText as NSString
    var prefix = 0
    while
      prefix < previous.length,
      prefix < next.length,
      previous.character(at: prefix) == next.character(at: prefix)
    {
      prefix += 1
    }
    var suffix = 0
    while
      suffix < previous.length - prefix,
      suffix < next.length - prefix,
      previous.character(at: previous.length - suffix - 1)
        == next.character(at: next.length - suffix - 1)
    {
      suffix += 1
    }
    let oldRange = NSRange(location: prefix, length: previous.length - prefix - suffix)
    let replacementRange = NSRange(location: prefix, length: next.length - prefix - suffix)
    let replacement = next.substring(with: replacementRange)
    let document = replacing(lastAcceptedDocument, in: oldRange, with: replacement)
      ?? NativeTextDocument(text: nextText, paragraphPresets: paragraphPresets)
    return InferredTextEdit(
      document: document,
      replacedRange: oldRange,
      replacement: replacement
    )
  }

  /**
   * Map UIKit's UTF-16 caret offset to the durable newline-token index.
   * A caret on a newline belongs to the paragraph before it; a caret immediately
   * after that newline belongs to the next paragraph, including a trailing empty
   * paragraph whose style exists only in `typingAttributes`.
   */
  private func paragraphIndex(at utf16Location: Int, in text: String) -> Int {
    let value = text as NSString
    let location = min(max(0, utf16Location), value.length)
    var paragraph = 0
    for index in 0..<location where value.character(at: index) == 10 {
      paragraph += 1
    }
    return min(paragraph, NativeTextDocument.paragraphCount(in: text) - 1)
  }

  /** Non-empty selections affect every paragraph whose text/newline they intersect. */
  private func selectedParagraphRange(in text: String) -> ClosedRange<Int> {
    let selection = textView.selectedRange
    let start = paragraphIndex(at: selection.location, in: text)
    let endLocation =
      selection.length == 0 ? selection.location : selection.location + selection.length - 1
    let end = paragraphIndex(at: endLocation, in: text)
    return start...max(start, end)
  }

  /**
   * Produce a token-only formatting candidate for the current UIKit selection.
   * Text remains byte-for-byte unchanged, allowing `candidateFits` to decide
   * atomically whether the toolbar command may alter every intersected paragraph.
   */
  private func applying(
    _ preset: ParagraphPreset,
    toSelectionIn document: NativeTextDocument
  ) -> NativeTextDocument {
    var presets = document.paragraphPresets
    for index in selectedParagraphRange(in: document.text) {
      presets[index] = preset
    }
    return NativeTextDocument(text: document.text, paragraphPresets: presets)
  }

  /** Publish only the adapter-specific toolbar state after any accepted/configuration change. */
  private func reportSelectionState() {
    let document = currentDocument()
    guard allowsParagraphPresets else {
      return
    }
    let range = selectedParagraphRange(in: document.text)
    let selected = Set(range.map { document.paragraphPresets[$0] })
    let selectedPreset = selected.count == 1 ? selected.first!.rawValue : "mixed"

    func canApply(_ preset: ParagraphPreset) -> Bool {
      let candidate = applying(preset, toSelectionIn: document)
      return candidate == document || candidateFits(candidate)
    }

    onPaperSelectionStateChange([
      "preset": selectedPreset,
      "canApplyDefault": canApply(.defaultPreset),
      "canApplyLarge": canApply(.large),
      "canApplyXLarge": canApply(.xLarge),
    ])
  }

  /** Queue before dispatch so a synchronous controlled React echo is recognizable. */
  private func emitDocument(_ document: NativeTextDocument) {
    pendingNativeDocuments.append(document)
    onPaperDocumentChange([
      "text": document.text,
      "paragraphPresets": document.paragraphPresets.map(\.rawValue),
    ])
  }
}
