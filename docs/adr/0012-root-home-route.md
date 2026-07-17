---
status: accepted
---

# Home is the root Stack route

The app has one user destination, Home, at `src/app/index.tsx`. The root layout
registers that route in a headerless Expo Router Stack. Create, calendar,
Focus, and featured-widget management remain transient in-place surfaces, so
the app does not ship a tab navigator or visible tab bar.

The previous tab shell implied a second peer destination that no longer exists
and retained navigation code and chrome with no user-facing purpose. Moving the
existing Home route to the root keeps deep-link query parameters intact while
removing that redundant layer.

## Considered options

- **Keep a one-item tab navigator with the bar hidden** — rejected: preserves
  unnecessary route hierarchy and lifecycle machinery without providing
  navigation.
- **Turn transient surfaces into Stack routes** — rejected: their in-place
  animation and ownership decisions remain governed by ADR 0005.
