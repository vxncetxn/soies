# Styling token exceptions

Every app-owned color or font literal outside `src/styles` needs an ID from this
table beside the code. `permanent-mirror` means the target environment cannot
import the TypeScript catalog; `needs-design` means the literal is centralized
and safe but its visual choice is provisional. Vendored library internals,
decorative vendor assets, and the archived `temp/` Astro prototype (which is not
part of the Expo application build) are excluded.

| ID | Status | Owner / source | Literal values | Canonical token | Appearance | Removal condition | Validation |
|---|---|---|---|---|---|---|---|
| STX-001 | permanent-mirror | UIKit `PaperTextInputView` startup state | ABC Stefan PostScript name; `#0C0A09`; `#79716B`; 16/22.4, 20/28, 24/33.6 | `fixedTokens.artefact` | Fixed | Native view can consume the catalog before its first frame | Native contract test compares Swift defaults with TypeScript |
| STX-002 | permanent-mirror | Serialized `FeaturedArtefactWidgetLayout` | `#EEEEEE`/`#44403B`; `#282421`/`#F8F5F1`; SwiftUI 20 semibold/body medium | `fixedTokens.widget` | Widget environment light/dark | Expo Widgets can serialize imported constants | Source contract test compares the isolated function with TypeScript |
| STX-003 | permanent-mirror | Generated Android startup resources | splash `#FFFFFF`; primary `#023C69` | `fixedTokens.bootstrap` | Bootstrap resource variants | Expo config can generate both values from a shared source | Token contract plus CNG output spot-check after prebuild |
| STX-004 | needs-design | Missing dark Chrome roles | Dark surface/content/border values in `darkTheme` | Matching semantic theme roles | Adaptive | Design approves every derived pair | Theme-shape and contrast contracts |
| STX-005 | needs-design | Artefact Type markers | Paper `#E4DF00`; calendar Print `#F32DD5`; unknown `#99938E`; Create Print `#E879F9` | `fixedTokens.artefactType` | Fixed | One approved marker vocabulary replaces the provisional variants | Literal scanner and visual matrix |
| STX-006 | needs-design | Error and warning states | Existing red/amber/error-fallback palette | `theme.colors.status` | Adaptive | Design approves light/dark status roles | Literal scanner and light/dark visual matrix |
