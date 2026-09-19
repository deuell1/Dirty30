---
name: Dirty-30 invitation auth return
description: Durable lifecycle rule for preserving invitation context through Clerk phone authentication.
---

Keep a validated same-origin invitation path in session-scoped browser storage
through phone verification, session activation, refreshes, and repeated Clerk
redirects. Clear it only after acceptance succeeds and the refreshed user is
ACTIVE.

**Why:** Clerk session finalization can redirect to the dashboard after the app
requests a return to the invitation. Clearing the pointer when navigation is
requested creates a race that strands pending users on the waiting screen.

**How to apply:** Explicitly navigate to the preserved path after activating the
session, let the authenticated boundary resume it before rendering pending
access, and retain it across repeated redirects or access-refresh retries.
If invitation signup reports Clerk's existing-identifier error, switch the
same phone into Clerk's sign-in flow; do not clear or replace the stored invite
path during that transition.