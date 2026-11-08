# 03: Log and read WaterChanges

Status: ready-for-agent
Blocked by: 02
Label: new design (API patterns from existing Tank routes, frontend patterns from 01/02)
Risky: yes — published API, ownership, shared body parser, Tank cascade and query state.
Test seams: Japa HTTP requests through the real parser and isolated MongoDB; real browser save/history/reload flow; focused calendar-day tests.

## What to build

Let the User log a WaterChange for their Tank, read newest-first history, and see the latest change date on the dashboard and Tank detail. Build API and UI together as one complete slice.

## Acceptance criteria

- [ ] Implement the spec's authenticated GET/POST nested WaterChange contract and model/index. Check ownership before child operations; derive both owner IDs from trusted context. Preserve cookie/bearer auth. After authentication, malformed/missing/foreign Tanks return 404; unauthenticated access returns 401. Ignore forged ownership fields as specified.
- [ ] Validate real exact calendar days, UTC-today-plus-one bound and integer 1–100 percentage, with controlled-clock HTTP tests for boundaries/leap days and invalid types. No timestamp conversion, duplicate-day restriction or invented lower date bound.
- [ ] Preserve optional note text. Test omitted/empty/whitespace-only notes as valid and null/non-string notes as invalid through the real HTTP body parser. Disable empty-string-to-null conversion while preserving JSON-only parsing and exact passwords; rerun auth and Tank regressions (spec review S2).
- [ ] Return created document with 201 and list array with 200, sorting date then `_id` descending. Test empty history, same-day entries, persistence, validation envelopes and tenant isolation.
- [ ] Derive nullable `lastWaterChangeAt` on existing Tank list/detail reads, preserving other fields and list order. Never store that derived value on Tank. Existing Tank DELETE removes owned WaterChanges first, propagates errors and preserves unrelated data/status semantics; add cascade tests and cleanup for new test collections.
- [ ] Add history and logging screens/actions to ticket 02. Form defaults to local today, takes percentage and optional note, and shows accessible errors. Render dates without timezone shifts. Empty history explains how to add the first entry.
- [ ] Save disables duplicate taps and never auto-retries. Confirmed success navigates to history with feedback and refreshes history plus all affected Tank summaries. A failed or ambiguous response retains form values and offers checking history before deliberate retry, without claiming the write failed definitively.
- [ ] Known offline state disables submission and preserves entered values in memory with a connection message; reconnect does not replay writes. Ticket 04 completes cold-offline shell behavior. Switching Tanks must not mix histories.
- [ ] Extend the real browser smoke through signup, add Tank, logout/login, save WaterChange, see history/latest summary, and reload. Test offline-disabled save without lost input. API/body-parser and date tests supplement rather than duplicate the whole browser flow.
- [ ] Update living design for implemented routes/data/flow, including ownership middleware and parser behavior. Keep scope to create/list; WaterChange edit/delete and new Tank-delete UI remain deferred.

## Boundaries and verification

Follow the existing no-transaction children-first cascade decision; no new transaction system or exactly-once writes. Use the shared ownership route pattern rather than duplicating insecure lookups. Review the existing malformed-ID matcher so it cannot contradict the auth-first contract. Retain all existing CI and frontend checks; no broad dependency changes.

## Comments

Spec approved: "looks good". Tickets approved by the user: "approve" on 2026-11-08. Implementation pending.
