# 01: Sign up, sign in and sign out on a phone-sized screen

Status: ready-for-agent
Blocked by: None
Label: new design (includes frontend boilerplate)
Risky: yes — authentication, shared frontend configuration, dependencies and CI.
Test seams: existing auth HTTP tests; browser auth flow against the real API; focused transport/session tests for error and race behavior.

## What to build

Create the frontend workspace and deliver working signup/login/logout using the existing API. This is the first runnable vertical slice, with an authenticated landing page ready for the Tank dashboard in ticket 02. Read the approved feature spec for all contracts and Carried to review requirements.

## Acceptance criteria

- [ ] Use the approved React/TypeScript/Vite, Tailwind, selective shadcn controls, React Router and TanStack Query stack. Add only dependencies used now. API requests are same-origin through a local proxy. Preserve all existing locked versions/platform entries unless an actual new dependency resolution requires a documented change.
- [ ] Login and signup use existing endpoints, exact passwords and Secure/httpOnly cookies; no token/password storage. Handle validation envelopes, invalid credentials and closed signup without redirect loops. Authenticated users leave login/signup for the landing page.
- [ ] Protected pages wait for session resolution; protected 401 cancels and clears private queries then returns to login. Offline/server errors show unavailable/retry rather than incorrect credentials. Confirmed logout clears private data; failed logout is visibly unconfirmed. A delayed private response cannot repopulate data after logout or another login.
- [ ] Loading/errors, labels, focus and touch controls work at 320px without horizontal scroll. Do not expose unfinished feature links from this intermediate landing page.
- [ ] Add root commands for frontend development, lint, typecheck, focused tests and production build while preserving existing API command behavior. Wire these validations and a minimal browser auth smoke into existing CI with a stable required-check name, preserving both doc gates and API false-pass protection. Browser checks must execute nonzero tests.
- [ ] Establish Playwright against a built frontend and real API with isolated test MongoDB, Secure-cookie-compatible localhost access and deterministic cleanup. Prove signup/login/logout and protected access; no mocked success for the main flow. Use a Chromium project with browser-facing `http://localhost:<frontend-port>` and the built preview proxy forwarding to the loopback API; prove real signup → me → logout transports the unchanged Secure cookie. If Chromium cannot do so, use test-local HTTPS in the same harness, never injected bearer credentials or weakened cookies. Ticket 04 extends this configuration for trusted LAN access. Keep its database isolated from Japa cleanup and developer data.
- [ ] Update living design/run instructions and status only to match delivered behavior. No phone-installation claim yet. The later HTTPS/PWA ticket extends this frontend configuration, not a second server stack.

## Boundaries and verification

The real API already implements auth; do not add a bootstrap-status endpoint or change signup closure. PWA installation and LAN HTTPS arrive in ticket 04. Ticket 02 replaces the authenticated landing content with Tanks. Use focused transport/session tests where real-browser scheduling cannot reliably reproduce delayed-response or network-error cases; test outcomes, not internal component structure. Run the repository checks and the new frontend/build/browser commands, including clean-install evidence for platform dependencies. Keep CI/env wiring in a separate commit from feature code and docs.

## Comments

Spec approved: "looks good". Tickets approved by the user: "approve" on 2026-11-08. Implementation pending.
