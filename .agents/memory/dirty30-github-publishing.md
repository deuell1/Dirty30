---
name: Dirty-30 GitHub publishing
description: Safe publishing guidance when the local GitHub HTTPS credential cannot push.
---

When local `git push origin main` is rejected for credentials but the attached GitHub connector can access the repository, publish through the connector's Git REST API instead. Read the remote branch SHA/tree first and refuse the update unless it matches the local commit's parent tree; create blobs/tree/commit and advance the branch with `force: false`.

**Why:** The local Git credential and the attached GitHub connector can have different authentication lifecycles. A normal push can fail even while the connector has valid repository access.

**How to apply:** Keep local commits intact, preserve any prior local commits in order, and never use a forced branch update. Confirm the remote branch head after publishing.