---
status: accepted
---

# Home↔Gallery uses a keep-alive camera-shift transition

Tab switches between Home and Gallery pan content sideways (camera shift) while the floating tab chrome and create button stay fixed. Both tab scenes stay mounted; the inactive scene is frozen (no pointer events) so the pan is always ready without a mount hitch. Default `TabSlot` scene swapping was rejected because it cannot show both rooms during the transition and often unmounts the inactive tab. Content-only translation (not sliding the whole shell) keeps chrome stable and avoids fighting expand/create fade behavior.
