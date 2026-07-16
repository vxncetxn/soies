import ExpoModulesCore
import UIKit

/**
 * Expo registration boundary for the bounded TextKit artefact surface.
 *
 * The module only translates React props/events/functions. Layout, acceptance,
 * controlled-state ordering, and paragraph styling remain private to the native
 * view so JavaScript cannot accidentally reintroduce post-paint truncation.
 */
public class PaperTextInputModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaperTextInput")

    View(PaperTextInputView.self) {
      Prop("documentJson") { (view: PaperTextInputView, value: String) in
        view.setDocumentJson(value)
      }
      Prop("editable") { (view: PaperTextInputView, editable: Bool) in
        view.setEditable(editable)
      }
      Prop("placeholder") { (view: PaperTextInputView, placeholder: String) in
        view.setPlaceholder(placeholder)
      }
      Prop("fontFamily") { (view: PaperTextInputView, fontFamily: String) in
        view.setFontFamily(fontFamily)
      }
      Prop("defaultFontSize") { (view: PaperTextInputView, value: Double) in
        view.setDefaultFontSize(CGFloat(value))
      }
      Prop("defaultLineHeight") { (view: PaperTextInputView, value: Double) in
        view.setDefaultLineHeight(CGFloat(value))
      }
      Prop("largeFontSize") { (view: PaperTextInputView, value: Double) in
        view.setLargeFontSize(CGFloat(value))
      }
      Prop("largeLineHeight") { (view: PaperTextInputView, value: Double) in
        view.setLargeLineHeight(CGFloat(value))
      }
      Prop("xLargeFontSize") { (view: PaperTextInputView, value: Double) in
        view.setXLargeFontSize(CGFloat(value))
      }
      Prop("xLargeLineHeight") { (view: PaperTextInputView, value: Double) in
        view.setXLargeLineHeight(CGFloat(value))
      }
      Prop("presentationScale") { (view: PaperTextInputView, value: Double) in
        view.setPresentationScale(CGFloat(value))
      }
      Prop("canonicalWidth") { (view: PaperTextInputView, value: Double) in
        view.setCanonicalWidth(CGFloat(value))
      }
      Prop("canonicalHeight") { (view: PaperTextInputView, value: Double) in
        view.setCanonicalHeight(CGFloat(value))
      }
      Prop("contentPadding") { (view: PaperTextInputView, value: Double) in
        view.setContentPadding(CGFloat(value))
      }
      Prop("maximumVisibleLines") { (view: PaperTextInputView, value: Int) in
        view.setMaximumVisibleLines(value)
      }
      Prop("textColor") { (view: PaperTextInputView, color: UIColor) in
        view.setTextColor(color)
      }
      Prop("placeholderTextColor") { (view: PaperTextInputView, color: UIColor) in
        view.setPlaceholderTextColor(color)
      }

      // Expo view callbacks are direct React Native events. Generic onFocus /
      // onBlur would collide with UIView's inherited bubbling topFocus/topBlur
      // registration and prevent the component from rendering at all.
      Events(
        "onPaperDocumentChange",
        "onPaperSelectionStateChange",
        "onPaperInputFocus",
        "onPaperInputBlur"
      )

      AsyncFunction("focus") { (view: PaperTextInputView) in
        view.focus()
      }
      AsyncFunction("blur") { (view: PaperTextInputView) in
        view.blur()
      }
      AsyncFunction("setParagraphPreset") {
        (view: PaperTextInputView, preset: String) in
        // Selection/capacity events are the source of truth for toolbar state.
        // Keeping this command fire-and-forget also avoids exporting the
        // MainActor-isolated native view through a Sendable return closure.
        _ = view.setParagraphPreset(preset)
      }
    }
  }
}
