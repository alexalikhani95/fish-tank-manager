# Independent tickets check

## First finding — minor: ticket 01 leaves the browser transport recipe open

Ticket 01 requires Secure-cookie-compatible localhost browser tests before ticket 04 introduces trusted LAN HTTPS, but does not name the localhost origin or certificate strategy. This is an implementation seam to verify against the existing cookie configuration, not yet a blocker: ticket 01 must be runnable independently and ticket 04 must extend its existing harness.

### Follow-up on the first finding

Confirmed as a minor clarification, not a missing prerequisite. `app/app/services/auth_token.ts` sets a host-only, unconditionally Secure cookie; the current CI API uses HTTP at `127.0.0.1:3333`. Ticket 01 can establish a Chromium browser origin at `http://localhost:<frontend-port>` with the built Vite preview proxy forwarding `/api` to the API; its real signup → `me` → logout smoke must prove cookie acceptance and transport. Alternatively it can establish test-local HTTPS in that same configuration. It must not weaken cookie attributes or replace cookie login with injected bearer credentials. The existing API bind address can stay loopback; the browser-facing hostname is the relevant origin. Ticket 04 then extends this configuration with trusted certificate inputs and LAN access. Desktop certificate exceptions, if used for browser automation, provide no evidence of phone trust.

Suggested optional clarification in 01: name the browser project/origin and the Secure-cookie proof explicitly. Implementation can select this recipe without waiting for ticket 04 or user phone details. No ticket edit was made in this review.

## Ticket and dependency assessment

- **01:** Buildable from ticket + spec. Frontend bootstrap, actual cookie authentication, error/race behavior and its first browser check form one substantial but coherent vertical slice. The protected landing page gives it an independently verifiable outcome. API auth contracts already exist; no new signup-status API or server platform is needed.
- **02:** Buildable after 01. Uses existing Tank endpoints and User preferences (`PATCH me` can prepare the non-litre test). Create/list/detail plus conversions is a complete slice. The deliberate neutral no-change presentation avoids a backwards dependency on 03.
- **03:** Buildable after 02. The API, ownership middleware, parser adjustment, derived summary, children-first deletion and history/form together deliver one WaterChange slice. This is the largest ticket, but the API/UI seams and explicit regressions make one implementer dispatch reasonable. Moving its API into a separate ticket is unnecessary. Existing Tank DELETE currently deletes the Tank directly; replacing that sequence is explicitly in scope. Existing route matchers reject malformed IDs before auth; the ticket expressly requires fixing that trap for the nested contract.
- **04:** Buildable after 03 for automated/code completion. Adds installation/offline capability to the existing built frontend and harness. The execution/handoff section correctly assigns user questions, device acceptance, naive-user delegation, PR creation and CI waits to the main session. A child can finish with a runnable setup and pending manual checklist; pending phone acceptance is not a false claim that code cannot be completed.

`None → 01 → 02 → 03` dependencies are correct. Every ticket changes shared frontend configuration, routes or tests only after its predecessor finishes; no parallel dispatch or competing CI/server setup is needed. Tickets 02–04 explicitly reuse the harness introduced by 01. The stable required job is currently `CI checks`; extending its steps preserves the branch-protection identity. The two existing doc/script gates use failure-independent conditions, and the API runner checks both assembler import and a positive passed-test count; preservation is expressly required.

## Carried-to-review coverage

| Item                                              | Assigned coverage                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S1: API versus SPA/SW fallback                    | 04 explicitly tests both fallback layers, API statuses and valid deep links after worker control.                                                                                                                              |
| S2: real-parser note variants and exact passwords | 03 explicitly covers omitted, empty, whitespace-only, null and non-string notes, parser configuration and auth/Tank regressions.                                                                                               |
| S3: built PWA over trusted phone HTTPS            | 04 explicitly requires built preview, proxying, trust instructions and genuine phone results.                                                                                                                                  |
| Auth before child-ID/ownership validation         | 03 specifies 401 before unauthenticated malformed-ID handling and 404 after authentication; identifies the current matcher trap.                                                                                               |
| Bearer fallback tests                             | 03 preserves cookie/bearer auth and imports the spec's review requirements; ADR-0006 requires one bearer test per route group. Existing auth/Tank bearer tests remain regressions; the new child route group needs its own.    |
| Cancelled private requests around logout          | 01 requires focused race tests and prohibits delayed responses repopulating another login's cache; 02/03 inherit that boundary.                                                                                                |
| Browser/API data isolation                        | 01 requires a distinct browser test database, real API and deterministic cleanup; 03 adds collection cleanup; 04 retains isolation. Japa currently clears Users/Tanks, so sharing its database would violate this requirement. |
| Stale HLD bearer-only boundary                    | 04 explicitly reconciles it with ADR-0006.                                                                                                                                                                                     |

## Result

Blockers: 0. Minor findings: 1 (the optional ticket-01 browser-origin clarification above). Each ticket is implementable from itself plus the approved spec; no uncovered approved product requirement or contradictory dependency was found.

Review only: no tickets, spec or source changed; no installs, runtime tests, phone verification, commits, pushes or agent dispatches. Transport feasibility is assessed from configuration/contracts, not a claim that the not-yet-built browser harness has passed.
