---
name: GitHub publishing connector
description: GitHub connector behavior that blocks branch publishing even when repository reads and Git object creation work.
---

Treat GitHub object creation and Git reference mutation as separate capabilities when publishing through the connected OAuth integration.

**Why:** The connection could read repository metadata and create blobs, trees, and commits, while non-force updates to `main` returned `Not Found` and GraphQL ref creation returned a permissions denial despite the declared `repo` scope.

**How to apply:** Prefer a normally authenticated Git remote for publishing. If that is unavailable, test a safe ref operation before constructing commits or uploads; do not assume a successful blob/tree/commit API call means a branch can be advanced. Preserve local commits and report the repository/connector permission block if ref mutation remains unavailable.