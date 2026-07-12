import Foundation
import PencilKit
import Photos
import UIKit
#if canImport(MobileCoreServices)
import MobileCoreServices
#endif
import UniformTypeIdentifiers

@objc public class SignatureInkSurface: UIView {

  // MARK: - Subviews

  // `internal` (not `@objc`) — PencilKit isn't imported in the
  // Obj-C++ wrapper. `var` so `prepareForReuse` can swap the canvas;
  // PKCanvasView carries hidden state that we can't reliably reset.
  internal var canvasView: PKCanvasView = SignatureInkSurface.makeCanvasView()
  /// Offscreen-equivalent replacement warmed behind the visible canvas after
  /// undo/redo. It carries PencilKit's correct internal stroke baseline and is
  /// promoted immediately before the next drawing touch.
  private var preparedHistoryCanvas: PKCanvasView?

  /// Fresh transparent PKCanvasView pinned to a light trait collection
  /// so user-set ink colours never auto-invert in dark mode.
  private static func makeCanvasView() -> PKCanvasView {
    let cv = PKCanvasView(frame: .zero)
    cv.backgroundColor = .clear
    cv.isOpaque = false
    if #available(iOS 14.0, *) {
      cv.drawingPolicy = .anyInput
    }
    cv.overrideUserInterfaceStyle = .light
    return cv
  }

  private var toolbar: UIStackView?
  private var baselineLayer: CAShapeLayer?

  // MARK: - Tool picker

  private var toolPicker: PKToolPicker?
  private var isToolPickerAttached: Bool = false

  // MARK: - Props (set by the Fabric wrapper)

  @objc public var penColor: UIColor = .black { didSet { applyTool() } }
  @objc public var penMinWidth: CGFloat = 1.0 { didSet { applyTool() } }
  @objc public var penMaxWidth: CGFloat = 3.0 { didSet { applyTool() } }
  @objc public var velocityFilterWeight: CGFloat = 0.7

  @objc public var inkBackgroundColor: UIColor = .clear {
    didSet { backgroundColor = inkBackgroundColor }
  }

  @objc public var showBaseline: Bool = false { didSet { setNeedsLayout() } }
  @objc public var baselineColor: UIColor = UIColor.systemGray.withAlphaComponent(0.5) {
    didSet { baselineLayer?.strokeColor = baselineColor.cgColor }
  }
  @objc public var baselineOffsetFromBottom: CGFloat = 8 { didSet { setNeedsLayout() } }
  /// `"solid"`, `"dashed"` (default), or `"dotted"`. Anything else
  /// resolves to `"dashed"`. Driven by JS through the Fabric prop.
  @objc public var baselineStyle: NSString = "dashed" {
    didSet { setNeedsLayout() }
  }
  /// Baseline stroke width in points. `0` (the default) means "use the
  /// per-style auto value"; any positive value overrides those defaults
  /// regardless of `baselineStyle`.
  @objc public var baselineWidth: CGFloat = 0 {
    didSet { setNeedsLayout() }
  }

  @objc public var pencilOnly: Bool = false {
    didSet {
      if #available(iOS 14.0, *) {
        canvasView.drawingPolicy = pencilOnly ? .pencilOnly : .anyInput
        preparedHistoryCanvas?.drawingPolicy = pencilOnly ? .pencilOnly : .anyInput
      }
    }
  }

  @objc public var showToolbar: Bool = false {
    didSet { invalidateToolbar() }
  }
  @objc public var toolbarPosition: NSString = "bottom" {
    didSet { setNeedsLayout() }
  }
  /// JSON array of toolbar items forwarded by the JS wrapper. Parsed
  /// into `toolbarItems`; an empty string means "default toolbar".
  @objc public var toolbarItemsJson: NSString = "" {
    didSet {
      toolbarItems = SignatureInkSurface.parseToolbarItems(toolbarItemsJson as String)
      invalidateToolbar()
    }
  }
  /// Hard cap on inline buttons; extras collapse into the overflow menu.
  /// `0` = compute the visible count from the available width.
  @objc public var toolbarMaxVisibleButtons: Int = 0 {
    didSet { invalidateToolbar() }
  }
  @objc public var toolbarBackgroundColor: UIColor? {
    didSet { toolbar?.layer.backgroundColor = (toolbarBackgroundColor ?? .clear).cgColor }
  }
  @objc public var toolbarTintColor: UIColor? {
    didSet { invalidateToolbar() }
  }
  /// Toolbar height in points. Drives the symmetric vertical gap above
  /// and below the icons (= `(toolbarHeight - iconVisualHeight) / 2`).
  @objc public var toolbarHeight: CGFloat = 44 {
    didSet { setNeedsLayout() }
  }
  /// Horizontal gap between adjacent toolbar buttons.
  @objc public var toolbarIconSpacing: CGFloat = 8 {
    didSet { invalidateToolbar() }
  }

  // Parsed toolbar items + the overflow-aware layout cache. The visible
  // / overflow split is computed in `layoutSubviews` (where the width is
  // known) and rebuilt only when the items or width actually change, so
  // there's no render-then-trim flicker.
  private var toolbarItems: [ToolbarItemModel] = SignatureInkSurface.defaultToolbarItems()
  private var toolbarRevision: Int = 0
  private var builtToolbarRevision: Int = -1
  private var builtToolbarWidth: CGFloat = -1

  /// One uniform overflow ("…") slot width used in the capacity math.
  private let overflowButtonWidth: CGFloat = 44

  struct ToolbarItemModel {
    let id: String
    let icon: String?
    let text: String?
    let tintColor: UIColor?
    let accessibilityLabel: String
    let disabled: Bool
  }

  private func invalidateToolbar() {
    toolbarRevision += 1
    setNeedsLayout()
  }

  @objc public var showToolPicker: Bool = false {
    didSet { syncToolPicker() }
  }

  @objc public var defaultInkType: NSString = "pen" { didSet { applyTool() } }

  // MARK: - Event callbacks (filled in by the ObjC++ wrapper)

  @objc public var onBegin: (() -> Void)?
  @objc public var onEnd: (() -> Void)?
  /// (isEmpty, strokeCount)
  @objc public var onChange: ((Bool, Int) -> Void)?
  /// (requestId, type, value?, error?)
  @objc public var onResult: ((String, String, String?, String?) -> Void)?
  @objc public var onReplayProgress: ((CGFloat) -> Void)?
  @objc public var onToolbarAction: ((String) -> Void)?

  // MARK: - Undo/redo

  private var undoStack: [PKDrawing] = []
  private var redoStack: [PKDrawing] = []
  private var snapshotBeforeStroke: PKDrawing?
  /// One pre-drag revision; individual move events must not grow history.
  private var eraseGestureStartDrawing: PKDrawing?
  private var eraseGestureChanged: Bool = false
  private var suppressChangeEvents: Bool = false

  // MARK: - Replay state

  /// The display link target must be a *separate* object that weakly
  /// references the surface; otherwise `CADisplayLink` strongly retains
  /// `self`, the surface never deallocates after the React instance
  /// unmounts, and `tickReplay` keeps firing on a zombie view.
  private var replayLink: CADisplayLink?
  private var replayProxy: DisplayLinkProxy?
  private var replayFinalDrawing: PKDrawing = PKDrawing()
  private var replayStartTime: CFTimeInterval = 0
  private var replayTotalDuration: CFTimeInterval = 0
  private var replaySpeed: CGFloat = 1.0
  /// Invalidates worker completions when Fabric recycles this surface.
  private var snapshotGeneration: Int = 0
  private static let snapshotQueue = DispatchQueue(
    label: "com.signatureink.snapshot",
    qos: .userInitiated
  )

  // MARK: - Init

  @objc public override init(frame: CGRect) {
    super.init(frame: frame)
    commonInit()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    commonInit()
  }

  /// Safety net: if the surface is deallocated mid-replay or with a
  /// picker still attached, tear both down before `tickReplay` fires
  /// on a freed object or PencilKit logs an orphan-responder warning.
  deinit {
    replayLink?.invalidate()
    replayLink = nil
    replayProxy = nil
    detachToolPicker()
  }

  private lazy var canvasDelegate: SignatureInkCanvasDelegate = {
    let d = SignatureInkCanvasDelegate()
    d.owner = self
    return d
  }()

  private func commonInit() {
    backgroundColor = .clear
    addSubview(canvasView)
    canvasView.delegate = canvasDelegate
    applyTool()
  }

  // Hooks called by the private delegate helper. Internal so the delegate
  // (in the same file) can reach them.
  internal func handleCanvasDidBeginUsingTool() {
    snapshotBeforeStroke = canvasView.drawing
    cancelReplay()
    onBegin?()
  }

  internal func handleCanvasDidEndUsingTool() {
    if let snap = snapshotBeforeStroke {
      undoStack.append(snap)
      redoStack.removeAll()
    }
    snapshotBeforeStroke = nil
    onEnd?()
    emitChange()
  }

  internal func handleCanvasDrawingDidChange() {
    if suppressChangeEvents { return }
    emitChange()
  }

  /// Promotes the already-rendered replacement before PencilKit receives the
  /// next touch. The visible canvas can therefore update in place for
  /// flicker-free history while the next stroke starts from a clean baseline.
  public override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    if preparedHistoryCanvas != nil, self.point(inside: point, with: event) {
      promotePreparedHistoryCanvas()
    }
    return super.hitTest(point, with: event)
  }

  /// Rewrites the picker's currently selected tool with a trait-resolved
  /// color, so dark-mode hosts don't auto-invert ink (e.g. picking "black"
  /// in the picker would otherwise draw white on a dark device).
  internal func normalizeTool(from picker: PKToolPicker) {
    let lightTraits = UITraitCollection(userInterfaceStyle: .light)
    let selected = picker.selectedTool
    if let inking = selected as? PKInkingTool {
      let resolvedColor = inking.color.resolvedColor(with: lightTraits)
      let normalized: PKInkingTool
      if #available(iOS 14.0, *) {
        normalized = PKInkingTool(inking.inkType, color: resolvedColor, width: inking.width)
      } else {
        normalized = PKInkingTool(inking.inkType, color: resolvedColor, width: inking.width)
      }
      canvasView.tool = normalized
    } else {
      canvasView.tool = selected
    }
  }

  public override var canBecomeFirstResponder: Bool { true }

  // MARK: - Lifecycle

  /// Catches every "removed from window" trigger (unmount, modal
  /// dismiss, navigation pop). Cancels replay and detaches the picker
  /// so neither lingers on a detached view.
  public override func willMove(toWindow newWindow: UIWindow?) {
    super.willMove(toWindow: newWindow)
    if newWindow == nil {
      cancelReplay()
      detachToolPicker()
    }
  }

  /// Called by the Fabric host from `prepareForRecycle`. Returns the
  /// surface to a clean slate for the next React mount. The
  /// `PKCanvasView` is replaced (not reset) because PencilKit carries
  /// quiet state — first-responder status, attached tool picker,
  /// internal undo manager, mid-touch tracking — that we can't reset
  /// from the outside.
  @objc public func prepareForReuse() {
    cancelReplay()
    snapshotGeneration += 1

    // Reset EVERY user-facing prop here. The Obj-C++ host resets its
    // `_props` to defaults right before this call, so Fabric's
    // `oldProps == defaults` diff skips any setter where the next
    // mount also uses the default value — and the Swift property
    // would otherwise keep the previous mount's value. Assigning fires
    // `didSet`, which unwires any system-level effect through the
    // usual paths (`syncToolPicker`, `rebuildToolbar`, `applyTool`,
    // …). KEEP IN SYNC with the `@objc public var` declarations above.

    // Pen / ink.
    penColor = .black
    penMinWidth = 1.0
    penMaxWidth = 3.0
    velocityFilterWeight = 0.7
    inkBackgroundColor = .clear
    defaultInkType = "pen"

    // Input policy.
    pencilOnly = false

    // Baseline. `baselineWidth = 0` is the "auto / per-style default" sentinel.
    showBaseline = false
    baselineColor = UIColor.systemGray.withAlphaComponent(0.5)
    baselineOffsetFromBottom = 8
    baselineStyle = "dashed"
    baselineWidth = 0

    // Toolbar.
    showToolbar = false
    toolbarPosition = "bottom"
    toolbarItemsJson = ""
    toolbarMaxVisibleButtons = 0
    toolbarBackgroundColor = nil
    toolbarTintColor = nil
    toolbarHeight = 44
    toolbarIconSpacing = 8

    // Tool picker last, so the explicit detach below runs on a known state.
    showToolPicker = false

    // Defensive: `showToolPicker = false` already routes through
    // `syncToolPicker` → `detachToolPicker`, but call it explicitly
    // in case the picker is lingering from a sibling surface.
    detachToolPicker()

    preparedHistoryCanvas?.removeFromSuperview()
    preparedHistoryCanvas = nil
    let stale = canvasView
    stale.delegate = nil
    stale.removeFromSuperview()

    let fresh = Self.makeCanvasView()
    canvasView = fresh
    fresh.delegate = canvasDelegate
    if #available(iOS 14.0, *) {
      fresh.drawingPolicy = pencilOnly ? .pencilOnly : .anyInput
    }
    insertSubview(fresh, at: 0)
    applyTool()

    // Reset every other piece of per-instance state.
    undoStack.removeAll()
    redoStack.removeAll()
    snapshotBeforeStroke = nil
    eraseGestureStartDrawing = nil
    eraseGestureChanged = false
    suppressChangeEvents = false
    replayFinalDrawing = PKDrawing()
    replayStartTime = 0
    replayTotalDuration = 0
    replaySpeed = 1.0

    setNeedsLayout()
  }

  // MARK: - Layout

  public override func layoutSubviews() {
    super.layoutSubviews()

    // Build (or refresh) the toolbar's visible / overflow split now that
    // the width is known. Recompute only when the items or width change
    // so the very first on-screen frame is already correct (no flicker).
    if showToolbar {
      let availW = bounds.width
      if toolbar == nil
        || toolbarRevision != builtToolbarRevision
        || abs(availW - builtToolbarWidth) > 0.5 {
        rebuildToolbarForWidth(availW)
        builtToolbarRevision = toolbarRevision
        builtToolbarWidth = availW
      }
    } else if toolbar != nil {
      toolbar?.removeFromSuperview()
      toolbar = nil
    }

    // Icons stay anchored to the bottom edge and don't shift when
    // `showBaseline` toggles. With the auto-anchored baseline (at the
    // toolbar's top edge), the symmetric gap above/below icons equals
    // `(toolbarHeight - iconVisualHeight) / 2`.
    let activeHeight: CGFloat = (showToolbar && toolbar != nil) ? toolbarHeight : 0
    let position = (toolbarPosition as String).lowercased()

    if position == "top" {
      toolbar?.frame = CGRect(x: 0, y: 0,
                              width: bounds.width,
                              height: activeHeight)
      canvasView.frame = CGRect(x: 0, y: activeHeight,
                                width: bounds.width,
                                height: max(0, bounds.height - activeHeight))
    } else {
      canvasView.frame = CGRect(x: 0, y: 0,
                                width: bounds.width,
                                height: max(0, bounds.height - activeHeight))
      toolbar?.frame = CGRect(x: 0,
                              y: bounds.height - activeHeight,
                              width: bounds.width,
                              height: activeHeight)
    }
    preparedHistoryCanvas?.frame = canvasView.frame

    layoutBaseline()
  }

  private func layoutBaseline() {
    if !showBaseline {
      baselineLayer?.removeFromSuperlayer()
      baselineLayer = nil
      return
    }
    let layer = baselineLayer ?? CAShapeLayer()
    let activeHeight: CGFloat = (showToolbar && toolbar != nil) ? toolbarHeight : 0
    let position = (toolbarPosition as String).lowercased()
    let canvasHeight = bounds.height - activeHeight
    let canvasTop: CGFloat = position == "top" ? activeHeight : 0
    // When the built-in toolbar is shown, anchor the baseline to the
    // canvas/toolbar boundary so the gap above icons equals the gap
    // below. Toggling baseline never moves icons. Without the toolbar,
    // honour the explicit `baselineOffsetFromBottom` knob.
    let y: CGFloat
    if showToolbar && toolbar != nil {
      y = position == "top" ? activeHeight : (bounds.height - activeHeight)
    } else {
      y = canvasTop + canvasHeight - baselineOffsetFromBottom
    }

    let path = UIBezierPath()
    path.move(to: CGPoint(x: 16, y: y))
    path.addLine(to: CGPoint(x: bounds.width - 16, y: y))
    layer.path = path.cgPath
    layer.strokeColor = baselineColor.cgColor
    layer.fillColor = nil
    // Driven by `baselineStyle`:
    //  - "solid"  → no dash pattern.
    //  - "dashed" → short on/off segments, square cap (default).
    //  - "dotted" → near-zero-length dashes with a round cap so each
    //    "dash" renders as a circle; auto-width is bumped slightly so
    //    the dots stay visible.
    //
    // `baselineWidth > 0` overrides the per-style auto width entirely.
    let autoWidth: CGFloat
    switch (baselineStyle as String).lowercased() {
    case "solid":
      layer.lineDashPattern = nil
      layer.lineCap = .butt
      autoWidth = 1
    case "dotted":
      layer.lineDashPattern = [0.01, 4] as [NSNumber]
      layer.lineCap = .round
      autoWidth = 1.5
    default: // "dashed" + any unrecognised value
      layer.lineDashPattern = [4, 4] as [NSNumber]
      layer.lineCap = .butt
      autoWidth = 1
    }
    layer.lineWidth = baselineWidth > 0 ? baselineWidth : autoWidth

    if baselineLayer == nil {
      self.layer.addSublayer(layer)
      baselineLayer = layer
    }
  }

  // MARK: - Toolbar

  private static let builtInIds: Set<String> = ["undo", "redo", "clear", "copy"]

  private static func defaultToolbarItems() -> [ToolbarItemModel] {
    return [
      ToolbarItemModel(id: "undo", icon: "undo", text: nil, tintColor: nil, accessibilityLabel: "Undo", disabled: false),
      ToolbarItemModel(id: "redo", icon: "redo", text: nil, tintColor: nil, accessibilityLabel: "Redo", disabled: false),
      ToolbarItemModel(id: "clear", icon: "clear", text: nil, tintColor: nil, accessibilityLabel: "Clear", disabled: false),
      ToolbarItemModel(id: "copy", icon: "copy", text: nil, tintColor: nil, accessibilityLabel: "Copy", disabled: false),
    ]
  }

  /// Convert a React-processed ARGB int (alpha in the high byte) to a
  /// `UIColor`. Uses 64-bit width so values > 0x7FFFFFFF don't overflow.
  private static func colorFromARGB(_ value: Int64) -> UIColor {
    let argb = UInt32(truncatingIfNeeded: value)
    let a = CGFloat((argb >> 24) & 0xFF) / 255.0
    let r = CGFloat((argb >> 16) & 0xFF) / 255.0
    let g = CGFloat((argb >> 8) & 0xFF) / 255.0
    let b = CGFloat(argb & 0xFF) / 255.0
    return UIColor(red: r, green: g, blue: b, alpha: a)
  }

  private static func parseToolbarItems(_ json: String) -> [ToolbarItemModel] {
    guard !json.isEmpty,
          let data = json.data(using: .utf8),
          let array = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
    else {
      return defaultToolbarItems()
    }
    var items: [ToolbarItemModel] = []
    for obj in array {
      guard let id = obj["id"] as? String, !id.isEmpty else { continue }
      let icon = obj["icon"] as? String
      let text = obj["text"] as? String
      var tint: UIColor?
      if let n = obj["tintColor"] as? NSNumber { tint = colorFromARGB(n.int64Value) }
      let label = (obj["accessibilityLabel"] as? String) ?? text ?? id
      let disabled = (obj["disabled"] as? Bool) ?? false
      items.append(ToolbarItemModel(id: id, icon: icon, text: text, tintColor: tint, accessibilityLabel: label, disabled: disabled))
    }
    return items.isEmpty ? defaultToolbarItems() : items
  }

  private func sfSymbolName(_ icon: String) -> String {
    switch icon {
    case "undo": return "arrow.uturn.backward"
    case "redo": return "arrow.uturn.forward"
    case "clear": return "trash"
    case "copy": return "doc.on.doc"
    case "save": return "square.and.arrow.down"
    case "share": return "square.and.arrow.up"
    case "download": return "arrow.down.circle"
    case "check": return "checkmark"
    default: return "questionmark"
    }
  }

  /// Build the bar for the given width, splitting items into an inline
  /// run plus an overflow ("…") menu. Pure-arithmetic capacity (uniform
  /// 44pt icon slot + measured intrinsic width for text) keeps it a
  /// single pass with no flicker.
  private func rebuildToolbarForWidth(_ totalWidth: CGFloat) {
    toolbar?.removeFromSuperview()
    toolbar = nil
    guard showToolbar else { return }

    let stack = UIStackView()
    stack.axis = .horizontal
    stack.alignment = .center
    stack.distribution = .fill
    stack.spacing = toolbarIconSpacing
    stack.layoutMargins = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    stack.isLayoutMarginsRelativeArrangement = true
    stack.layer.backgroundColor = (toolbarBackgroundColor ?? .clear).cgColor

    // Flexible leading spacer right-aligns the cluster (matches Android
    // `Gravity.END | CENTER_VERTICAL`).
    let spacer = UIView()
    spacer.translatesAutoresizingMaskIntoConstraints = false
    spacer.setContentHuggingPriority(.defaultLow - 1, for: .horizontal)
    spacer.setContentCompressionResistancePriority(.defaultLow - 1, for: .horizontal)
    stack.addArrangedSubview(spacer)

    // Build + measure every item once (off-screen via intrinsicContentSize).
    let built: [(view: UIButton, width: CGFloat)] = toolbarItems.map { item in
      let b = makeToolbarButton(item: item)
      let w = max(44, ceil(b.intrinsicContentSize.width))
      return (b, w)
    }

    let n = built.count
    let available = max(0, totalWidth - 32) // 16pt margin each side
    let spacing = toolbarIconSpacing

    // Conservative width estimate (over-counts one spacing for the spacer
    // gap, so we never push a button off-screen).
    func needed(_ count: Int, withOverflow: Bool) -> CGFloat {
      var sum: CGFloat = 0
      for i in 0..<count { sum += built[i].width }
      if withOverflow { sum += overflowButtonWidth }
      let views = count + (withOverflow ? 1 : 0)
      if views > 0 { sum += spacing * CGFloat(views) }
      return sum
    }

    var visibleCount = n
    var overflow = false
    let cap = toolbarMaxVisibleButtons
    let capLimited = cap > 0 && cap < n

    if available > 0 {
      if !capLimited && needed(n, withOverflow: false) <= available {
        visibleCount = n
      } else {
        overflow = true
        var k = 0
        while k < n && needed(k + 1, withOverflow: true) <= available { k += 1 }
        if cap > 0 { k = min(k, cap) }
        visibleCount = max(0, k)
      }
    } else if capLimited {
      // Width unknown yet: honor the explicit cap only.
      overflow = true
      visibleCount = cap
    }

    for i in 0..<visibleCount { stack.addArrangedSubview(built[i].view) }
    if overflow && visibleCount < n {
      let rest = Array(toolbarItems[visibleCount..<n])
      stack.addArrangedSubview(makeOverflowButton(items: rest))
    }

    addSubview(stack)
    toolbar = stack
  }

  private func makeToolbarButton(item: ToolbarItemModel) -> UIButton {
    let button = UIButton(type: .system)

    // Built-in items with neither icon nor text fall back to their
    // default icon (which shares the id's name).
    var iconName = item.icon
    if iconName == nil && item.text == nil && SignatureInkSurface.builtInIds.contains(item.id) {
      iconName = item.id
    }
    let hasText = (item.text?.isEmpty == false)

    if let iconName, #available(iOS 13.0, *) {
      let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .regular)
      button.setImage(UIImage(systemName: sfSymbolName(iconName), withConfiguration: config), for: .normal)
    }
    if hasText {
      button.setTitle(item.text, for: .normal)
      button.titleLabel?.font = .systemFont(ofSize: 15)
    }

    // Spacing/insets. `contentEdgeInsets`/`imageEdgeInsets` are the
    // broadly-supported path (iOS 13+); deprecation on iOS 15 is benign.
    if iconName != nil && hasText {
      let pad: CGFloat = 6
      button.imageEdgeInsets = UIEdgeInsets(top: 0, left: -pad / 2, bottom: 0, right: pad / 2)
      button.titleEdgeInsets = UIEdgeInsets(top: 0, left: pad / 2, bottom: 0, right: -pad / 2)
      button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 8 + pad / 2, bottom: 0, right: 8 + pad / 2)
    } else {
      button.contentEdgeInsets = UIEdgeInsets(top: 0, left: 8, bottom: 0, right: 8)
    }

    if let tint = item.tintColor ?? toolbarTintColor { button.tintColor = tint }
    button.isEnabled = !item.disabled
    button.alpha = item.disabled ? 0.4 : 1.0
    button.accessibilityLabel = item.accessibilityLabel
    button.accessibilityIdentifier = "signature-ink-\(item.id)"
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true

    let id = item.id
    let target = ToolbarButtonTarget(action: id) { [weak self] act in
      self?.handleToolbarAction(act)
    }
    button.addTarget(target, action: #selector(ToolbarButtonTarget.fire), for: .touchUpInside)
    objc_setAssociatedObject(
      button,
      &ToolbarButtonTarget.assocKey,
      target,
      .OBJC_ASSOCIATION_RETAIN_NONATOMIC
    )
    return button
  }

  /// The trailing "…" button. Taps open a native menu (iOS 14+) or an
  /// action sheet listing the collapsed items.
  private func makeOverflowButton(items: [ToolbarItemModel]) -> UIButton {
    let button = UIButton(type: .system)
    if #available(iOS 13.0, *) {
      let config = UIImage.SymbolConfiguration(pointSize: 15, weight: .regular)
      button.setImage(UIImage(systemName: "ellipsis", withConfiguration: config), for: .normal)
    } else {
      button.setTitle("…", for: .normal)
    }
    if let tint = toolbarTintColor { button.tintColor = tint }
    button.accessibilityLabel = "More"
    button.accessibilityIdentifier = "signature-ink-overflow"
    button.translatesAutoresizingMaskIntoConstraints = false
    button.widthAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true

    if #available(iOS 14.0, *) {
      let actions: [UIAction] = items.map { item in
        var image: UIImage?
        if let icon = item.icon ?? (SignatureInkSurface.builtInIds.contains(item.id) ? item.id : nil) {
          image = UIImage(systemName: sfSymbolName(icon))
        }
        return UIAction(
          title: item.accessibilityLabel,
          image: image,
          attributes: item.disabled ? [.disabled] : []
        ) { [weak self] _ in
          self?.handleToolbarAction(item.id)
        }
      }
      button.menu = UIMenu(title: "", children: actions)
      button.showsMenuAsPrimaryAction = true
    } else {
      let target = ToolbarButtonTarget(action: "") { [weak self] _ in
        self?.presentOverflowSheet(items: items)
      }
      button.addTarget(target, action: #selector(ToolbarButtonTarget.fire), for: .touchUpInside)
      objc_setAssociatedObject(button, &ToolbarButtonTarget.assocKey, target, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }
    return button
  }

  private func presentOverflowSheet(items: [ToolbarItemModel]) {
    let sheet = UIAlertController(title: nil, message: nil, preferredStyle: .actionSheet)
    for item in items where !item.disabled {
      sheet.addAction(UIAlertAction(title: item.accessibilityLabel, style: .default) { [weak self] _ in
        self?.handleToolbarAction(item.id)
      })
    }
    sheet.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    var responder: UIResponder? = self
    while let next = responder?.next {
      if let vc = next as? UIViewController { vc.present(sheet, animated: true); return }
      responder = next
    }
  }

  private func handleToolbarAction(_ id: String) {
    switch id {
    case "undo": undo()
    case "redo": redo()
    case "clear": clear()
    case "copy": copyToClipboard()
    default: break
    }
    onToolbarAction?(id)
  }

  // MARK: - Tool

  private func applyTool() {
    let width = max(penMinWidth, min(penMaxWidth, (penMinWidth + penMaxWidth) / 2))
    let ink = resolveInkType()
    let tool = PKInkingTool(ink, color: penColor, width: width)
    canvasView.tool = tool
    preparedHistoryCanvas?.tool = tool
  }

  private func resolveInkType() -> PKInkingTool.InkType {
    let raw = (defaultInkType as String).lowercased()
    if #available(iOS 17.0, *) {
      switch raw {
      case "pen": return .pen
      case "pencil": return .pencil
      case "marker": return .marker
      case "monoline": return .monoline
      case "fountainpen": return .fountainPen
      case "watercolor": return .watercolor
      case "crayon": return .crayon
      default: return .pen
      }
    }
    if #available(iOS 14.0, *) {
      switch raw {
      case "pencil": return .pencil
      case "marker": return .marker
      default: return .pen
      }
    }
    return .pen
  }

  // MARK: - Tool picker

  public override func didMoveToWindow() {
    super.didMoveToWindow()
    syncToolPicker()
  }

  private func syncToolPicker() {
    if showToolPicker, window != nil {
      attachToolPicker()
    } else {
      detachToolPicker()
    }
  }

  /// One process-wide picker. Per-instance `PKToolPicker()`s don't
  /// always surrender their system-side UI cleanly on canvas
  /// deallocation, so the picker can re-appear on a sibling surface.
  /// One persistent picker + explicit per-canvas visibility avoids that.
  private static var sharedToolPicker: PKToolPicker?

  private func obtainSharedToolPicker() -> PKToolPicker? {
    if let existing = Self.sharedToolPicker { return existing }
    if #available(iOS 14.0, *) {
      let picker = PKToolPicker()
      Self.sharedToolPicker = picker
      return picker
    }
    if let window = window, let shared = PKToolPicker.shared(for: window) {
      Self.sharedToolPicker = shared
      return shared
    }
    return nil
  }

  private func attachToolPicker() {
    guard !isToolPickerAttached, let picker = obtainSharedToolPicker() else {
      return
    }
    // Order matters: the canvas's built-in observer runs first and assigns
    // the picker's (trait-adaptive) tool to `canvasView.tool`. Our delegate
    // observer runs second and rewrites that tool with the colour resolved
    // against a fixed-light trait, so a "black" selection stays black even
    // when the host app is in dark mode.
    picker.addObserver(canvasView)
    picker.addObserver(canvasDelegate)
    picker.setVisible(true, forFirstResponder: canvasView)
    canvasView.becomeFirstResponder()
    toolPicker = picker
    isToolPickerAttached = true
    normalizeTool(from: picker)
  }

  private func detachToolPicker() {
    // Hide → unhook → resign, in that order. Run even when
    // `isToolPickerAttached` is false: the shared picker can be in a
    // half-attached state from a sibling surface.
    let picker = toolPicker ?? Self.sharedToolPicker
    if let picker = picker {
      picker.setVisible(false, forFirstResponder: canvasView)
      picker.removeObserver(canvasView)
      picker.removeObserver(canvasDelegate)
    }
    if canvasView.isFirstResponder {
      canvasView.resignFirstResponder()
    }
    let wasOurs = isToolPickerAttached
    toolPicker = nil
    isToolPickerAttached = false

    // `setVisible(false, …)` only schedules a fade. On iOS 14+ the
    // picker's system XPC UI keeps re-anchoring to whichever canvas
    // enters the window next until the `PKToolPicker` deallocates.
    // Drop the shared static when this surface owned it; leave it
    // alone otherwise (a sibling may still need it).
    if wasOurs {
      Self.sharedToolPicker = nil
    }
  }

  // MARK: - Internal change emit

  fileprivate func emitChange() {
    onChange?(canvasView.drawing.strokes.isEmpty,
              canvasView.drawing.strokes.count)
  }

  // MARK: - Commands

  @objc public func clear() {
    cancelReplay()
    eraseGestureStartDrawing = nil
    eraseGestureChanged = false
    if !canvasView.drawing.strokes.isEmpty {
      undoStack.append(canvasView.drawing)
      redoStack.removeAll()
    }
    resetCanvasWithDrawing(PKDrawing())
    emitChange()
  }

  @objc public func undo() {
    cancelReplay()
    guard !undoStack.isEmpty else { return }
    redoStack.append(canvasView.drawing)
    let previous = undoStack.removeLast()
    setDrawingSilently(previous)
    prepareHistoryCanvas(with: previous)
    emitChange()
  }

  @objc public func redo() {
    cancelReplay()
    guard !redoStack.isEmpty else { return }
    undoStack.append(canvasView.drawing)
    let next = redoStack.removeLast()
    setDrawingSilently(next)
    prepareHistoryCanvas(with: next)
    emitChange()
  }

  @objc public func copyToClipboard() {
    let scale = UIScreen.main.scale
    let img = renderImage(trim: true, scale: scale, opaque: false)
    UIPasteboard.general.image = img
  }

  @objc public func isEmptyAndReply(_ requestId: String) {
    let empty = canvasView.drawing.strokes.isEmpty
    onResult?(requestId, "isEmpty", empty ? "true" : "false", nil)
  }

  @objc public func toBase64(_ requestId: String,
                             format: String,
                             quality: CGFloat,
                             trim: Bool) {
    let fmt = format.lowercased()
    let isJpeg = fmt == "jpeg" || fmt == "jpg"
    let image = renderImage(trim: trim, scale: UIScreen.main.scale, opaque: isJpeg)
    let data: Data?
    if isJpeg {
      data = image.jpegData(compressionQuality: max(0, min(1, quality)))
    } else {
      data = image.pngData()
    }
    guard let bytes = data else {
      onResult?(requestId, "toBase64", nil, "Failed to encode image")
      return
    }
    onResult?(requestId, "toBase64", bytes.base64EncodedString(), nil)
  }

  @objc public func toFile(_ requestId: String,
                           format: String,
                           quality: CGFloat,
                           trim: Bool) {
    let fmt = format.lowercased()
    let isJpeg = fmt == "jpeg" || fmt == "jpg"
    let image = renderImage(trim: trim, scale: UIScreen.main.scale, opaque: isJpeg)
    let data: Data? = isJpeg
      ? image.jpegData(compressionQuality: max(0, min(1, quality)))
      : image.pngData()
    guard let bytes = data else {
      onResult?(requestId, "toFile", nil, "Failed to encode image")
      return
    }
    let ext = isJpeg ? "jpg" : "png"
    let filename = "signature-\(Int(Date().timeIntervalSince1970 * 1000)).\(ext)"
    let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(filename)
    do {
      try bytes.write(to: url, options: .atomic)
      onResult?(requestId, "toFile", url.absoluteString, nil)
    } catch {
      onResult?(requestId, "toFile", nil, error.localizedDescription)
    }
  }

  @objc public func toSvg(_ requestId: String) {
    onResult?(requestId, "toSvg", buildSvg(), nil)
  }

  @objc public func saveToPhotoLibrary(_ requestId: String,
                                       format: String,
                                       quality: CGFloat,
                                       trim: Bool) {
    let fmt = format.lowercased()
    let isJpeg = fmt == "jpeg" || fmt == "jpg"
    // Always composite onto a solid background — the Photos viewer
    // renders transparent PNGs against its own black chrome, so a
    // light-themed canvas would look inverted in the library.
    let image = renderImage(trim: trim, scale: UIScreen.main.scale, opaque: true)
    let encoded: Data? = isJpeg
      ? image.jpegData(compressionQuality: max(0, min(1, quality)))
      : image.pngData()
    // PhotosAddOnly was added in iOS 14; on older versions fall back to
    // the legacy ALAssetsLibrary-style API which uses the regular
    // PHPhotoLibrary authorization status.
    let onAuthorized: () -> Void = { [weak self] in
      guard let self = self else { return }
      PHPhotoLibrary.shared().performChanges({
        // Prefer encoded bytes so the saved asset matches the requested
        // format (HEIC default of `creationRequestForAsset(from:)`
        // would lose the user's PNG/JPEG choice). Fall back to the
        // image-based request if encoding failed for any reason.
        if let bytes = encoded {
          let request = PHAssetCreationRequest.forAsset()
          let options = PHAssetResourceCreationOptions()
          options.uniformTypeIdentifier = isJpeg ? "public.jpeg" : "public.png"
          request.addResource(with: .photo, data: bytes, options: options)
        } else {
          PHAssetCreationRequest.creationRequestForAsset(from: image)
        }
      }, completionHandler: { success, err in
        DispatchQueue.main.async {
          if success {
            let payload = self.jsonString(["granted": true])
            self.onResult?(requestId, "saveToPhotoLibrary", payload, nil)
          } else {
            self.onResult?(requestId,
                           "saveToPhotoLibrary",
                           nil,
                           err?.localizedDescription ?? "PHPhotoLibrary write failed")
          }
        }
      })
    }
    let onDenied: () -> Void = { [weak self] in
      guard let self = self else { return }
      let payload = self.jsonString(["granted": false])
      self.onResult?(requestId, "saveToPhotoLibrary", payload, nil)
    }

    if #available(iOS 14.0, *) {
      let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
      switch status {
      case .authorized, .limited:
        onAuthorized()
      case .denied, .restricted:
        onDenied()
      case .notDetermined:
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { new in
          DispatchQueue.main.async {
            switch new {
            case .authorized, .limited: onAuthorized()
            default: onDenied()
            }
          }
        }
      @unknown default:
        onDenied()
      }
    } else {
      let status = PHPhotoLibrary.authorizationStatus()
      switch status {
      case .authorized:
        onAuthorized()
      case .denied, .restricted:
        onDenied()
      case .notDetermined:
        PHPhotoLibrary.requestAuthorization { new in
          DispatchQueue.main.async {
            if new == .authorized { onAuthorized() } else { onDenied() }
          }
        }
      @unknown default:
        onDenied()
      }
    }
  }

  private func jsonString(_ obj: [String: Any]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
       let json = String(data: data, encoding: .utf8) {
      return json
    }
    return "{}"
  }

  @objc public func getStrokeData(_ requestId: String) {
    let json = Self.buildStrokeDataJson(
      from: canvasView.drawing,
      fallbackMinWidth: penMinWidth,
      fallbackMaxWidth: penMaxWidth
    )
    onResult?(requestId, "getStrokeData", json, nil)
  }

  @objc public func setStrokeData(_ json: String) {
    cancelReplay()
    guard let drawing = drawingFromStrokeDataJson(json) else { return }
    if !canvasView.drawing.strokes.isEmpty {
      undoStack.append(canvasView.drawing)
      redoStack.removeAll()
    }
    resetCanvasWithDrawing(drawing)
    emitChange()
  }

  /// Replace drawing without pushing onto undo, then clear history.
  /// Used for Save/Back so discarded ink cannot resurrect via Undo.
  @objc public func replaceStrokeData(_ json: String) {
    cancelReplay()
    guard let drawing = drawingFromStrokeDataJson(json) else { return }
    resetCanvasWithDrawing(drawing)
    clearHistory()
    emitChange()
  }

  /// Clear undo/redo without changing the visible drawing.
  @objc public func clearHistory() {
    undoStack.removeAll()
    redoStack.removeAll()
    eraseGestureStartDrawing = nil
    eraseGestureChanged = false
  }

  /// Capture one pre-drag drawing so all removals share one undo action.
  @objc public func beginEraseGesture() {
    cancelReplay()
    guard snapshotBeforeStroke == nil, eraseGestureStartDrawing == nil else { return }
    eraseGestureStartDrawing = canvasView.drawing
    eraseGestureChanged = false
  }

  /// Atomic stroke JSON + file export from one immutable revision.
  @objc public func snapshot(_ requestId: String,
                             format: String,
                             quality: CGFloat,
                             trim: Bool) {
    guard snapshotBeforeStroke == nil, eraseGestureStartDrawing == nil else {
      onResult?(requestId, "snapshot", nil, "Finish the active Ink gesture before saving.")
      return
    }
    snapshotGeneration += 1
    let generation = snapshotGeneration
    let drawing = canvasView.drawing
    let canvasSize = canvasView.bounds.size
    let backgroundColor = inkBackgroundColor
    let fallbackMinWidth = penMinWidth
    let fallbackMaxWidth = penMaxWidth
    let scale = UIScreen.main.scale

    Self.snapshotQueue.async { [weak self] in
      autoreleasepool {
        let strokesJson = Self.buildStrokeDataJson(
          from: drawing,
          fallbackMinWidth: fallbackMinWidth,
          fallbackMaxWidth: fallbackMaxWidth
        )
        guard let strokesData = strokesJson.data(using: .utf8),
              let strokesObj = try? JSONSerialization.jsonObject(with: strokesData) else {
          DispatchQueue.main.async {
            guard let self, self.snapshotGeneration == generation else { return }
            self.onResult?(requestId, "snapshot", nil, "Failed to serialize strokes")
          }
          return
        }

        let isJpeg = ["jpeg", "jpg"].contains(format.lowercased())
        let image = Self.renderImage(
          drawing: drawing,
          canvasSize: canvasSize,
          trim: trim,
          scale: scale,
          opaque: isJpeg,
          backgroundColor: backgroundColor
        )
        let bytes = isJpeg
          ? image.jpegData(compressionQuality: max(0, min(1, quality)))
          : image.pngData()
        guard let bytes else {
          DispatchQueue.main.async {
            guard let self, self.snapshotGeneration == generation else { return }
            self.onResult?(requestId, "snapshot", nil, "Failed to encode image")
          }
          return
        }

        let ext = isJpeg ? "jpg" : "png"
        let filename = "signature-\(UUID().uuidString).\(ext)"
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(filename)
        do {
          try bytes.write(to: url, options: .atomic)
          let payloadObj: [String: Any] = [
            "strokes": strokesObj,
            "fileUri": url.absoluteString,
            "canvasWidth": Double(canvasSize.width),
            "canvasHeight": Double(canvasSize.height),
          ]
          let payloadData = try JSONSerialization.data(withJSONObject: payloadObj, options: [])
          guard let payload = String(data: payloadData, encoding: .utf8) else {
            throw NSError(
              domain: "SignatureInk",
              code: 1,
              userInfo: [NSLocalizedDescriptionKey: "Failed to build snapshot payload"]
            )
          }
          DispatchQueue.main.async {
            guard let self, self.snapshotGeneration == generation else {
              try? FileManager.default.removeItem(at: url)
              return
            }
            self.onResult?(requestId, "snapshot", payload, nil)
          }
        } catch {
          try? FileManager.default.removeItem(at: url)
          DispatchQueue.main.async {
            guard let self, self.snapshotGeneration == generation else { return }
            self.onResult?(requestId, "snapshot", nil, error.localizedDescription)
          }
        }
      }
    }
  }

  /// Hit-test and remove at most one stroke near `(x, y)` within `radius`
  /// (points). One drag is one undo transaction. Uses silent drawing
  /// swap + history canvas warm-up to avoid full canvas rebuild flicker.
  @objc public func eraseStrokeNear(_ x: CGFloat, y: CGFloat, radius: CGFloat) {
    cancelReplay()
    let drawing = canvasView.drawing
    guard !drawing.strokes.isEmpty else { return }
    let standaloneGesture = eraseGestureStartDrawing == nil
    if standaloneGesture { beginEraseGesture() }
    let target = CGPoint(x: x, y: y)
    var bestIndex: Int?
    var bestDistanceSquared = radius * radius

    for (idx, stroke) in drawing.strokes.enumerated() {
      // Avoid allocating interpolated points for every unrelated stroke on
      // every responder move; only refine paths whose render bounds are near.
      let candidateBounds = stroke.renderBounds.insetBy(dx: -radius, dy: -radius)
      guard candidateBounds.contains(target) else { continue }
      let path = stroke.path
      for i in 0..<path.count {
        let loc = path[i].location
        let dx = loc.x - target.x
        let dy = loc.y - target.y
        let distanceSquared = dx * dx + dy * dy
        if distanceSquared <= bestDistanceSquared {
          bestDistanceSquared = distanceSquared
          bestIndex = idx
        }
      }
      let interpolated = path.interpolatedPoints(by: .distance(2.0))
      for point in interpolated {
        let loc = point.location
        let dx = loc.x - target.x
        let dy = loc.y - target.y
        let distanceSquared = dx * dx + dy * dy
        if distanceSquared <= bestDistanceSquared {
          bestDistanceSquared = distanceSquared
          bestIndex = idx
        }
      }
    }

    guard let index = bestIndex else {
      if standaloneGesture { endEraseGesture() }
      return
    }

    var newStrokes = Array(drawing.strokes)
    newStrokes.remove(at: index)
    let newDrawing = PKDrawing(strokes: newStrokes)
    setDrawingSilently(newDrawing)
    prepareHistoryCanvas(with: newDrawing)
    eraseGestureChanged = true
    emitChange()
    if standaloneGesture { endEraseGesture() }
  }

  /// Finalize the eraser drag as one reversible history transaction.
  @objc public func endEraseGesture() {
    guard let before = eraseGestureStartDrawing else { return }
    if eraseGestureChanged {
      undoStack.append(before)
      redoStack.removeAll()
    }
    eraseGestureStartDrawing = nil
    eraseGestureChanged = false
  }

  @objc public func replay(speed: CGFloat) {
    let final = canvasView.drawing
    guard !final.strokes.isEmpty else { return }
    cancelReplay()
    replayFinalDrawing = final
    replaySpeed = max(0.05, speed)
    // Pace the animation by total control-point count (like the Android
    // side). ~4ms per point feels close to natural writing speed; clamp to
    // 0.5s minimum so a tiny signature still gets a visible animation.
    let totalPoints = max(1, final.strokes.reduce(0) { $0 + $1.path.count })
    let baseDuration = max(0.5, Double(totalPoints) * 0.004)
    replayTotalDuration = baseDuration / Double(replaySpeed)
    replayStartTime = CACurrentMediaTime()
    setDrawingSilently(PKDrawing())
    let proxy = DisplayLinkProxy(owner: self)
    let link = CADisplayLink(target: proxy,
                             selector: #selector(DisplayLinkProxy.tick))
    link.add(to: .main, forMode: .common)
    replayProxy = proxy
    replayLink = link
  }

  /// Forwarding entry point used by `DisplayLinkProxy` so we can keep the
  /// real implementation file-private.
  internal func _replayTick() { tickReplay() }

  @objc private func tickReplay() {
    let now = CACurrentMediaTime()
    let progress = min(1.0, (now - replayStartTime) / replayTotalDuration)
    let strokes = replayFinalDrawing.strokes
    let totalPoints = strokes.reduce(0) { $0 + $1.path.count }
    let targetPoints = max(1, Int(Double(totalPoints) * progress))

    var taken = 0
    var partial: [PKStroke] = []
    partial.reserveCapacity(strokes.count)
    for orig in strokes {
      if taken >= targetPoints { break }
      let strokePointCount = orig.path.count
      let take = min(strokePointCount, targetPoints - taken)
      taken += take
      // `PKStrokePath` is a Catmull-Rom spline that needs at least a couple
      // of control points to render anything meaningful. Skipping strokes
      // with `take < 2` simply means they appear one frame later — the
      // animation still looks continuous because control points arrive at
      // 60–120Hz.
      guard take >= 2 else { continue }
      var truncated: [PKStrokePoint] = []
      truncated.reserveCapacity(take)
      for i in 0..<take {
        truncated.append(orig.path[i])
      }
      let truncatedPath = PKStrokePath(
        controlPoints: truncated,
        creationDate: orig.path.creationDate
      )
      let stroke = PKStroke(
        ink: orig.ink,
        path: truncatedPath,
        transform: orig.transform,
        mask: orig.mask
      )
      partial.append(stroke)
    }

    setDrawingSilently(PKDrawing(strokes: partial))
    onReplayProgress?(CGFloat(progress))

    if progress >= 1.0 {
      setDrawingSilently(replayFinalDrawing)
      cancelReplay()
    }
  }

  private func cancelReplay() {
    let wasReplaying = replayLink != nil
    replayLink?.invalidate()
    replayLink = nil
    replayProxy = nil
    if wasReplaying {
      setDrawingSilently(replayFinalDrawing)
    }
  }

  // MARK: - Rendering helpers

  private func renderImage(trim: Bool, scale: CGFloat, opaque: Bool) -> UIImage {
    return Self.renderImage(
      drawing: canvasView.drawing,
      canvasSize: canvasView.bounds.size,
      trim: trim,
      scale: scale,
      opaque: opaque,
      backgroundColor: inkBackgroundColor
    )
  }

  /**
   * Pure snapshot renderer: all inputs are immutable values captured on main,
   * so PNG/JPEG work can run on the dedicated snapshot queue without touching
   * PKCanvasView or any recycled Fabric surface state.
   */
  private static func renderImage(
    drawing: PKDrawing,
    canvasSize: CGSize,
    trim: Bool,
    scale: CGFloat,
    opaque: Bool,
    backgroundColor: UIColor
  ) -> UIImage {
    let drawingBounds = drawing.bounds
    let canvasRect = CGRect(origin: .zero, size: canvasSize)
    let rect: CGRect
    if trim && !drawing.strokes.isEmpty && !drawingBounds.isNull && !drawingBounds.isEmpty {
      rect = drawingBounds.insetBy(dx: -2, dy: -2)
    } else {
      rect = canvasRect.isEmpty ? CGRect(x: 0, y: 0, width: 1, height: 1) : canvasRect
    }
    // The on-screen canvas pins itself to `.light` via
    // `overrideUserInterfaceStyle`, but `PKDrawing.image(from:scale:)`
    // resolves ink against the current trait collection at call time
    // — black would render near-white in dark mode. Force light traits
    // so exports match what the user saw on screen.
    var img: UIImage = UIImage()
    let lightTraits = UITraitCollection(userInterfaceStyle: .light)
    lightTraits.performAsCurrent {
      img = drawing.image(from: rect, scale: scale)
    }
    if opaque {
      return drawOnBackground(
        img,
        color: backgroundColor.cgColor.alpha == 0 ? .white : backgroundColor
      )
    }
    return img
  }

  private static func drawOnBackground(_ image: UIImage, color: UIColor) -> UIImage {
    let size = image.size
    let renderer = UIGraphicsImageRenderer(size: size,
                                           format: UIGraphicsImageRendererFormat.preferred())
    return renderer.image { ctx in
      color.setFill()
      ctx.fill(CGRect(origin: .zero, size: size))
      image.draw(at: .zero)
    }
  }

  private func setDrawingSilently(_ drawing: PKDrawing) {
    suppressChangeEvents = true
    canvasView.drawing = drawing
    suppressChangeEvents = false
  }

  /// Builds the baseline-correct PKCanvasView without disturbing the visible
  /// one. A tiny non-zero alpha keeps its PencilKit layers eligible for
  /// compositor preparation while remaining visually imperceptible.
  private func prepareHistoryCanvas(with drawing: PKDrawing) {
    preparedHistoryCanvas?.removeFromSuperview()

    let fresh = Self.makeCanvasView()
    fresh.drawing = drawing
    fresh.delegate = canvasDelegate
    fresh.isUserInteractionEnabled = false
    fresh.accessibilityElementsHidden = true
    fresh.alpha = 0.001
    if #available(iOS 14.0, *) {
      fresh.drawingPolicy = pencilOnly ? .pencilOnly : .anyInput
    }

    insertSubview(fresh, belowSubview: canvasView)
    preparedHistoryCanvas = fresh
    applyTool()
    setNeedsLayout()
    layoutIfNeeded()
    fresh.layer.setNeedsDisplay()
  }

  /// Atomically hands touch ownership to the warmed replacement. The outgoing
  /// canvas already displays the same PKDrawing, so this changes PencilKit's
  /// hidden baseline without changing the pixels the user sees.
  private func promotePreparedHistoryCanvas() {
    guard let fresh = preparedHistoryCanvas else { return }
    let stale = canvasView

    stale.delegate = nil
    canvasView = fresh
    preparedHistoryCanvas = nil
    fresh.alpha = 1
    fresh.isUserInteractionEnabled = true
    fresh.accessibilityElementsHidden = false
    applyTool()
    stale.removeFromSuperview()
  }

  /// Rebuild the `PKCanvasView` carrying the supplied drawing. Used by
  /// external replacements (clear and setStrokeData) because
  /// PencilKit keeps an internal "stroke baseline" alongside `.drawing`
  /// — reassigning `.drawing` to fewer strokes lets the next touch
  /// resurrect removed strokes off that lingering baseline. Replay
  /// frames are exempt: they only grow the drawing, so the cheaper
  /// `setDrawingSilently` is safe.
  private func resetCanvasWithDrawing(_ drawing: PKDrawing) {
    preparedHistoryCanvas?.removeFromSuperview()
    preparedHistoryCanvas = nil
    let wasPickerAttached = isToolPickerAttached
    // Soft-detach: hide for the old canvas and unhook observers, but
    // keep the shared static picker alive. A full detach would force
    // the system to tear down and rebuild its picker UI on every
    // undo/redo — a very visible flicker.
    if wasPickerAttached, let picker = toolPicker {
      picker.setVisible(false, forFirstResponder: canvasView)
      picker.removeObserver(canvasView)
      picker.removeObserver(canvasDelegate)
      if canvasView.isFirstResponder {
        canvasView.resignFirstResponder()
      }
      toolPicker = nil
      isToolPickerAttached = false
    }

    let stale = canvasView
    stale.delegate = nil
    stale.removeFromSuperview()

    let fresh = Self.makeCanvasView()
    fresh.drawing = drawing
    fresh.delegate = canvasDelegate
    if #available(iOS 14.0, *) {
      fresh.drawingPolicy = pencilOnly ? .pencilOnly : .anyInput
    }
    canvasView = fresh
    insertSubview(fresh, at: 0)
    applyTool()

    snapshotBeforeStroke = nil

    setNeedsLayout()
    layoutIfNeeded()

    if wasPickerAttached {
      attachToolPicker()
    }
  }

  // MARK: - SVG

  private func buildSvg() -> String {
    let drawing = canvasView.drawing
    let bounds = drawing.bounds.isNull
      ? CGRect(origin: .zero, size: canvasView.bounds.size)
      : drawing.bounds.insetBy(dx: -2, dy: -2)

    var bodies: [String] = []
    for stroke in drawing.strokes {
      let inkColor = uiColorFromUIColor(stroke.ink.color)
      let hex = Self.hexString(from: inkColor)
      let pathPoints = stroke.path.interpolatedPoints(by: .distance(2.0))
      var d = ""
      var first = true
      var widthAccum: CGFloat = 0
      var widthCount: Int = 0
      for point in pathPoints {
        let p = point.location
        if first {
          d += String(format: "M%.2f,%.2f", p.x, p.y)
          first = false
        } else {
          d += String(format: " L%.2f,%.2f", p.x, p.y)
        }
        widthAccum += point.size.width
        widthCount += 1
      }
      if first { continue }
      let avgWidth = widthCount > 0 ? widthAccum / CGFloat(widthCount) : penMaxWidth
      bodies.append(
        "<path d=\"\(d)\" stroke=\"\(hex)\" stroke-width=\"\(String(format: "%.2f", avgWidth))\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>"
      )
    }

    let viewBox = String(format: "%.2f %.2f %.2f %.2f",
                         bounds.minX, bounds.minY, max(1, bounds.width), max(1, bounds.height))
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"\(viewBox)\" width=\"\(Int(max(1, bounds.width)))\" height=\"\(Int(max(1, bounds.height)))\">\(bodies.joined())</svg>"
  }

  private func uiColorFromUIColor(_ color: UIColor) -> UIColor { color }

  private static func hexString(from color: UIColor) -> String {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    color.getRed(&r, green: &g, blue: &b, alpha: &a)
    return String(format: "#%02X%02X%02X",
                  Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
  }

  // MARK: - Stroke data JSON

  private static func buildStrokeDataJson(
    from drawing: PKDrawing,
    fallbackMinWidth: CGFloat,
    fallbackMaxWidth: CGFloat
  ) -> String {
    // soies fork: emit per-stroke color/width so multi-color drawings round-trip.
    var strokes: [[String: Any]] = []
    for stroke in drawing.strokes {
      var points: [[String: Any]] = []
      // Serialize the path's actual control points (not parametric-step
      // interpolated samples). Using interpolated samples inflated the
      // control-point count ~20× per stroke, which (1) made setStrokeData
      // rebuild the stroke at uniform `penMaxWidth` because we lost the
      // per-point size and (2) caused replay() to run in slow motion
      // because its duration scales with total control-point count.
      let path = stroke.path
      var minimumWidth = CGFloat.greatestFiniteMagnitude
      var maximumWidth: CGFloat = 0
      for i in 0..<path.count {
        let point = path[i]
        points.append([
          "x": Double(point.location.x),
          "y": Double(point.location.y),
          "t": Double(point.timeOffset * 1_000),
          "pressure": Double(point.force),
          "size": Double(point.size.width),
          "azimuth": Double(point.azimuth),
          "altitude": Double(point.altitude),
        ])
        minimumWidth = min(minimumWidth, point.size.width)
        maximumWidth = max(maximumWidth, point.size.width)
      }
      let strokeMinWidth = minimumWidth.isFinite ? minimumWidth : fallbackMinWidth
      let strokeMaxWidth = maximumWidth > 0 ? maximumWidth : fallbackMaxWidth
      strokes.append([
        "color": Self.hexString(from: stroke.ink.color),
        "minWidth": Double(strokeMinWidth),
        "maxWidth": Double(strokeMaxWidth),
        "points": points,
      ])
    }
    guard let data = try? JSONSerialization.data(withJSONObject: strokes, options: []),
          let json = String(data: data, encoding: .utf8) else {
      return "[]"
    }
    return json
  }

  private func drawingFromStrokeDataJson(_ json: String) -> PKDrawing? {
    guard let data = json.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data, options: []),
          let strokes = parsed as? [Any] else {
      return nil
    }

    var pkStrokes: [PKStroke] = []
    let now = Date()
    for entry in strokes {
      // Accept both legacy StrokePoint[][] and enriched { color, points } objects.
      let points: [[String: Any]]
      var strokeColor = penColor
      var strokeMaxWidth = penMaxWidth
      if let obj = entry as? [String: Any] {
        if let hex = obj["color"] as? String, let parsedColor = colorFromHex(hex) {
          strokeColor = parsedColor
        }
        if let maxW = obj["maxWidth"] as? Double {
          strokeMaxWidth = CGFloat(maxW)
        }
        guard let pts = obj["points"] as? [[String: Any]] else { continue }
        points = pts
      } else if let pts = entry as? [[String: Any]] {
        points = pts
      } else {
        continue
      }

      let ink = PKInk(resolveInkType(), color: strokeColor)
      var controlPoints: [PKStrokePoint] = []
      for p in points {
        let x = (p["x"] as? Double) ?? 0
        let y = (p["y"] as? Double) ?? 0
        let tMilliseconds = (p["t"] as? Double) ?? 0
        let pressure = (p["pressure"] as? Double) ?? 1.0
        let azimuth = (p["azimuth"] as? Double) ?? 0
        let altitude = (p["altitude"] as? Double) ?? 0
        // Honour the per-point width that was captured. Falling back to
        // stroke/pen max width for legacy/foreign payloads avoids re-rendering
        // the whole stroke at uniform max width.
        let widthValue = (p["size"] as? Double) ?? Double(strokeMaxWidth)
        let size = CGSize(width: widthValue, height: widthValue)
        let sp = PKStrokePoint(location: CGPoint(x: x, y: y),
                               timeOffset: tMilliseconds / 1_000,
                               size: size,
                               opacity: 1.0,
                               force: CGFloat(pressure),
                               azimuth: CGFloat(azimuth),
                               altitude: CGFloat(altitude))
        controlPoints.append(sp)
      }
      guard !controlPoints.isEmpty else { continue }
      let path = PKStrokePath(controlPoints: controlPoints, creationDate: now)
      let stroke = PKStroke(ink: ink, path: path)
      pkStrokes.append(stroke)
    }
    return PKDrawing(strokes: pkStrokes)
  }

  private func colorFromHex(_ hex: String) -> UIColor? {
    var cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    if cleaned.hasPrefix("#") { cleaned.removeFirst() }
    guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
    let r = CGFloat((value & 0xFF0000) >> 16) / 255.0
    let g = CGFloat((value & 0x00FF00) >> 8) / 255.0
    let b = CGFloat(value & 0x0000FF) / 255.0
    return UIColor(red: r, green: g, blue: b, alpha: 1.0)
  }
}

// MARK: - Display link proxy
//
// `CADisplayLink` *strongly* retains its target. If we passed the surface
// directly we'd build a retain cycle and the surface would survive its
// React owner being unmounted — see `replay(speed:)`.

private final class DisplayLinkProxy: NSObject {
  weak var owner: SignatureInkSurface?
  init(owner: SignatureInkSurface) { self.owner = owner }
  @objc func tick() { owner?._replayTick() }
}

// MARK: - Toolbar button target

private final class ToolbarButtonTarget: NSObject {
  static var assocKey: UInt8 = 0
  let action: String
  let handler: (String) -> Void
  init(action: String, handler: @escaping (String) -> Void) {
    self.action = action
    self.handler = handler
  }
  @objc func fire() { handler(action) }
}

// MARK: - PKCanvasViewDelegate (extracted)
//
// `SignatureInkSurface` itself is `@objc public` so its declaration ends up
// in the auto-generated `SignatureInk-Swift.h`. That header does NOT import
// PencilKit, so any reference to `PKCanvasViewDelegate` on the surface class
// (even via a Swift extension) breaks the build. We keep the delegate
// conformance on a separate private NSObject helper that never appears in
// the generated header, and forward callbacks back to the surface.

private final class SignatureInkCanvasDelegate: NSObject, PKCanvasViewDelegate, PKToolPickerObserver {
  weak var owner: SignatureInkSurface?

  func canvasViewDidBeginUsingTool(_ canvasView: PKCanvasView) {
    owner?.handleCanvasDidBeginUsingTool()
  }

  func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
    owner?.handleCanvasDidEndUsingTool()
  }

  func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
    owner?.handleCanvasDrawingDidChange()
  }

  // Fires whenever the user picks a different tool/color in the system
  // tool picker. We forward to the owner so it can re-resolve the tool's
  // trait-adaptive color against a light trait collection — otherwise a
  // "black" pick renders white on a dark-mode device.
  func toolPickerSelectedToolDidChange(_ toolPicker: PKToolPicker) {
    owner?.normalizeTool(from: toolPicker)
  }
}
