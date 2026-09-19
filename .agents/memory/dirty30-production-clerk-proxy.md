---
name: Dirty-30 external Clerk routing
description: Production routing rule for the user-owned Clerk tenant and custom domain.
---

Use the external production publishable key directly in the web provider and standard Clerk backend middleware. Do not add a same-origin `/api/__clerk` proxy or derive a key from the request host.

**Why:** The project moved to a user-owned Clerk production tenant whose key encodes `clerk.dirty30volleyball.com`. The former Replit-oriented proxy caused Clerk bootstrap requests to fail with `host_invalid`.

**How to apply:** Keep normal server-side session verification, but let ClerkJS contact the Frontend API encoded in the production key. A non-production preview needs a separate Clerk development key; do not restore host rewriting or the retired proxy.