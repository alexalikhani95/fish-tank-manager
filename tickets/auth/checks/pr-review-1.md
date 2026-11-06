# PR review 1 — feature/auth (PR #6)

Whole-branch review of `git diff origin/main...HEAD` (base c71dab1, 19 commits) against `tickets/auth/spec.md`.
Two axes per `/code-review`: Standards and Spec. Per-ticket reviews live in `checks/review-0*.md`; this pass looks for cross-ticket problems, user-story gaps, doc/code drift and AGENTS.md convention breaks.

Status: complete — see Summary at the end.

## Findings

### Own checks (whole-branch, written first)

- **F1 — minor — `docs/design/hld.md:13`: the box diagram is broken.** Swapping "JWT guard" for "JWT middleware" kept the old padding, so the right `│` sits 6 columns past every other row of the box. Scenario: anyone reading hld.md in a monospace view sees a jagged API box. Fix: drop 6 spaces before the closing `│`.
- **F2 — minor — process: ticket 03 (`f01f2d6`, `PATCH me`) never had a per-ticket review.** `tickets/auth/log.md` goes `build 03 → built 03` with no `review 03`, and there is no `checks/review-03.md`. The ticket says `Risky: no`, but `/develop`'s own rule counts "a published API" and "a file several tickets share" as risky, and ticket 03 adds a public route and edits `app/start/routes.ts` and `app/.adonisjs/server/routes.d.ts`, which tickets 01, 02 and 04 also edit. I read `app/app/controllers/me_controller.ts` and `app/app/validators/user_validator.ts` for this pass and found nothing wrong in them, so this is a process note, not a code defect. Scenario: the PR's `## Checks` block reads as if every ticket was reviewed.
- **Checked, fine:** `scripts/check-status-claims.sh` passes. No stale `REGISTRATION_OPEN`, `DEV_USER_ID`, `COOKIE_DOMAIN`, `ctx.auth` or guard wording is left in living docs or code (ADRs keep theirs, and that is correct). The `lld.md` `users` table matches `app/app/models/user.ts`. `createLoggedInUser` moved to `app/tests/helpers/auth.ts` as `docs/patterns.md` says. `routes.d.ts` lists the auth and `me` routes. The PR body reminds the keeper about `JWT_SECRET` and records the hand check of a missing or 31-character secret, as the spec asks.

## Standards

From the Standards sub-agent. I checked its line numbers and corrected one: the `lld.md` line is 139, not 342. Its point 5 is the same as F1 above, so it is not counted again.

- **S1 — important (judgement) — a reversed choice has no ADR.** AGENTS.md → Conventions says "anything that reverses or constrains an earlier choice gets an ADR in `docs/adr/`".
  - Replacing `REGISTRATION_OPEN` with sign-up that closes by itself reverses what `PLAN.md`, `hld.md` and `lld.md` said before. It is now recorded only in the spec and in `docs/design/lld.md:114`.
  - The JSON-only body parser and `trimWhitespaces: false` (`app/config/bodyparser.ts:14-37`) bind every future schema to trim its own strings. That rule lives only in lld.
  - Scenario: someone who reads only the ADRs adds a form-encoded route, or a Tank `brand` field with no `.trim()`, and never learns either rule. (The rule was decided at the spec stage, so this is about where it is recorded, not about the code.)
- **S2 — minor — vocabulary.** CONTEXT.md lists Keeper and Owner under _Avoid_ for the User, but the tests use them as variable names:
  - `app/tests/functional/tanks.spec.ts:18` `const keeper`
  - `app/tests/functional/tanks.spec.ts:~156` `const owner`
  - `app/tests/functional/set_password.spec.ts:70` `const keeper`
  - Scenario: the next test copied from `docs/patterns.md` (which points at `tanks.spec.ts`) spreads the word further.
- **S3 — minor — env wiring is folded into feature commits.** AGENTS.md → Commit discipline says to "keep deploy/infra work in its own commit — … env wiring". Commit `59128db` adds `JWT_SECRET` to `start/env.ts`, `.env.example` and `.env.test`, and commit `1894982` removes `DEV_USER_ID`. A squash merge makes this mostly moot, and fixing the history would need a rebase, which needs the user's go-ahead.
- **S4 — minor — one home per fact.** The "`JWT_SECRET` at least 32 characters" rule is written in `docs/design/lld.md:139` and again in `PLAN.md:77`. `app/start/env.ts:26-31` enforces it. `PLAN.md` should link to lld instead of restating the rule.
- **S5 — minor — AGENTS.md is out of date.** Its directory map and its "Where to look" table don't list the new `docs/patterns.md`. Only `docs/agents/workflow.md:30` points to it. AGENTS.md calls itself the agent entry point, so an agent starting there never finds the patterns.
- **S6 — minor (smell: Duplicated Code) — the unit enums are written twice**: `app/app/models/user.ts:13-14` and `app/app/validators/user_validator.ts:6-7`. Scenario: a unit added to the validator but not to the model passes Zod, then fails Mongoose's enum check on `user.save()`, which is a 500 and not a 400. Fix: export the lists from one place, as lld plans for `PARAMETERS`.
- **S7 — minor (smell: Duplicated Code / Primitive Obsession) — the error envelope is built by hand in three places**: `app/app/services/auth_token.ts:12` and `app/app/controllers/auth_controller.ts:17` and `:27`. Only the 401 body has a single home.
- **S8 — minor (smell: Duplicated Code) — `app/commands/set_password.ts` repeats one refusal pattern four times** (`logger.error`, then `exitCode = 1`, then `return`, at lines 26-28, 35-37, 40-42 and 52-54). The file is the copy template in `docs/patterns.md`, so new commands will copy the repetition.
- **S9 — minor (smell: Mysterious Name) — `app/tests/helpers/auth.ts:37` exports a bare `password`** from a shared module. `testPassword` would say what it is.

## Spec

From the Spec sub-agent. I checked its line numbers and narrowed P1: `GET me` does pin its key set, at `auth.spec.ts:277`, against the register keys pinned at `:26`. Its item (c) is the same as F1, so it is not counted again.

**Checks it ran:** `npm run typecheck` clean, `npm run lint` clean, `npm test` 56 passed (56) in 3 s. The run left no stray files.

**Verdict:** All 32 user stories and every Implementation Decision have code behind them. That includes:

- the exact 401, 403 and 409 bodies;
- the cookie attributes and the raw value, with clearing using the same options;
- 403 on register before the body is validated;
- the strict `PATCH me` schema;
- `trimWhitespaces: false`, and the form and multipart parsers off. The `text/*` raw parser still yields an empty body, so the CSRF defence holds;
- the User JSON shape;
- `JWT_SECRET` checked at boot;
- `DEV_USER_ID` gone;
- the hash provider registered, and the `#commands/*` alias;
- the `user:set-password` order.

Every Testing Decision case exists, including bearer tests for both `me` and `tanks`. The design-doc list was done and matches the code. The "accepted" items in `## Discovered` are as described there.

- **P1 — minor — `app/tests/functional/auth.spec.ts:453-454`: the `PATCH me` response has no exact key set.** The spec says "`GET`/`PATCH me`, including an exact key set with no `passwordHash` or `tokenVersion`". `PATCH me` only checks that `passwordHash` and `tokenVersion` are absent. Scenario: a later change returns `user.toObject()` or a `.lean()` result from `update`. `__v`, or a new internal field, then leaks on `PATCH me` only, and no test fails. Fix: `assert.sameMembers(Object.keys(body), Object.keys(registered.body()))`, as at `:277`.
- **P2 — minor — `app/tests/functional/auth.spec.ts:19, 150, 262, 364, 435`: these groups clear only `User`.** The spec says "Each test starts from empty `users` and `tanks` collections". Today no auth test reads Tanks, so nothing breaks. Scenario: a future `me` test that counts or lists Tanks inherits rows left by an earlier test.

**Scope creep: none harmful.** The extras all fit the spec or an ADR:

- the Bearer scheme is matched in any case;
- an empty `token=` cookie is a 401;
- `exp` is required on every token;
- the "Login token" entry in CONTEXT.md;
- the PLAN.md Phase 2 follow-up item;
- `docs/patterns.md`.

## Summary

- **Own checks:** 2 findings, both minor. The worst is F2: ticket 03 was never reviewed.
- **Standards:** 9 findings (1 important, 8 minor). The worst is S1: sign-up that closes by itself and JSON-only body parsing with no trimming change earlier choices, but have no ADR.
- **Spec:** 2 findings, both minor. The worst is P1: `PATCH me` doesn't pin its key set.
- **Blockers:** 0. **Total:** 13.

Status: done.
