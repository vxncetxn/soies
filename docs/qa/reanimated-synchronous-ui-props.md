# Reanimated synchronous UI-prop regression matrix

This matrix validates the compile-time
`ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` and
`IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` flags. Reanimated's
[feature-flag guidance](https://docs.swmansion.com/react-native-reanimated/docs/guides/feature-flags/)
calls out two relevant risks: animated transforms can move visuals without
moving React Native's touch geometry, and synchronous native updates can be
briefly inconsistent with a later ShadowTree commit.

Do not treat a Metro reload as a flag change. Install a freshly rebuilt native
app on each platform before running that platform's column. Prefer at least one
physical-device pass because touch-target errors are the primary risk.

Status values: `Not run`, `Pass`, or `Fail — <video/notes>`.

| Priority | Flow | Regression actions and expected result | iOS | Android |
|----------|------|----------------------------------------|-----|---------|
| Critical | Create Bloom menu | Open the Create launcher, tap Paper and Print once while the panel is moving and once after it settles, dismiss by tapping the backdrop during opening, then reopen quickly. Every visible target must receive the tap at its painted position; no invisible or stale target may fire. | Not run | Not run |
| Critical | Create Print keyboard pin | Create a Print, tap both its photo area and caption as the card pins above the keyboard, type, interactively dismiss the keyboard, and refocus during and after the return spring. The visible card and caption must own the touch target throughout; focus and the keyboard must not flash-dismiss. | Not run | Not run |
| Critical | Native bottom sheets | Exercise Calendar, Share, and (on iOS) Featured Artefacts. For each, open, partially drag and release, use its buttons/rows while moving and after settling, then close by every supported path (button, backdrop, drag, and hardware Back on Android). Controls must respond at their visible positions and the sheet must remain draggable. | Not run | Not run |
| High | Stack expansion and horizontal paging | For one Paper Entry and one Print Entry, expand, swipe between Artefacts, long-press and drag the horizontal scrubber, collapse, and immediately use the collapsed deck and ellipsis. Repeat rapid expand/collapse reversals. Paging, controls, and later touches must remain responsive with no retained overlay. | Not run | Not run |
| High | Focus overlay and actions | Open Focus by both deck long-press and ellipsis for Paper and Print. Tap backdrop and each implemented menu path during and after the entrance; open Share and Featured Artefacts from Focus where available. The clone/menu must not jump, flicker, or leave displaced/ghost hit targets. | Not run | Not run |
| High | Home vertical pager and scrubber | Swipe across several Entries, then long-press and drag the vertical scrubber in both directions. Immediately tap the visible deck, ellipsis, and Calendar trigger after settling. The Entry, title carousel, previews, and indicator must agree on the active page. | Not run | Not run |
| High | Create Paper authoring | Focus the title and Paper body, enter and exit Type, page between Artefacts, enter and exit Scribble, and use the keyboard toolbar. Repeat a focus or mode change before the preceding motion settles. Inputs must retain focus when intended, controls must not overlap, and the visible page must remain interactive. | Not run | Not run |
| Medium | Visual commit consistency | During Home paging, Stack paging, Focus, Bloom, keyboard pinning, and sheet motion, watch for one-frame snaps in opacity, transform, shadow, border radius, z-order, or edge fades—especially at the end of motion when React commits state. | Not run | Not run |
| Medium | Reduced Motion | Enable the OS Reduce Motion preference and repeat Create, Stack, Focus, and sheet open/close paths. Immediate endpoints must still expose the correct touch targets and all completion-driven teardown must finish. | Not run | Not run |

If a row fails, capture the platform, simulator/device model, action timing
(during motion or after settle), and a screen recording. Leave the changes
uncommitted until every required platform column is either `Pass` or has an
explicitly accepted exception.
