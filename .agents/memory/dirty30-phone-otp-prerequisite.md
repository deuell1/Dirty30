---
name: Dirty-30 phone OTP prerequisite
description: External Clerk capability required before the phone-only beta can authenticate real users.
---

Dirty-30’s phone-only auth UI and server-side verified-phone checks must remain fail-closed until its Clerk tenant supports phone sign-up/sign-in with SMS OTP.

**Why:** The current Replit-managed Clerk tenant reports phone/SMS sign-in as unavailable and its relevant Dashboard settings are not accessible in this workspace. Falling back to email would violate the product’s identity and invitation rules.

**How to apply:** Before releasing phone login, use a supported Clerk tenant/plan; enable phone SMS OTP and required verified primary phones, restrict delivery to the United States, disable email/password/username/social methods, then run a Clerk test-phone end-to-end check for sign-up, linking, and invitation acceptance.