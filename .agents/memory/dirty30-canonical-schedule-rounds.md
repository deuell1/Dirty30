---
name: Dirty-30 canonical schedule rounds
description: Why canonical schedule weeks may share a calendar range and how mutations must disambiguate them.
---

Generated rounds are distinct canonical schedule weeks even when multiple rounds are played within the same Monday–Sunday calendar range. Any commissioner mutation in an overlapping range must use the intended canonical schedule-week ID; date-only resolution is valid only when exactly one canonical week contains the date.

**Why:** A generator can schedule several rounds on different weekdays in one calendar week. Collapsing those rounds breaks bye semantics, while resolving later edits by date alone is ambiguous and can move a game to the wrong round.

**How to apply:** Preserve the current canonical ID on ordinary edits, require an explicit destination ID for cross-round moves or additions in overlapping ranges, and keep compatibility week numbers synchronized only as derived rollout fields.