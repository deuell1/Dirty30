---
name: Dirty-30 preview API routing
description: Development preview routing constraint for Dirty-30's web and API artifacts.
---

When Dirty-30's root Vite web artifact serves the preview, configure Vite to proxy `/api` to the API service on port 8080.

**Why:** Without the development proxy, root-relative API calls are handled by Vite's SPA fallback and return the app HTML with HTTP 200. Typed hooks then receive an HTML object instead of their expected JSON and can render missing identity data or crash consumers.

**How to apply:** Keep the API client using `/api` paths and retain the narrow Vite development proxy. Verify the browser receives JSON from `/api/me` and `/api/schedule` after changing preview routing or the web artifact configuration.