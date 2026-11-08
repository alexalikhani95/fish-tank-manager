# 01: Sign up, sign in and sign out on a phone-sized screen

Status: awaiting-review
Blocked by: None
Label: new design (includes frontend boilerplate)
Risky: yes — authentication, shared frontend configuration, dependencies and CI.
Test seams: existing auth HTTP tests; browser auth flow against the real API; focused transport/session tests for error and race behavior.

## What to build

Create the frontend workspace and deliver working signup/login/logout using the existing API. This is the first runnable vertical slice, with an authenticated landing page ready for the Tank dashboard in ticket 02. Read the approved feature spec for all contracts and Carried to review requirements.

## Acceptance criteria

- [x] Use the approved React/TypeScript/Vite, Tailwind, selective shadcn controls, React Router and TanStack Query stack. Add only dependencies used now. API requests are same-origin through a local proxy. Preserve all existing locked versions/platform entries unless an actual new dependency resolution requires a documented change.
- [x] Login and signup use existing endpoints, exact passwords and Secure/httpOnly cookies; no token/password storage. Handle validation envelopes, invalid credentials and closed signup without redirect loops. Authenticated users leave login/signup for the landing page.
- [x] Protected pages wait for session resolution; protected 401 cancels and clears private queries then returns to login. Offline/server errors show unavailable/retry rather than incorrect credentials. Confirmed logout clears private data; failed logout is visibly unconfirmed. A delayed private response cannot repopulate data after logout or another login.
- [x] Loading/errors, labels, focus and touch controls work at 320px without horizontal scroll. Do not expose unfinished feature links from this intermediate landing page.
- [x] Add root commands for frontend development, lint, typecheck, focused tests and production build while preserving existing API command behavior. Wire these validations and a minimal browser auth smoke into existing CI with a stable required-check name, preserving both doc gates and API false-pass protection. Browser checks must execute nonzero tests.
- [x] Establish Playwright against a built frontend and real API with isolated test MongoDB, Secure-cookie-compatible localhost access and deterministic cleanup. Prove signup/login/logout and protected access; no mocked success for the main flow. Use a Chromium project with browser-facing `http://localhost:<frontend-port>` and the built preview proxy forwarding to the loopback API; prove real signup → me → logout transports the unchanged Secure cookie. If Chromium cannot do so, use test-local HTTPS in the same harness, never injected bearer credentials or weakened cookies. Ticket 04 extends this configuration for trusted LAN access. Keep its database isolated from Japa cleanup and developer data.
- [x] Update living design/run instructions and status only to match delivered behavior. No phone-installation claim yet. The later HTTPS/PWA ticket extends this frontend configuration, not a second server stack.

## Boundaries and verification

The real API already implements auth; do not add a bootstrap-status endpoint or change signup closure. PWA installation and LAN HTTPS arrive in ticket 04. Ticket 02 replaces the authenticated landing content with Tanks. Use focused transport/session tests where real-browser scheduling cannot reliably reproduce delayed-response or network-error cases; test outcomes, not internal component structure. Run the repository checks and the new frontend/build/browser commands, including clean-install evidence for platform dependencies. Keep CI/env wiring in a separate commit from feature code and docs.

## Comments

Spec approved: "looks good". Tickets approved by the user: "approve" on 2026-11-08. Implementation report follows; merge remains pending.

Implementation report — 2026-11-08:

- Status: implemented locally, awaiting parent risky-ticket review; not done/merged. No PR or push.
- Changes: React/TypeScript/Vite/Tailwind auth shell, CLI-sourced and reduced shadcn button/input/label, Router guards, TanStack Query session/transport, same-origin proxy, labelled 320px forms and loading/error/offline states. No API auth/cookie changes. Root commands, production build and isolated real-API Chromium suite extend stable `CI checks`, retaining both independent doc gates and `scripts/ci-test.sh` unchanged.
- Checks: Node 24.11.1; clean `npm ci` succeeded. Original 503 dependency records (versions/platform metadata included) preserved unchanged. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build:web`, status gate passed. `bash scripts/ci-test.sh`: 56 passed; `npm run test:web`: 7 passed; `node --test 'scripts/**/*.test.mjs'`: 15 passed; `npm run test:browser`: 2 Chromium tests passed. Browser uses built frontend at localhost:4173, loopback API:3334, actual Secure cookie/signup/me/logout/login and isolated `fishtank_browser`; Japa uses distinct `fishtank_test` on disposable MongoDB port 27029.
- Diagnosis: browser test initially filled a departing form during Router transition; waiting for destination heading fixed the test. Removed diagnostic instrumentation. Cleanup helper moved into the API workspace to reuse Mongoose. Focused tests cover failed login versus protected 401, failed logout, server/network/unreadable responses, delayed query cancellation and stale-login responses.
- Skipped: Tanks, WaterChanges, PWA/service worker, LAN HTTPS and actual phone installation belong to later tickets. No source-blind naive-user pass as this implementing agent has read the source and was instructed to use no subagents; parent can arrange it separately. Remote GitHub CI remains pending parent push. Independent code-review subagents omitted per task; local standards/spec self-review performed.
- Known gaps: desktop Chromium does not prove trusted phone behavior. `npm audit` reports 23 moderate API/tooling findings with existing locks preserved; no broad upgrades attempted. Test API/preview servers stopped automatically; disposable MongoDB is stopped at handback.

- Commits before documentation: `9fe1008` feature; `600deb0` CI/env/browser harness. Parent-provided `build 01` log line preserved deliberately.
