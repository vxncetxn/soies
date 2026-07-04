---
name: commenting
description: Write detailed, comprehensive code comments that explain why code exists, how it fits its system, and the pitfalls it avoids — the style used in src/components/BloomButton.tsx, DayPager.tsx, and FocusOverlay.tsx. Use when adding or updating comments in source files (especially React/React Native components), when writing a new component that needs a header docblock, when refactoring and comments may have gone stale, or when the user asks for "detailed" / "comprehensive" comments or comments "like BloomButton".
---

# Commenting

Comments here teach a future developer who knows React Native but **not this file**. They explain _why_ and _how it fits_ — not _what_ (the code already says that). The bar is `BloomButton.tsx`, `DayPager.tsx`, `FocusOverlay.tsx`: a new dev can read the file top-to-bottom and understand the component's role, its relationships, and every non-obvious decision without opening another file.

For annotated before/after examples from those three files, read [COMMENT-PATTERNS.md](./COMMENT-PATTERNS.md). Treat those three source files as the canonical exemplars — when in doubt, match them.

## Core principles

1. **Explain why, not what.** `// Increment count` is noise. `// Dispatch updater so we compare against the latest size (avoids a stale-closure re-render)` earns its line.
2. **Explain relationships and ownership.** Who writes this value, who reads it, which thread it lives on, which sibling component it coordinates with. e.g. _"Owned upstream so the same worklet writes the parent's shared value directly."_
3. **Explain the pitfall the code prevents.** The best comments record a bug that _would_ happen without this line — the close "jump", the divide-by-zero before the pager has a height, the squarish border radius from anisotropic scale, the mid-animation re-render. Future devs won't re-derive these.
4. **Explain invariants and magic numbers.** Sentinels (`0 means "not measured yet"`), spring tuning (`overshootClamping keeps the clone from bouncing past rest`), and _why_ a slice is `[0, 0.01]` not `[0, 0.2]`.
5. **Name the visual intent for animations.** The spring's feel, the interpolation slices, what the user sees at each phase ("the trigger cross-fades out… the panel background snaps in so the morphing shape is visible from frame one… the content fades in and grows alongside the panel").
6. **Mark placeholders explicitly.** _"Currently wired to a no-op — this is a UI/interaction prototype; the actions aren't implemented yet."_ so nobody mistakes it for finished.
7. **Don't comment the obvious.** Imports, trivial returns, and self-describing NativeWind classes don't need prose. Spend the tokens on the non-obvious.

## Where comments go (every non-trivial file)

| Location                                      | What it explains                                                                                                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **File header `/** … \*/`\*\*                 | Identity, structure, the key architectural choice + the bug it prevents, the core mechanism (often numbered), variants, the API contract with timing, sibling relationships, tuning. (See "The file header" below.)                           |
| **Props / type fields**                       | Each field: what it is, who owns/writes it, who reads it, any sentinel/invariant.                                                                                                                                                             |
| **Module-scope constants**                    | The tuning rationale — _why_ this value, what it visually/behaviourally controls. Hoist magic numbers to named constants and comment them there.                                                                                              |
| **Declarations** (refs, state, shared values) | The value's role, which thread it lives on (UI vs JS), and _why it exists_ ("we don't share the deck's real shared values because the clone must stay frozen").                                                                               |
| **Function JSDoc `/** … \*/`\*\*              | What it does, **where it runs** (UI-thread worklet vs JS thread), and _why it's done that way_ ("measuring on the UI thread is synchronous and flicker-free"; "waiting for completion means the overlay stays visible throughout the close"). |
| **JSX inline `{/* … */}`**                    | What the element is, why a prop/className is set, and the pitfall it avoids ("do NOT add `items-center`, that would collapse the content width").                                                                                             |
| **StyleSheet entries**                        | Layout intent and the _why_ ("`overflow: visible` so shadows aren't clipped"; "`alignItems: flex-end` right-aligns items against the deck's right edge").                                                                                     |

## The file header

The most important comment. For any non-trivial component, start with a `/** … */` block. Cover each bullet that applies (skip ones that don't):

- **Identity** — `Name — what it is.` (one line).
- **Structure** — the moving parts and where they live (inline trigger vs portaled panel; preloaded overlay; pager + indicator).
- **The key architectural choice + the bug it prevents** — e.g. "Why split trigger and panel (the two-world problem): an earlier version teleported the same node… it carried that transform with it, so it 'jumped'… Keeping the trigger inline sidesteps the coordinate-system clash."
- **How the core mechanism works** — numbered steps for multi-phase mechanisms (the measure-and-morph pattern: measure → spring → on-finish callback).
- **Variants / options** — what each value changes (fullscreen vs menu; their size/bg/backdrop differences).
- **The API contract, with timing** — who owns state, what each callback does and _when_ it fires, and why the timing matters ("`onClose` fires on the JS thread _after_ the close spring finishes — so the calendar never re-renders mid-animation").
- **Relationships to named siblings** — "BloomButton owns the measure-and-morph… CalendarOverlay is the content… `ExpandContext`'s `chromeProgress` fades the header out."
- **Tuning / animation feel** — the spring character and the phased fade/grow, tied to the reference gif when there is one.

A header of 15–55 lines is normal for a component with this much going on. It is not a restatement of the code — it is the map a stranger reads first.

## The process

- **While writing new code:** comment as you go, not as a separate pass. The "why" is freshest the moment you make the decision; reconstructing it later yields weaker comments.
- **While refactoring:** update every comment the change invalidates. A comment describing the _old_ behaviour is worse than no comment — it actively misleads. After any behavioural change, re-read the surrounding comments and fix stale wording, stale names, and stale "why"s. (This repo recently removed a `measuredHeight` state twin whose comment still described a layout role it no longer had after a width/height morph change — that is exactly the drift to catch.)
- **When you delete code:** delete its comments. Don't leave orphaned explanations of code that's gone, and don't leave commented-out code lines as "notes" — remove them; git remembers.
- **When you add a magic number:** hoist it to a named constant (e.g. in `src/constants/animation.ts`) and comment the tuning rationale there; reference it by name at the call site so the number is never unexplained at the point of use.
- **Before calling a file done:** read it top-to-bottom as a stranger. Could you explain the component to a teammate using only the comments? If any decision still feels unexplained, add the comment. If a comment only narrates what the code says, delete it.

## Comment smell test

Ask of each comment: _"If I deleted this, would a new dev eventually re-discover this information by reading the code?"_

- **Yes** (it just narrates what) → delete it.
- **No** (it's a why, a pitfall, an ownership rule, a tuning reason, a sentinel meaning, or a cross-file relationship) → keep it and make it clearer.

## Quick checklist before committing

- [ ] File header covers identity, structure, why-this-architecture, mechanism, API+timing, siblings, tuning.
- [ ] Every props/type field has a role/ownership/invariant comment.
- [ ] Every module constant explains its tuning rationale; no unexplained magic numbers at call sites.
- [ ] Every ref/state/shared value notes its role and (if relevant) its thread.
- [ ] Every non-trivial function has JSDoc with what / where-it-runs / why.
- [ ] JSX blocks that need it have inline comments; pitfalls ("do NOT add…") are called out.
- [ ] StyleSheet entries explain layout intent + why.
- [ ] No commented-out code; no orphaned comments; no comments describing old behaviour.
