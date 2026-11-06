# Review — ticket 05 (`node ace user:set-password`, commit 077926c)

Reviewed `git show 077926c` against `tickets/auth/issues/05-set-password-command.md`, `tickets/auth/spec.md` (Implementation Decisions, Testing Decisions → Seam 2, `## Discovered`), ADR-0009, `AGENTS.md`, `CONTEXT.md`.

First note (written before exploring further): the command's order in `app/commands/set_password.ts:23-50` matches the spec (normalise → look up → refuse before prompt → two `prompt.secure` → mismatch → length → one `updateOne` with `$set` + `$inc`). Rules are imported from `#validators/auth_validator`, not copied. Findings below are appended as the review goes.

## Findings

### F1 · minor · the upper length bound has no Seam 2 test

`app/tests/functional/set_password.spec.ts:133-140` covers only a too-short password. The ticket's box says "a password outside 12–256 exits non-zero and changes nothing"; nothing runs the command with 257 characters. Failure scenario: someone swaps `passwordRule` in `app/commands/set_password.ts:40` for `z.string().min(12)` (or checks `password.length < 12` by hand) and every test stays green, while the command now accepts a password that login refuses (`credentialsSchema` caps at 256, `auth.spec.ts:98`), locking the keeper out. The spec's Seam 2 list names only "too-short", so this is on-spec; it is cheap to add (`'x'.repeat(257)` → `assertFailed()` + `assertUnchanged`).

### F2 · minor · an untrapped prompt hangs a terminal `npm test` forever

`app/tests/functional/set_password.spec.ts:20-27` traps prompts by their exact labels. If a prompt the tests don't trap is ever reached (a label edited in `app/commands/set_password.ts:32-33`, e.g. `'New password:'`, or a third prompt added), the real enquirer prompt runs inside the test process. Reproduced in a scratch copy of `app/` with one prompt left untrapped:

- stdin `/dev/null` (CI, most agent shells): the test fails at its timeout and the runner exits — fine.
- stdin a TTY (a person running `npm test` in a terminal): the test fails at its timeout, the summary prints (`Tests 1 passed, 1 failed`, `Time 5s`), and then the process **never exits** (still running after 120 s) — enquirer holds the terminal.

Nothing in this commit reaches an untrapped prompt today, so the suite is green and exits. Failure scenario: a later rename of a prompt label makes the keeper's local `npm test` hang after printing its results, with no hint why. A cheap guard is to make the real prompt throw in tests (e.g. in `createCommand`, replace `command.prompt.prompt` with a function that throws "untrapped prompt"), so any untrapped prompt fails at once instead of waiting on stdin. Optional; worth a line in the Discovered notes either way.

### F3 · minor · success is reported even if the update matched nothing

`app/commands/set_password.ts:46-50` ignores the `updateOne` result. If the User is deleted between the `findOne` (line 25) and the update, the command prints "Password set … Every device is signed out." and exits 0 while nothing changed. With one User and no delete route in v1 this cannot happen in practice; checking `matchedCount === 1` (or `findOneAndUpdate` in one step) would make the exit code honest. Accept or fix; not a blocker.

## Checked and fine

- **Order** (`app/commands/set_password.ts:23-50`): `emailRule.safeParse` → `findOne` → unknown/invalid email logs an error, sets `exitCode = 1` and returns before any prompt; then `New password`, `Confirm password` via `prompt.secure`; mismatch, then `passwordRule`, each exit 1 before any write; success is one `updateOne` with `$set: { passwordHash }` and `$inc: { tokenVersion: 1 }` — a single-document write, so the hash and the revocation land together.
- **Rules reused, not copied:** `emailRule`/`passwordRule` imported from `#validators/auth_validator`; no second regex or length check.
- **Never trimmed, never printed:** the command passes the prompt value straight to `hash.make`. Enquirer's password prompt (`enquirer/lib/prompts/password.js`) does not trim and echoes only `*`. The only output lines are the three error messages and the success line; none include the password.
- **Real `node ace` run** (expect-driven pseudo-TTY, `NODE_ENV=test`, `MONGO_URL=…/fishtank_test`, never `fishtank_dev`):
  - unknown email → error line, no prompt, **exit 1**, User unchanged;
  - `'  Keeper@Example.COM '` + mismatch → **exit 1**, hash and `tokenVersion` unchanged;
  - 11 characters twice → **exit 1**, unchanged;
  - Ctrl+C at the first prompt → **exit 1**, unchanged (enquirer prints an `ERR_USE_AFTER_CLOSE` stack on Node 26 — framework noise, not this code);
  - `' padded passphrase '` twice → **exit 0** in 0.6 s (the app terminates and Mongo disconnects; no hang), 19 asterisks shown, `tokenVersion` 0 → 1, new hash; login with `' padded passphrase '` → 200, with the trimmed `'padded passphrase'` → 401.
  - So the exit codes are real: Ignitor sets `process.exitCode = kernel.exitCode` and calls `app.terminate()` for non-`staysAlive` commands.
- **`startApp: true`** is needed and works (the real run above boots Mongo and `hash`). In tests `ace.create` skips the loading hook, so no second app is booted — the test process's already-booted app is reused.
- **Tests, black-box via HTTP:** success proves new login 200, old login 401 with the pinned body, pre-reset cookie 401 on `GET me`; each failure path uses `assertUnchanged` (old password 200 and old cookie 200); normalisation, never-trimmed (exact 200 / trimmed 401) and "no prompt before unknown email" (both traps still unused) are each a test. `tokenCookie` throws when no cookie is set, so the 401-after-reset cannot pass with a blank cookie.
- **Trap leaks:** the prompt is a kernel singleton. `runWith` re-traps both labels every time (a `Map.set` overwrites any leftover), and the one test that leaves traps unused clears them in `finally`. Nothing leaks into later tests; no other spec uses ace.
- **`createLoggedInUser` move:** byte-for-byte the same function and password, now exported from `app/tests/helpers/auth.ts`; `tanks.spec.ts` only lost the local copy and imports (`git diff 077926c~1 077926c -- app/tests/functional/tanks.spec.ts`). No assertion changed.
- **`#commands/*` alias** added as the ticket asks; `app/commands/` is auto-discovered, no rc or manifest change.
- **ADR-0009 / AGENTS.md / CONTEXT.md:** no conflict (no `@adonisjs/auth`, revocation through `tokenVersion`); code says "User" in identifiers and messages; no lld/hld/PLAN/status edits, as the ticket asks. `npm run typecheck`, `npm run lint`, `scripts/check-status-claims.sh` all green.
- **Over-engineering:** none worth cutting. Three small test helpers, each used several times; the command is 52 lines with one comment per non-obvious line.

## Flaky-run result

Three full `npm test` runs from the worktree root, foreground, Mongo container `fish-tank-manager-mongo-1` up (3 weeks):

| Run | Wall time       | Result               |
| --- | --------------- | -------------------- |
| 1   | 4 s (Japa: 3 s) | 55/55 passed, exit 0 |
| 2   | 4 s (3 s)       | 55/55 passed, exit 0 |
| 3   | 4 s (3 s)       | 55/55 passed, exit 0 |

No failure, no hang, no Mongo error. The final state of this branch does not cause the slow run.

What the evidence points to instead:

- **Mongo logged no errors today.** Its log does show node clients holding connections far longer than a 3 s run: one from 14:07:39 to 15:15:01, and four from 15:47:58/15:48:03 to 16:25. Those look like hung test processes that were later killed (the "Interrupted operation as its client disconnected" lines are the kill), not a Mongo problem. The "2 Mongo connection errors" were client-side and cannot be seen from the server.
- **Two ways to hang the runner, both reproduced in a scratch copy:**
  1. a spec that fails at import time (e.g. `#commands/set_password` before the alias exists, or a missing package): the runner prints the error and never exits, Mongo still connected (killed after 90 s). Already noted in `## Discovered`; it predates this ticket and is the likely cause of the coder's 17-minute run while the alias/command was being written;
  2. an untrapped prompt with a TTY on stdin (F2).
- **An orphaned dev server is still running from this worktree:** PID 28642 (`node … bin/server.ts`, parent `node ace serve` PID 28620, re-parented to 1), started 13:36:55, `MONGO_URL=…/fishtank_test`, listening on `[::1]:3333`. Probably left over from ticket 03's `routes.d.ts` regeneration (the spec's "boot `node ace serve` with `.env.test` loaded"). It does not touch the tests' HTTP traffic — the assembler gives the test server a random port (seen: 57916) — and it holds an idle connection to `fishtank_test`. It should be stopped (`kill 28620 28642`); I left it running because this review is read-only.
- **No other process uses `fishtank_test`** besides that orphan; `docker ps` shows only the one Mongo container on 27017.
- Side effect of this review: the real-command checks above changed the leftover `keeper@example.com` row in `fishtank_test` (new hash, `tokenVersion` 1). Every test deletes all Users first, so it has no effect on later runs.

## For the docs pass

- `lld.md`: add `node ace user:set-password <email>` (order: normalise → look up → two hidden prompts → mismatch / 12–256 → one `updateOne` with `$set` hash + `$inc tokenVersion`; exit 1 on every refusal) and the `#commands/*` alias.
- Note that the command boots the whole app, so it needs the full env (`MONGO_URL`, `JWT_SECRET` ≥ 32, `APP_KEY`, …) wherever it runs. With Lambda compute (ADR-0004) there is no server shell, so Phase 2 docs should say where the keeper runs it (a checkout with the production `MONGO_URL`).
- Testing notes worth keeping (some already in `## Discovered`): trap every prompt by its exact label; the ace prompt is a singleton; an untrapped prompt hangs a TTY run after the summary (F2); a spec that fails at import hangs the runner with Mongo connected.
- Stop the orphaned `node ace serve` (PIDs 28620/28642), and when regenerating `routes.d.ts` by booting the server, make sure it is stopped afterwards.

## Re-review (2eefb65)

- **F1 — fixed.** `refuses a password longer than 256 characters` (`set_password.spec.ts:140-147`) runs 257 characters through both trapped prompts, expects failure and `assertUnchanged`.
- **F2 — fixed.** `createCommand` (`set_password.spec.ts:16-26`) puts an own `prompt` method on the shared prompt that throws `untrapped prompt: …`. `#handlePrompt` in `@poppinss/prompts` checks traps first and only calls `this.prompt()` when nothing is trapped, so trapped prompts still work (all tests green), and an untrapped one now fails at once instead of waiting on a TTY. It stays on the singleton for the whole run, which is what every test wants.
- **F3 — fixed.** `set_password.ts:46-56` checks `matchedCount !== 1`, logs "No User … Nothing changed." and exits 1. The branch is untested, which is fine (the race can't be set up black-box).

### F4 · important · the unknown-email test no longer proves that no prompt fired

`app/tests/functional/set_password.spec.ts:113-121`. With no traps, a prompt reached before the lookup throws `untrapped prompt`, but `BaseCommand.exec()` catches every error and sets `exitCode = 1`. So `command.assertFailed()` passes, and `assertUnchanged` passes because nothing was written. The test is green whether or not a prompt fired.

Reproduced in a scratch copy of `app/` with `await this.prompt.secure('New password')` added as the first line of `run()`:

- running only this test (`--tests "refuses an unknown email before any prompt"`): **1 passed**, with `Error: untrapped prompt: New password` in the output;
- running the whole file, the other six tests fail. This test's only failure is the plugin's teardown `traps.verify()`, which trips on a trap leaked from the test before it. So its red depends on test order, not on what it checks.

The version before this commit did prove it (both traps still unused afterwards). Failure scenario: someone moves the prompts above the lookup, so the keeper types a new password twice before learning the email is wrong (spec step 1 broken). The unknown-email test stays green, and only unrelated tests catch it, and only by chance.

Fix, one line after `exec()`: `assert.isUndefined(command.error)` (the real refusal sets `exitCode` without throwing; an untrapped prompt leaves `command.error` set). Or assert the "No User with email" log line.

### Checks

- `npm test` once at 2eefb65: **56/56 passed**, 5 s wall (Japa 3 s), exit 0. `npm run typecheck` and `npm run lint` green.
- Learned while checking: `@japa/plugin-adonisjs` already runs `ace.prompt.traps.verify()` in every test's teardown, so the explicit `command.prompt.traps.verify()` in `runWith` repeats it. Harmless; for the docs pass, not a finding.
- I booted nothing long-running. The scratch copies are deleted and no `bin/test.ts` process is left. The orphaned `node ace serve` (PIDs 28620/28642) from before this review is still running; I left it alone.

## Re-review (7a0859b)

- **F4: fixed.** The unknown-email test (`set_password.spec.ts:118-130`) now also asserts `command.error` is undefined and that the "No User with email" line was logged. I re-ran the earlier regression in a scratch copy of `app/` (`await this.prompt.secure('New password')` as the first line of `run()`), with only this test selected. It now fails with `AssertionError: expected Error: untrapped prompt: New password to equal undefined`; at 2eefb65 the same setup passed. The log-line check adds a second, independent proof that the lookup refused the email.
- **The `runWith` rethrow weakens nothing; it makes the tests stricter.** A refusal sets `exitCode = 1` without throwing, so the mismatch, too-short and too-long tests still reach `assertFailed()`. Before this commit, an unexpected throw (an untrapped prompt, a hash or Mongo error) also gave exit 1 and passed those tests as a "refusal". Now it fails them. When it throws, `traps.verify()` is skipped. That only matters on a run that is already failing: the plugin's teardown `traps.verify()` still reports any leftover trap, and the next `runWith` overwrites both labels.
- **The per-command `flushLogs()` weakens nothing.** In raw mode the UI uses cliui's `MemoryRenderer`, whose `flushLogs()` really empties the buffer (the `ConsoleRenderer` no-op is not used). The new log assertion passing proves logs are still captured. `assertPasswordNotPrinted` now sees only the command under test, which is the one that matters; before, it also scanned earlier commands' lines.
- **New findings: none.**
- `npm test` once at 7a0859b: **56/56 passed**, 12 s wall (Japa 7 s), exit 0. The scratch copy is deleted and no test process is left running. The orphaned `node ace serve` (PIDs 28620/28642) from before this review is untouched.
