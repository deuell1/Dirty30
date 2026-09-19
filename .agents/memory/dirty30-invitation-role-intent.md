---
name: Dirty-30 invitation role intent
description: Durable rules for assigning and accepting captain versus player invitations.
---

Persist the intended membership role when an invitation is issued. For a team
without an active captain, only the earliest unexpired pending invitation made
by a commissioner is a captain invitation; later invitations remain player
invitations.

**Why:** Deriving the role during acceptance from the inviter's current role or
the team's current state changes historical intent and can make valid later
invitations unusable. Expired rows can remain marked pending until lazy cleanup,
so they must not reserve first-captain status.

**How to apply:** Serialize invite creation per team, check both active
membership and unexpired pending captain intent, consume the persisted role
inside the acceptance transaction, and never demote a user's global captain
role when accepting a player membership elsewhere.