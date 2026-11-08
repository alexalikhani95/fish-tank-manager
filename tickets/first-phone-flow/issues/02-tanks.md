# 02: Add and view Tanks

Status: awaiting-review
Blocked by: 01
Label: new design (reuse ticket 01 auth, transport and controls)
Risky: yes — shared authenticated routes/query state and input conversion.
Test seams: browser Tank create/list/detail flow against the real API; pure volume conversion tests; existing Tank HTTP regressions.

## What to build

Turn the authenticated landing page into a useful Tank dashboard. Let the User create a Tank and open its details using existing APIs, respecting their existing volume preference.

## Acceptance criteria

- [x] Dashboard, Add Tank and Tank detail routes use existing `_id` response shapes and ownership-scoped endpoints. Show loading, unavailable/retry, empty and missing-Tank states without confusing network failures with authentication failures.
- [x] Empty dashboard offers Add Tank. Create takes name and positive finite volume with clear field errors, disables duplicate submission, preserves entered values after failure and navigates to the created Tank after success. Display names/notes as text.
- [x] Implement only needed pure volume conversions using exact spec factors for litres, US gallons and UK gallons. Read the User's existing preference, retain precision on submission and round only display. Tests distinguish both gallons and check known values/round trips.
- [x] Dashboard cards/detail show name and preferred-unit volume. `lastWaterChangeAt` is introduced in ticket 03; until then show the neutral no-changes state rather than inventing history. Ticket 03 adds log links/history and invalidation.
- [x] Honour ticket 01 session/cache boundaries. Switching Tanks must not flash another Tank's data. Narrow-screen/keyboard accessibility remains intact.
- [x] Extend the real browser flow to create/view a Tank and confirm persistence after reload. Test a non-litre preference prepared through the existing API, without adding settings UI. Existing auth and Tank tests remain green.
- [x] Update design/status for the delivered scope. No Tank edit/delete UI, livestock, photos or settings.

## Boundaries and verification

Reuse ticket 01 commands and CI; do not introduce another test harness. Unit conversion stays in the frontend until another consumer actually needs a shared package. No new Tank API is expected in this ticket. Any ambiguous POST failure must not auto-retry; the UI retains values and offers checking the dashboard before deliberate retry.

## Comments

Spec approved: "looks good". Tickets approved by the user: "approve" on 2026-11-08. Implementation report follows; merge remains pending.

Implementation report — 2026-11-08:

- Status: implemented locally in `e44613c`, reviewed; review findings fixed in a follow-up commit. Awaiting merge; no PR or push.
- Review fixes: one home for check counts in `docs/status.md`; Add Tank parses the amount once and rejects non-finite litres (e.g. `1e308` UK gal) as a field error; name has no raw length cap, so over 80 characters after trimming is a field error; a failed client-side submit focuses the first invalid field. Browser flow now also checks focus, the over-long name, the overflowing volume and a direct Tank-to-Tank switch that never shows the previous Tank's data.
- Checks: see `docs/status.md` → Local checks.
- Deferred to ticket 03: splitting `web/src/main.tsx` and renaming the browser test file.
