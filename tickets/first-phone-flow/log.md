file map · gpt-6.1-sol medium · n/a
scope agreed: signup and Tank creation, WaterChange history, trusted local HTTPS phone testing, browser smoke test
spec check · gpt-6.1-sol high · n/a
VERDICT spec blockers=0 total=3 file=tickets/first-phone-flow/checks/spec.md
minor findings S1-S3 clarified in spec and carried to implementation review
stop 1 awaiting approval
stop 1 approved
tickets drafted: 01 auth shell -> 02 Tanks -> 03 WaterChanges -> 04 installed phone verification
tickets check · gpt-6.1-sol high · n/a
VERDICT tickets blockers=0 total=1 file=tickets/first-phone-flow/checks/tickets.md
minor browser-origin clarification incorporated in ticket 01; require actual Secure-cookie proof
stop 2 awaiting approval
stop 2 approved
handoff: $develop --resume first-phone-flow; begin ticket 01, no implementation started
build 01 · gpt-6.1-sol high · n/a
build 01 local: auth shell, isolated Chromium cookie proof and CI wiring implemented; awaiting parent review, no merge/push
checks 01: 56 API + 7 frontend + 15 scripts + 2 Chromium; typecheck/lint/build/format/status gates; clean npm ci; original lock records preserved
review 01 · gpt-6.1-sol high · n/a
VERDICT review-01 blockers=0 total=0 file=tickets/first-phone-flow/checks/review-01.md
built 01 ce2f179b7e378e1afcdd1b3232460e75b783f279
build 02 · gpt-6.1-sol high · n/a
build 02 local: Dashboard, Add Tank and Tank detail on existing Tank API, pure volume conversion/display, browser Tank create/view/reload/deep-link, field errors, unconfirmed create, missing Tank and UK-gallon preference; awaiting parent review, no merge/push
checks 02: 56 API + 9 frontend + 15 scripts + 2 Chromium; typecheck/lint/build/format/status gates
review 02 fixes: status check counts in one row; Add Tank amount parsed once with non-finite litres rejected; no raw name cap (trimmed 1–80 field error); focus first invalid field; browser covers Tank-to-Tank switch without stale data, over-long name and 1e308 volume
build 03 · claude-opus-5-5 · n/a
build 03 local: WaterChange GET/POST behind auth-first Tank middleware, strict day/percent/note validation with test clock, derived lastWaterChangeAt, children-first Tank delete, parser keeps empty strings; screens split per file with shared Field; history, log form, dashboard/detail summaries; browser specs split auth/tanks/water-changes; awaiting review, no merge/push
checks 03: 76 API + 11 frontend + 15 scripts + 4 Chromium; typecheck/lint/build/format/status gates
review 03 fixes: ADR-0011 amended for convertEmptyStringsToNull off (lld links it); "history" → "log" in UI, aria labels, WaterChangeLog, tests and docs; App row re-dated, lld progress claim removed; Tank list aggregation matches userId and listed tankIds; form drops its grey hint for the Shell's role=status offline banner; auth.spec runs first as a Playwright project dependency; checks green, counts unchanged
build 04 · claude-opus-5-5 · n/a
build 04 local: vite-plugin-pwa manifest + stdlib-drawn PNG icons, shell-only worker (no runtime caching, /api denylisted, prompt-style updates wait for cold open); `npm run phone` = build + HTTPS LAN preview from gitignored .certs/ (PHONE_HTTPS_CERT/KEY); lld Phone access runbook (iPhone first), phone checklist, naive-user config; awaiting review, no merge/push; real-phone, naive-user and remote CI pending
checks 04: 76 API + 11 frontend + 15 scripts + 5 Chromium; typecheck/lint/build/format/status gates; clean npm ci with all 746 prior lock records unchanged; HTTPS preview verified with throwaway self-signed cert via curl --cacert (no trust change); removing the /api denylist fails the browser suite
