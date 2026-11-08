# Independent spec check

## Findings

### S1 — minor: Specify API exclusion from navigation fallback

The service-worker section prohibits caching API responses, but neither it nor the SPA deep-link requirement explicitly excludes `/api/*` from navigation fallback. An uncached API navigation can still receive the precached HTML shell. Require both the service-worker navigation fallback and the built frontend's SPA fallback to exclude `/api/*`; verify an API URL keeps its API response/status while a valid Tank deep link serves the shell. This makes the existing API-exclusion requirement directly testable without adding a feature.

### S2 — minor: Carry empty-note parsing into the implementation scope

The WaterChange contract permits an optional string note, preserves its text, and specifies no minimum length; thus `{ at, percent, note: "" }` is valid under the written contract. However, `app/config/bodyparser.ts` enables `json.convertEmptyStringsToNull`, so the validator will receive `note: null`, indistinguishable from an explicitly invalid null note. Copying the existing Zod create pattern (`z.string().optional()`) rejects the valid empty string; accepting null silently broadens the stated API contract. The written string contract is buildable, but ticketing must include the parser configuration rather than treating this as only a new schema/controller. Explicitly test omitted and empty-string notes as valid, null as invalid, and whitespace-only notes as preserved. If disabling empty-string conversion, retain JSON-only parsing and exact passwords, and run the existing auth/Tank regression tests. Use HTTP tests through the real body parser, not only schema tests. No new product decision is required if the written string contract is retained.

### S3 — minor: Make the phone instructions exercise the built PWA

Trusted phone access specifies a LAN frontend and same-origin proxy, while shell/deep-link behavior refers to the production build. It does not explicitly require the phone runbook to serve that built PWA with HTTPS and the API proxy. A dev-server-only HTTPS recipe could prove cookie login yet fail to exercise the service worker, installation and offline acceptance. Require a documented command/path serving the built frontend over the trusted phone origin, with API forwarding and SPA fallback, and perform the phone install/offline checks there. An existing Vite build/preview arrangement is sufficient; no custom server framework or production hosting is requested.

## Assessment

No blocking ambiguity remains in the core scope: the original request and all four agreed additions are covered. The three findings above are ticketing clarifications and implementation traps, not reasons to invent more features.

- Secure host-only/httpOnly/SameSite cookies, same-origin relative API calls and exact passwords match ADR-0006/0009/0011 and the current auth service. The spec correctly leaves phone certificate trust and installation to the User and prevents desktop/browser certificate bypass from counting as phone acceptance.
- Calendar-day storage, strict real-day validation, UTC-plus-one bound, local defaults, integer percentages, same-day entries and deterministic order are sufficiently defined. The exact gallon factors, canonical storage and whole-unit display agree with the LLD; no settings screen is needed to respect an existing User's preference.
- Auth resolution, login-versus-protected-request 401 handling, query cancellation/clearing, failed logout, cold-offline auth and in-memory draft preservation are specified. Carry these into acceptance tests, especially delayed private reads completing around logout, without adding persistent storage or a write queue.
- Ownership-first child routes, dual-ID child filters, forged-field stripping, derived summaries and children-first scoped deletion agree with the design and Mongo-only/no-transaction decisions. The existing route matcher rejects malformed IDs before auth middleware; new child-route tickets must honor the spec's stated auth-first behavior, rather than blindly copying that matcher order. This is implementable in the planned ownership middleware, not an unresolved product choice. Keep bearer fallback coverage for the new route group per ADR-0006.
- CI requires a real API/test database, built frontend, installed browser, executed nonzero browser tests and actual GitHub results. Preserve the existing Japa positive-count wrapper and failure-independent doc gates. The smoke suite cannot pass by mocking persistence, skipping tests or relying solely on an API test count. Isolate browser cleanup from API-suite cleanup when both run.
- No contradiction with an accepted ADR was found. HLD's older “plain HTTP + bearer JWT” boundary sentence is stale relative to ADR-0006 and its own Auth section; follow the accepted cookie decision and reconcile that sentence during the already-required living-doc update.
- No overengineering requirement found: full arrays, one smoke flow with focused state checks, a local certificate, existing middleware/query patterns and deferred settings/edit/delete UI are proportionate. Do not turn the certificate recipe into a generic HTTPS platform, or this slice into production hosting, shared-package extraction, transactions or exactly-once delivery.

## Review limits

Read the spec, AGENTS, glossary, PRD, relevant plan/design/ADR/workflow/CI guidance and current auth/Tank/parser/test code. Only this findings file was written; no spec/source edits, commits, pushes or delegated work.

No checks were executed and no phone/browser/CI behavior was verified. This is a requirements review; implementation and actual-phone acceptance remain unverified.

VERDICT spec blockers=0 total=3 file=tickets/first-phone-flow/checks/spec.md
