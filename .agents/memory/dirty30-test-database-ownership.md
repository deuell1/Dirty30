---
name: Dirty-30 test database ownership
description: Ownership and reset expectations for the isolated PostgreSQL integration-test database.
---

Dirty-30 integration verification assumes repository migrations exclusively own
the dedicated test database's `public` schema. Do not baseline pre-existing
objects into the migration journal.

**Why:** A database populated outside the migration history can have schema
objects while its journal is empty, causing the initial migration to fail on
duplicate objects and invalidating migration verification.

**How to apply:** Confirm the target is the isolated non-production test
database. If its objects and migration journal disagree, obtain explicit
authorization to reset only its `public` schema, then rerun the full pipeline
from the beginning.