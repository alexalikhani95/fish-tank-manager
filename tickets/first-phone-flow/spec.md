# First phone flow

Status: ready-for-agent

## Problem Statement

The API has sign-in and Tanks, but the User cannot use a phone interface to set up a Tank or record water changes. This slice must work from an empty installation and show that a saved change persists.

## Solution

Deliver an installable, mobile-first PWA: sign up or sign in, add and view Tanks, open a Tank's WaterChange history, and log a WaterChange. Include a trusted HTTPS route for testing on the User's phone without provisioning production infrastructure. Reuse existing auth and Tank endpoints; add authenticated WaterChange create/list endpoints and derived Tank summaries.

## User Stories

1. As a User, I want to create the first account through the app so I need no API setup.
2. As a User, I want clear sign-up-closed feedback and a sign-in link after an account exists.
3. As a User, I want to sign in and stay signed in after reopening the app.
4. As a User, I want to sign out and remove private data from the screen.
5. As a User, I want an empty dashboard with an Add Tank action.
6. As a User, I want to create a Tank with its name and volume in my preferred unit.
7. As a User, I want my Tanks and their last WaterChange dates on the dashboard.
8. As a User, I want a Tank's details and newest-first WaterChange history.
9. As a User, I want to record a date, percentage replaced and optional note.
10. As a User, I want local today filled in by default and clear errors for invalid input.
11. As a User, I want the saved entry and latest-change summary to update immediately after a successful save.
12. As a User, I want refreshing the page to retain saved entries.
13. As a User, I want slow requests and failures to preserve my unsaved non-password form values in the current page.
14. As a User, I want duplicate taps prevented while saving, without silent retries that create duplicate records.
15. As a User, I want offline writes disabled and a clear connection message rather than false success.
16. As a User, I want the installed shell to open offline and explain when data cannot be loaded.
17. As a User, I want readable controls on a narrow phone screen, accessible labels and keyboard navigation.
18. As a User, I want valid deep links to reopen the correct Tank and meaningful handling of missing Tanks.
19. As a User, I want my Tank data protected by the existing login and ownership rules.
20. As the maintainer, I want frontend checks and a real browser flow run in CI alongside existing API and doc checks.

## Implementation Decisions

### Scope and screens

- Use the chosen React/TypeScript/Vite stack, Tailwind v4, selective shadcn controls, React Router, TanStack Query and vite-plugin-pwa. Add only dependencies needed for this slice; no charting or speculative shared package.
- Screens: `/login`, `/signup`, dashboard `/`, `/tanks/new`, Tank detail/history `/tanks/:tankId`, and form `/tanks/:tankId/water-change`. Put sign-out in authenticated navigation; no settings screen yet. An authenticated visit to login/signup leads to the dashboard.
- Dashboard cards show Tank name, preferred-unit volume and last WaterChange date or “No water changes yet.” Use a clear Add Tank action and direct access to logging. Do not render fake photos or empty WaterTest/trend features.
- Tank creation contains name and volume only; reuse API constraints (trimmed 1–80 character name, positive finite litres). On success navigate to the new Tank. History shows date, integer percentage and optional note; an empty log explains how to add the first change.
- After a successful WaterChange save, navigate to the Tank history with visible success feedback and refetch affected data. No replacement-volume calculation is needed in this slice.
- Mobile layout must work at 320px without horizontal scrolling, with visible focus, labelled inputs, accessible error associations and comfortable touch controls. Loading, empty, unavailable, missing-resource and validation states are distinct. Notes render as text.

### Auth and transport

- Reuse existing registration, login, logout and `me` contracts. Preserve passwords exactly; never store them or JWTs in browser storage. Keep Secure/httpOnly/SameSite cookies and JSON-only writes unchanged.
- Fetch relative same-origin API URLs with credentials included, through the Vite proxy during local development. Handle both existing validation envelopes and message errors.
- Resolve session via `GET me` before showing private data. A protected-request 401 clears/cancels private queries and redirects to login; a failed login 401 instead stays on the form with an inline error. Network errors and 5xx must not be treated as invalid credentials.
- Provide a first-account link on login; the existing registration endpoint is the authority for closed signup. A 403 explains signup is closed and links to login. No new bootstrap-status endpoint.
- On confirmed logout cancel and clear private cached data and return to login. If logout fails, explain that logout was not confirmed; do not claim the cookie was cleared. Never expose a prior session's query cache after another login.

### WaterChange API and Tank integration

- Add GET and POST `/api/v1/tanks/:tankId/water-changes`. Auth is required; malformed, missing or foreign Tank IDs return 404 after authentication. Load the owned Tank before any child read/write, using the documented ownership middleware pattern. Child queries always include both Tank and User IDs.
- Store WaterChanges with ObjectId identity, `tankId`, `userId`, `at`, `percent`, optional `note` and timestamps. Reuse the documented compound Tank/date index. Derive ownership from the authenticated context, never request fields.
- POST accepts `{ at, percent, note? }`, returns 201 with the created document using existing `_id` conventions. GET returns 200 with the full array newest date first; use `_id` descending as a deterministic tie-break. Empty log returns an empty array. No pagination for this single-user slice.
- Validate a genuine calendar day in exact `YYYY-MM-DD` form (reject overflow dates, timestamps and malformed strings), no later than UTC today plus one day. Percentage is an integer 1–100; numeric strings and nonfinite values are invalid. Optional note must be a string; preserve its text, with no new arbitrary length limit. Omitted, empty-string and whitespace-only notes are valid; null is invalid. Disable JSON empty-string-to-null conversion so the real HTTP parser preserves this contract; retain JSON-only parsing and exact passwords, and rerun auth/Tank regressions. Follow existing create-schema handling of unknown keys and existing 400 envelope. Multiple same-day entries are permitted; do not add uniqueness or lower date bounds.
- Extend GET Tank list/detail responses with nullable `lastWaterChangeAt`, derived from the newest entry by date, never stored on Tank. Preserve existing response fields and sorting. Do not fabricate WaterTest or photo summary fields for unbuilt features.
- Extend existing Tank deletion to delete its owned WaterChanges before deleting the Tank, matching the documented no-transaction cascade. Propagate deletion errors; no unrelated deletion and no change to the existing successful status code. No new Tank-delete screen.
- Date-only values remain date-only through storage and rendering: format calendar components without UTC-to-local day shifts. Default the form using local calendar today; API remains authoritative for its UTC-plus-one limit.

### Units, state and offline behavior

- Read `volumeUnit` from the current User. Implement only the pure volume conversions needed now: litres, US gallons (3.785411784 litres), UK gallons (4.54609 litres). Convert before Tank submission; retain precision in storage and round displayed volumes to whole units per the design. Temperature conversion waits for WaterTests.
- Follow documented query keys. Saving a WaterChange refreshes both its history and Tank summaries; changing Tanks must never mix histories. Avoid mutation retries. Disable repeated submission while pending.
- A failed/ambiguous save retains entered values and explains the result is not confirmed; offer refreshing history before a manual retry. No automatic replay or exactly-once guarantee is introduced.
- Precache only public application-shell assets. Both service-worker navigation fallback and built-frontend SPA fallback must exclude `/api/*`, preserving API responses/statuses even for navigation requests. Never service-worker-cache API responses, credentials or mutation requests; no persistent private query cache or write queue. Use a PWA update strategy that does not force a reload during entry.
- When offline disable submission and show a connection banner, preserving currently entered values in memory. Loaded in-memory data may stay visible with offline feedback. A cold offline start without session data shows unavailable/retry rather than login failure. Reconnect permits a deliberate retry; navigation/reload need not preserve drafts. Do not persist passwords or drafts.

### Trusted phone access and PWA

- Supply manifest, appropriate install icons, app name and standalone display; use simple code-native assets consistent with the project. The production build must serve SPA deep links and the shell offline after an initial online visit.
- Provide documented, reproducible trusted local HTTPS using a locally generated certificate (for example mkcert), same-origin API proxy and LAN-reachable frontend. Certificate paths are local inputs, certificates/private keys are ignored, and no secrets are committed. Do not weaken Secure cookies or bypass browser trust checks on the phone.
- The phone runbook must serve the built PWA over that trusted HTTPS origin, with API forwarding and API-excluding SPA fallback, so install/offline checks exercise the service worker rather than only the dev server. Reuse Vite build/preview configuration; no custom server framework. The User performs device trust and installation steps; these cannot be claimed completed by desktop emulation. Document certificate trust setup/removal and how to stop the local servers. Avoid exposing the app through a public tunnel or changing global trust without the User's participation.
- Phone OS/host details may be supplied at the manual verification stage; provide relevant iOS/Android instructions. If a trusted connection cannot be achieved, report the exact blocker and leave real-phone acceptance pending rather than silently replacing it with desktop testing.
- No hosting, AWS/Atlas setup, domain purchase or production deploy. A local trusted certificate is sufficient for this development milestone.

### Work labels and integration

- Boilerplate: frontend workspace, selected tool configuration, manifest and command wiring.
- New design: screen/state/auth integration, secure development access and meaningful browser verification.
- Pattern plus new validation: WaterChange model/routes/controller/ownership and Tank cascade/summary, following existing Tank conventions.
- Extend root commands so lint/typecheck cover both workspaces; ensure CI also executes frontend unit tests, production/PWA build and the approved browser smoke test. Preserve existing API runner's false-pass protection and both doc gates' failure-independent behavior. Native platform lock records from the CI feature must survive dependency installation.
- Update living design docs for implemented routes/flows and dev access, the plan for the chosen slice, and the single status document for actual verification. New browser checks bring only this smoke coverage forward from Phase 2, not the whole deployment/testing roadmap.

## Testing Decisions

- Reuse Japa HTTP tests as the API seam: authenticated create/list, persistence, ordering, summary derivation, empty logs, same-day entries, invalid dates/leap days/bounds/percentage/note types, unauthenticated access, foreign/malformed/missing Tanks, ignored forged ownership fields, and scoped cascade. Use isolated test MongoDB and clean all introduced collections. Fix the clock for date-boundary tests.
- Small pure tests cover known volume conversion values and the distinction between US/UK gallons; include round-trip precision and date formatting at timezone boundaries where applicable.
- Add a small Playwright browser suite against real API/test Mongo and built frontend. Prove empty-install signup → add Tank → sign out → sign in → view Tank → save WaterChange → see history/latest summary → refresh and still see it. Verify auth redirect and disabled offline save without lost form values. No mocked success responses for the main persistence flow.
- Keep the browser environment isolated from developer data; cookie authentication must work with Secure cookies. Localhost browser tests can use a trusted secure-context setup, but do not count certificate-error bypass as real-phone HTTPS verification. Browser tests must be wired into CI with browsers installed and no silent zero-test success.
- Use the naive-user skill for a source-blind exploratory pass of the new UI, skipping scripted flows. Automated checks cover mechanics; manual real-phone acceptance covers trusted HTTPS, installing, standalone reopening, sign-in and saving a change, and offline shell/no-write feedback.
- Before merge claim: existing API/script gates, frontend lint/typecheck/unit checks, production build and browser smoke pass on GitHub. Record browser and actual-phone results separately. If the User has not completed phone steps, clearly present that remaining acceptance item at the merge stop.

## Out of Scope

WaterChange edit/delete, Tank edit/delete UI, photos, brand/model, Fish/Plants, WaterTests, charts, settings UI, password recovery UI, public deployment, offline data persistence or queued writes, new auth schemes and broad dependency upgrades. Existing password-recovery command remains available.

## Further Notes

User approved on 2026-11-08: first-account signup and Tank creation; WaterChange history with edit/delete deferred; trusted HTTPS phone testing without production deployment; and a small automated browser flow. No ADR conflict is intended. Keep the existing authentication, signup-closure, JSON-only and ownership decisions.

Package installation during setup produced metadata-only lockfile churn; it was removed before planning. Real frontend dependency changes belong to implementation.

## Carried to review

The independent spec check found three minor implementation traps, now clarified above. Carry them into ticket acceptance and final review:

- S1: API requests must bypass both service-worker and server SPA navigation fallbacks; test API status versus a valid Tank deep link.
- S2: Exercise omitted/empty/whitespace/null notes through the actual HTTP body parser; preserve exact passwords and run auth/Tank regressions after the parser change.
- S3: Phone installation/offline acceptance must use the built PWA served over trusted HTTPS with API proxying.

Also retain reviewer reminders: authenticated child-route validation order, bearer fallback tests, cancelled private requests around logout, isolated browser/API test data, and reconciliation of the stale HLD bearer-only boundary sentence with the accepted cookie ADR.

## Stop 2 decisions

The user approved the four-ticket breakdown with "approve" on 2026-11-08, with no additional conditions. Build in order: signup/sign-in/sign-out; add/view Tanks; log/read WaterChanges; installed PWA and trusted-phone verification. Retain all approved scope, carried review requirements and the ticket-01 Secure-cookie browser proof. Actual-phone verification requires the User's participation and remains distinct from automated checks.
