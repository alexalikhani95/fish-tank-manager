# Review 04: Tanks behind auth (commit 1894982)

Reviewer: strict review of ticket 04 against spec.md, ADR-0006, ADR-0009.

## Findings

### 1. important: ownership test proves the status, not that the other User's Tank was untouched

`app/tests/functional/tanks.spec.ts:158-177`. The test only asserts `404` for get, patch and delete of the other User's Tank. It never re-reads the Tank afterwards.
Failure scenario: a later change to `update`/`destroy` that writes first and checks ownership second (e.g. `findByIdAndUpdate(id, ...)` then `if (!doc.userId.equals(ctx.userId)) return 404`, or `findByIdAndDelete` then a 404 on owner mismatch) still returns 404, so this test stays green while one User renames or deletes another User's Tank. Fix: after the loop, `assert.equal((await Tank.findById(theirs.id))?.name, 'Not yours')`.

### 2. minor: the second User is logged in but its login is never used, so the 404 has no positive control

`app/tests/functional/tanks.spec.ts:159`. `createLoggedInUser(client, 'other@example.com')` logs the other User in, but `other.login` is thrown away. Nothing shows the Tank is reachable by its real owner, so the 404 for the keeper could come from the Tank itself being unreachable.
Failure scenario: a change that makes `show` 404 for everyone on Tanks created a certain way (e.g. a schema change that breaks `findOne` on `userId` cast, or a wrong `userId` type on create in test setup) turns the ownership test into "everything is 404" and it stays green. Fix: `client.get(...).header('cookie', tokenCookie(other.login))` → 200 for the owner before the keeper's three 404s. That also gives the spec's "logs it in" a purpose. Otherwise drop the login and create the User with `User.create` only.

### 3. minor: Bearer test only checks the status

`app/tests/functional/tanks.spec.ts:193-197`. It asserts `200` on `GET tanks` and nothing else, and the keeper has no Tanks, so the body is `[]`.
Failure scenario: a middleware change that resolves the header to the wrong User (e.g. a stale `ctx.userId`, or matching on the wrong claim) still answers 200 with `[]`. The Bearer path is the one a future native client depends on (ADR-0006). Fix: create one Tank for `userId` and assert the listed names, as the list test does.

### 4. minor: the exact 401 body is a second literal in a second test file

`app/tests/functional/tanks.spec.ts:189` repeats `{ errors: [{ field: '', message: 'Unauthorized' }] }`, already held as `unauthorized` at `app/tests/functional/auth.spec.ts:11`. Using a literal in tests (not `UNAUTHORIZED_BODY` from source) is right, since it pins the contract. But two copies drift: a deliberate change to the 401 body gets updated in one spec and not noticed in the other until a red run. Fix: move `unauthorized` into `app/tests/helpers/auth.ts` next to the cookie helpers and import it in both specs.

## Checked and fine

- `app/start/routes.ts`: all five Tank routes (index, store, show, update, destroy) sit in one group with `.use(middleware.auth())`. Only `health`, `auth/register`, `auth/login`, `auth/logout` are outside an auth group; `me` GET/PATCH are behind auth. No routes are defined anywhere else (`start/routes.ts` is the only preload that registers routes).
- `app/app/controllers/tanks_controller.ts` is untouched by the commit; every query filters on `userId` from `ctx` (`find`, `create`, `findOne`, `findOneAndUpdate`, `findOneAndDelete`).
- `auth_middleware.ts` sets `ctx.userId = user._id` from the verified token's User, and holds the `HttpContext` augmentation, as the spec says.
- No-token test (`tanks.spec.ts:178-191`) covers all five routes, uses a valid-looking 24-hex id (`0123456789abcdef01234567`, so the `.where` regex matches and auth really runs), and asserts the exact 401 body with `assertBody` (deep equal).
- Bearer test sends no cookie: Japa's `ApiRequest` builds a fresh cookie jar per request, and the test sets only `.bearerToken(jwt)`.
- Create test asserts the Tank's `userId` is the logged-in User's id, so ownership comes from the token.
- List test still proves a User only sees their own Tanks (`['Newer', 'Older']`, excluding another owner's Tank).
- `DEV_USER_ID` and `current_user_middleware.ts` are gone from code, `start/env.ts` (incl. the now-unused `isObjectIdOrHexString` import), `start/kernel.ts`, `.env.example`, `.env.test`. `git grep` finds no mention outside `docs/` and `tickets/`. The tracked generated files under `app/.adonisjs/` never mentioned it and need no regeneration (route names did not change).
- Helper move: the four functions in `app/tests/helpers/auth.ts` are byte-identical to the removed ones apart from `export`. `auth.spec.ts` changed only in its imports; test and assertion counts are unchanged (127 `test(`/`assert` lines before and after). No auth test lost an assertion.
- Each test starts from empty `users` and `tanks` via `deleteMany` (never drop), per the spec.
- `npm run typecheck`, `npm run lint`, `npm test` (49 passed) all green; the test run left no stray files (`git status` clean apart from the pre-existing `tickets/` edits).
- Over-engineering: none worth cutting. `createLoggedInUser` is small and earns its place; two `group.each.setup` hooks could be one, but that is taste.

## For the docs pass

- `docs/design/lld.md:137` still describes `current_user_middleware.ts` and `DEV_USER_ID`; `lld.md:138` lists `DEV_USER_ID` and `COOKIE_DOMAIN` in the env list. Both are already on the spec's docs-pass list.
- Local, untracked `app/.env` (in this worktree and in the main checkout) still has `DEV_USER_ID=`; harmless now, but worth deleting. The worktree's `app/.env` has no `JWT_SECRET`, so `npm run dev` there fails at boot. That belongs in the PR's reminder to add `JWT_SECRET` to `app/.env`.
- `tickets/auth/spec.md` (`## Discovered`, ticket 04 entries) and `tickets/auth/log.md` are modified but uncommitted.

## Re-review (8f618c8)

- Finding 1 (important, ownership test proves status only): **fixed**. After the three 404s, `Tank.findById(theirs.id)` must still have the name `'Not yours'`. That catches a patch that wrote anyway (the PATCH body sets `'Mine now'`) and a delete that removed it (`after` would be null).
- Finding 2 (minor, no positive control): **fixed**. The owner's `GET` with `tokenCookie(other.login)` must answer 200 before the keeper's 404s, so `other.login` is now used.
- Finding 3 (minor, Bearer test checks status only): **fixed**. It creates the keeper's `'Mine'` and another owner's Tank, and `deepEqual`s the listed names to `['Mine']` with no cookie sent.
- Finding 4 (minor, duplicated 401 literal): **fixed**. `unauthorized` is now in `app/tests/helpers/auth.ts`, still as a literal, not `UNAUTHORIZED_BODY`. `auth.spec.ts` imports it and its local copy is gone, with every use unchanged. `tanks.spec.ts` uses it in `assertBody`.

Nothing weakened: only test files changed (3 files, +31/−7), no assertion was removed, and the controller and routes are untouched. Typecheck, lint and `npm test` (49 passed) are green, and the run left no stray files.

New findings: none.
