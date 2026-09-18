---
name: Dirty-30 production Clerk proxy
description: Production Clerk wiring required for the published Dirty-30 app to finish loading.
---

Use Replit's canonical host-aware Clerk publishable-key resolution on both the web client and API server, and always pass the injected Clerk proxy URL to the web provider.

**Why:** The direct-key configuration can work in development while the published app remains stuck waiting for Clerk to load. Replit-managed production authentication depends on the same-origin proxy and host-derived key.

**How to apply:** When changing Clerk setup or upgrading its SDK, compare both client and server wiring against the current Replit Clerk guidance. Do not omit or hardcode the production proxy.