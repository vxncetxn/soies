---
status: superseded
superseded-by: 0012-root-home-route.md
---

# Home↔Gallery uses the default lazy tab lifecycle

This decision described the earlier Home/Gallery product shape. Gallery and
tab navigation were later removed; [ADR 0012](./0012-root-home-route.md)
supersedes it.

The release uses Expo Router's default `TabSlot`, which mounts Gallery lazily and lets inactive scenes follow the router's normal lifecycle. Home must not pay for Gallery database reads, live Paper/Print/Ink trees, images, portals, and effects during cold start.

The earlier keep-alive camera-shift rendered both tab descriptors from startup and described the inactive route as “frozen.” Pointer and accessibility suppression did not freeze React effects, queries, rendering, or native resources, so that lifecycle claim was incorrect. A future camera-shift may be reconsidered only as a separately profiled feature with a lightweight destination placeholder and explicit launch, memory, and transition budgets.
