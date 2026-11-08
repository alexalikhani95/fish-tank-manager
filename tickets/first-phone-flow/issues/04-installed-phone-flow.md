# 04: Install and verify the built phone app

Status: ready-for-agent
Blocked by: 03
Label: new design (extends ticket 01 frontend and browser setup)
Risky: yes — service-worker caching, HTTPS/cookies, shared config and CI.
Test seams: built-PWA Playwright checks against real API/test Mongo; actual phone HTTPS/install/offline checklist with the User.

## What to build

Make the completed flow installable and safely usable with intermittent connectivity. Provide a reproducible trusted local HTTPS path for the User's phone and verify the built app, without production deployment.

## Acceptance criteria

- [ ] Add PWA manifest, suitable code-native icons, standalone display and shell precaching. Do not cache API responses, credentials, writes or persistent private queries. Updates must not reload an in-progress entry without consent.
- [ ] Exclude `/api/*` from both service-worker and server SPA navigation fallback (S1). Tests distinguish API response/status from a valid deep link returning the shell, including after the worker controls the page. Unavailable API requests must not become successful HTML responses.
- [ ] After an initial online visit the installed shell opens offline. Loaded in-memory data can remain visibly offline; a cold start without session data shows unavailable/retry, not incorrect login. Offline submissions are disabled; in-page non-password values remain, reconnect never auto-submits, and no draft/password persistence is added.
- [ ] Provide a local certificate/HTTPS configuration using existing Vite build/preview mechanisms, LAN reachability and same-origin API forwarding. Phone instructions serve the built PWA, not just Vite development mode (S3). Certificate/key files are ignored and local paths configurable. Preserve Secure cookies; no public tunnel, custom server platform or production infrastructure.
- [ ] Document run/stop commands, certificate trust setup/removal, install/reopen steps for relevant iOS/Android browsers, and required user participation. Do not install global trust or bypass phone certificate checks automatically. Ask phone OS/host specifics only when needed for the manual run.
- [ ] Verify built frontend/PWA build, nonzero browser checks, API/script tests and frontend lint/typecheck/unit checks in GitHub CI. Keep the API test-count guard, independent doc gates and stable required-check identity intact. Fix native platform lock omissions without broad upgrades.
- [ ] Browser checks exercise real persisted data and valid Secure-cookie access on localhost, shell/deep links and API exclusions. No browser certificate bypass counts as actual-phone acceptance; use isolated test data and deterministic cleanup.
- [ ] Prepare and run the source-blind naive-user pass for unscripted behavior per develop, with a minimal config identifying the browser-scripted flows. Record actual results and fixes, not a source-derived UX assessment.
- [ ] Invite the User to verify trusted HTTPS, installation, standalone reopening, login, saved WaterChange and offline no-write behavior on their phone. Record device/browser/results separately from desktop checks. If unavailable, report the exact remaining acceptance item at merge approval; never mark the phone checklist passed by inference.
- [ ] Update design/run instructions, plan and sole status surface with actual outcomes; reconcile the HLD's stale bearer-only boundary sentence with the accepted cookie ADR. Note deferred features explicitly without creating empty product screens.

## Execution and handoff

Build and validate automated work before requesting device participation. The main session handles user questions, actual-phone handoff, naive-user delegation, PR creation and CI waits. A child returns a concrete runnable setup and checklist, with pending remote/device work labelled, and never polls/watches/merges. Final PR acceptance requires genuine green CI; manual phone acceptance is separately reported at stop 3 if still pending, as the spec allows.

## Comments

Spec approved: "looks good". Tickets approved by the user: "approve" on 2026-11-08. Implementation pending.
