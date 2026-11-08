# Review 01

Verdict: PASS. Blockers: 0. Important: 0. Minor: 0. Total findings: 0.

## Scope

Independent risky-ticket review of `9fe1008d2dd24211fee46c1e7089f11bf1b152e5`, `600deb08f4491dbe76fa57cc1b1d18c3b961a983`, and `ce2f179b7e378e1afcdd1b3232460e75b783f279` against parent `43d1aac`. Reviewed ticket 01 acceptance only, assuming the documented single User workload. Read AGENTS, CONTEXT, HLD/LLD, relevant ADRs (0002, 0003, 0005–0011 except infrastructure-only 0004), workflow/git conventions, the complete feature spec including Carried to review, Stop 2 and Discovered, and issue 01 including its exact Comments.

What this change does: adds the mobile signup/login/logout frontend using the existing cookie API, plus focused session tests and a built-frontend Chromium harness. It extends the existing CI check without changing API authentication.

## Evidence: no actionable findings

- **Auth boundary and signup closure:** no diff under API controllers, auth middleware, cookie helpers, body parser, or route wiring. Cookie attributes remain Secure/httpOnly/SameSite=Lax, with cookie-first bearer fallback, token-version validation and JSON-only untrimmed requests. Signup remains controlled by the existing endpoint; closed-signup feedback stays on the form and links to login. Passwords remain exact and are not persisted. Existing API regressions passed, including bearer fallback, closure, JSON-only bodies and exact-password cases.
- **Protected access and failure states:** `web/src/session.ts` distinguishes failed login 401 from protected 401. Protected 401 replaces the User with null, cancels active queries and removes private cached queries. `web/src/main.tsx` waits for `me`, redirects unauthenticated private access, redirects authenticated login/signup visits, and shows unavailable/retry for session/network/server failures. Confirmed logout clears private state; failed logout retains the User and visibly reports that sign-out was not confirmed.
- **Delayed private work:** session replacement advances a generation before cancelling/removing queries. Responses check that generation before acting on either success or 401. The current `me` query passes its AbortSignal; the documented contract requires future private queries to do the same. Focused tests prove an aborted delayed private query cannot refill cache after logout/new login and an older login's late 401 cannot clear the new User. All current session callers were traced.
- **Mobile accessibility:** forms have associated labels, password hints and field-error descriptions, native validation, visible focus and error focus, autocomplete attributes, and minimum 44–48px touch controls. Offline submission is disabled. The 320px Chromium suite exercises heading/error focus and checks layout overflow on the landing page. There are no unfinished Tank/PWA links.
- **Real built-browser auth:** `web/playwright.config.ts` starts its own loopback API and Vite built preview, with browser origin `http://localhost:4173`, Chromium, no existing-server reuse, no cookie weakening, no certificate bypass and no bearer injection. The passing main test performs real signup, browser-side `me`, reload, logout and login, checks cookie attributes/removal, closed signup, bad credentials and unauthenticated access. API navigation returns its actual JSON 401 instead of SPA HTML. Only error-path responses are intercepted.
- **Database isolation and cleanup:** browser API and cleanup share `MONGO_BROWSER_URL`; the cleanup helper refuses every pathname except `/fishtank_browser`, uses a separate connection and closes it in `finally`. Japa uses distinct `fishtank_test`. An independent assert-based check confirmed refusal of `/developer_data` and zero browser collections after teardown. Review runs used a fresh disposable MongoDB 8.0.16 instance at loopback port 27030, separate from developer databases; that instance was stopped afterward.
- **CI and dependencies:** root lint/typecheck include both workspaces; API dev/test behavior is retained. Stable `CI checks` runs frontend tests, production build, Chromium installation and browser smoke. Vitest explicitly rejects empty runs; Playwright retains its default empty-run failure and a concrete Chromium project. `scripts/ci-test.sh` and its positive-count/assembler-import protection are unchanged. Both doc gates retain independent `!cancelled()`/successful-install conditions. Feature, CI/env and docs are separate commits. Clean installation succeeded and all 503 pre-existing installed dependency records, including platform metadata, compare exactly to the parent lockfile.
- **Docs:** HLD cookie boundary now agrees with ADR-0006. LLD documents session cancellation, proxying, built preview, isolated databases and commands. Status distinguishes local desktop verification from pending remote CI and actual-phone acceptance. Deferred S1 service-worker handling, S2 WaterChange parser work and S3 trusted-phone/PWA checks belong to later tickets and are not ticket 01 failures.

## Independent validation

Node 24.11.1, macOS arm64:

- `npm run typecheck`: passed in both workspaces.
- `npm run lint`: passed in both workspaces.
- `npm run build:web`: passed; production frontend rebuilt before Chromium execution.
- `npm run test:web`: 7 passed.
- `bash scripts/ci-test.sh`: 56 passed against isolated `fishtank_test`.
- `node --test 'scripts/**/*.test.mjs'`: 15 passed, including false-pass regression tests.
- `npm run test:browser`: 2 Chromium tests passed against the real API and isolated MongoDB.
- `bash scripts/check-status-claims.sh`: passed.
- `npm ci`: passed; subsequent direct assembler import passed; lock preservation comparison passed.
- Cleanup refusal and post-suite empty database checks: passed.

No source edits, commits, pushes, PR or protection changes, or subagents. Only this review report is retained.

Not checked: remote GitHub CI, actual phone/LAN trust, PWA installation, deferred Tank/WaterChange screens, source-blind exploratory QA, and a fresh full formatting run. Those remain outside this ticket review or with the orchestrator before merge. Existing install audit reports 23 moderate findings; no dependency upgrades were attempted.
