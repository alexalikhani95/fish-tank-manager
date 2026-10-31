# Review 02: login and logout (commit d102a64)

Strict security review of `tickets/auth/issues/02-login-and-logout.md` against `spec.md` (Implementation Decisions, Testing Decisions, `## Discovered`), ADR-0006, ADR-0009, AGENTS.md and CONTEXT.md.

Gates on d102a64: `npm run typecheck` and `npm run lint` clean, `npm test` 41/41 passed.

By hand: server booted on :3398 against a throwaway `fishtank_review02` database (since dropped; the untracked `routes.json` it created was deleted and the tracked `routes.d.ts` it rewrote was restored).

## Findings

### F1 (important): the first unknown-email login in each process does `hash.make` and `hash.verify`, so it takes about 2x as long

`app/app/controllers/auth_controller.ts:41` and `:55-59`. The dummy hash is memoised lazily, and only the unknown-email branch awaits `dummyHash()`. So the first unknown-email request in a process pays for one scrypt `make` plus one `verify`, and a wrong-password request pays for one `verify`. This is a found-vs-not-found difference in work, which is exactly what the ticket rules out.

Measured on fresh processes, with the controller already imported by a logout first:

| Request           | Time         |
| ----------------- | ------------ |
| 1st unknown email | 56 ms, 61 ms |
| 2nd unknown email | 26 ms        |
| wrong password    | 27 ms        |

If the first request was a wrong password, it took 35-38 ms (warm-up), and the first unknown email after it still took 52-56 ms.

Failure scenario: ADR-0004 runs the API on Lambda. A single-keeper app sits idle most of the time, so execution environments are recycled often, and each new one is a fresh process. An attacker who sends one probe after each idle gap lands on a fresh process nearly every time. Each probe for an unknown email then costs an extra scrypt (tens of ms on Lambda CPU). That difference is systematic, so averaging over probes tells real emails apart. A second, smaller issue: if `hash.make` ever rejects, the rejected promise stays cached. Every unknown-email login would then return 500 until restart, while a wrong password still returns 401, so the two responses would differ.

Fix (one line, keeps the dummy tied to the live hash config): await the dummy on every login before branching.

```ts
const fallback = await dummyHash();
const valid = await hash.verify(user?.passwordHash ?? fallback, password);
```

Or start `hash.make` at boot (preload or provider) instead of on first use. Don't hard-code a hash string: it would drift silently if `config/hash.ts` params change.

### F2 (important): the review-01 F6 test still doesn't prove `tokenVersion` was stripped

`app/tests/functional/auth.spec.ts:79-92`. The test now sends `passwordHash: 'x'` and logs in with the real password. That does prove `passwordHash` was stripped: a stored `'x'` fails PHC parsing, `verify` returns false, and the result is a 401. The `GET me` step proves nothing about `tokenVersion`, though. If `tokenVersion: 7` were stored, `setTokenCookie` would sign `tokenVersion: 7`, the middleware would compare it with the stored `7`, and `me` would return 200. The comment "passwordHash and tokenVersion were stripped" claims more than the test shows.

Failure scenario: someone changes register to `User.create({ ...body, passwordHash })`, or switches the schema to `.passthrough()`. Then a caller can pick their own `tokenVersion`, and the test stays green. `spec.md` → `## Discovered` says ticket 02 owes this proof.

Fix (black-box, in the existing `signWithTestSecret` style): after register, sign `new SignJWT({ tokenVersion: 0 }).setSubject(id).setExpirationTime('1h')` and assert that `GET me` returns 200. Only a stored `tokenVersion` of 0 passes.

### F3 (minor): nothing guards the dummy-verify rule against regression

`app/app/controllers/auth_controller.ts:41-42`. The identical-401 test (`auth.spec.ts:298-318`) checks status, body and the token cookie. If someone rewrote login as `if (!user) return response.unauthorized(UNAUTHORIZED_BODY)` before the verify, every test would still pass. The spec's Testing Decisions rule out testing hashing directly, and timing tests are flaky, so this is accepted. The code comment on line 40 is the only guard. It's worth naming this gap in the ticket's comments so a later refactor knows that line is load-bearing.

### F4 (minor): the identical-401 test doesn't compare headers, only the token cookie

`app/tests/functional/auth.spec.ts:311-316`. The ticket asks for identical status, body and headers, with no Set-Cookie on either response. `tokenSetCookie` finds only lines that start with `token=`, and nothing compares other headers. Today they are identical. By hand, both responses send the same headers apart from `x-request-id` and `Date`: `content-type: application/json; charset=utf-8`, `content-length: 50`, and no `set-cookie`.

Failure scenario: a later change adds a header on one branch only (for example a `WWW-Authenticate` or a debug header on the not-found path), and the test misses it. Fix: assert `headers()['set-cookie']` is undefined on both, and deepEqual the headers with `x-request-id` and `date` removed.

### F5 (minor): logout accepts a cross-site form POST, so another site can log the keeper out

`app/start/routes.ts:29` and `app/app/controllers/auth_controller.ts:49-52`. Logout reads no body and needs no auth, so any content type reaches it. By hand, a `application/x-www-form-urlencoded` POST with no cookie gets 204 plus the clearing Set-Cookie. A top-level cross-site form POST is a navigation, so browsers apply that Set-Cookie even for a `SameSite=Lax` cookie.

Failure scenario: a page the keeper visits auto-submits a form to `/api/v1/auth/logout`, and the keeper is logged out. That is a nuisance, not a data risk. ADR-0006 says "there are no form-encoded ... endpoints", and logout is effectively one. This follows from the spec's "needs no auth", so I suggest one line in `## Discovered` accepting it. A fix would be to require `content-type: application/json` on logout, which a cross-site form can't send.

### F6 (minor): `routes.d.ts` is stale in the commit

`app/.adonisjs/server/routes.d.ts` has been tracked since 59128db, but d102a64 doesn't add `auth.login` or `auth.logout`. Booting the server regenerates the file, adding both routes to `ALL` and `POST`, and that leaves a modified tracked file.

Failure scenario: the next session that runs `npm run dev` gets an unexplained diff and either sweeps it into an unrelated commit (against "Stage deliberately") or wastes time on it. Fix: commit the regenerated file with this ticket.

### F7 (minor): small gaps in what the tests prove

- `auth.spec.ts:338-350` (passwords never trimmed): the register status isn't asserted. The test still fails correctly if trimming comes back, but at the wrong line, with a confusing message. Add `assertStatus(201)`.
- `auth.spec.ts:407-428` (logout needs no auth): `'token=not-a-jwt'` is malformed, not tampered. The spec defines a tampered token as a real token with its signature altered. This is harmless because logout never reads the cookie, but it doesn't match the spec's wording.
- `auth.spec.ts:428-439` (signs out only this device): `registered` and `otherDevice` are usually byte-identical JWTs: same `sub`, same `tokenVersion`, and `exp` set in the same second. The "another token" framing is therefore cosmetic. The proof that `tokenVersion` was not bumped still holds, because both tokens still reach `me` after logout.

## Checked and fine

- **Wrong password and unknown email look the same:** same 401 status, the exact `UNAUTHORIZED_BODY`, and no `set-cookie`, both in the test and by hand. In steady state the timing is equal: 26.0-26.6 ms against 25.5-27.0 ms over 5 pairs.
- **The dummy hash is real and costs the same:** `hash.make` uses the default scrypt driver from `config/hash.ts`, and `verify` takes N, r and p from the PHC string, so the cost matches the stored hashes and follows any config change. `??=` is assigned synchronously, so concurrent first requests share one promise. The validation 400 happens before the lookup and doesn't depend on whether the email exists.
- **No branch skips work:** `verify` runs on both paths, and the only branch after it returns the identical 401. `scrypt.verify` catches its own errors and returns false, so nothing throws.
- **Logout:** returns 204, has no middleware, and works with no cookie, an expired cookie or a garbage cookie (tested). It reuses `COOKIE_ATTRIBUTES`. Real header: `token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`, with no Domain. The `Secure` set explicitly overrides `app.inProduction` in the merged defaults, which is the `## Discovered` concern. Logout doesn't touch `tokenVersion`: the same token still reaches `me` after logout (tested).
- **Form-encoded login:** returns 400 with field errors and no cookie, by hand and in the test.
- **Passwords are never trimmed:** `trimWhitespaces: false`, and `passwordRule` has no `.trim()`. The password with a trailing space gives 200, and the trimmed version gives 401 (tested). Email is trimmed and lowercased on login (the test sends `' Keeper@Example.com '`).
- **One source for the 401 body:** `UNAUTHORIZED_BODY` in `app/app/services/auth_token.ts:12` is the only copy in app code, used by the middleware and by login. The literal in `auth.spec.ts:11` is the test's expected value, which is correct for a black-box test.
- **Login success:** returns 200 with the User, with the same key set as register (which asserts the exact set). It reuses `setTokenCookie`, so there is no second signer. The cookie's attribute set is asserted exactly and it reaches `me`.
- **ADR-0006 and ADR-0009:** login sets the cookie and returns the User, not a token in the body. Logout is a real endpoint. There is still no `@adonisjs/auth`. No ADR conflict.
- **Vocabulary and commit:** uses User and keeper (CONTEXT.md), and the commit is Conventional with the right scope.
- **Over-engineering:** nothing worth cutting. `COOKIE_ATTRIBUTES` is the smallest way to keep set and clear in sync. Its `encode: false` is redundant for `clearCookie` (Adonis forces it) but harmless.

## Verdict

No blockers. F1 and F2 should be fixed before merge: F1 breaks the ticket's timing rule on every fresh process, which on Lambda means most probes, and F2 leaves review-01 F6 still unpaid. Both are one or two lines.

## Re-review (b96fb75)

Gates on b96fb75: `npm run typecheck` and `npm run lint` clean, `npm test` 41/41 passed. By hand: server on :3398 against a throwaway `fishtank_review02b` database (since dropped, and the untracked `routes.json` deleted).

- **F1 fixed.** `auth_controller.ts:42` awaits `dummyHash()` on every login before branching, so whichever login comes first in a process pays for `make`. Measured on 3 fresh processes per order:

  | Request on a fresh process | Time                |
  | -------------------------- | ------------------- |
  | 1st unknown email          | 58.4, 58.9, 58.4 ms |
  | 1st wrong password         | 58.7, 60.2, 62.8 ms |

  After the first request, both paths take 26-28 ms. One unknown email after a warm wrong password took 49.8 ms (noise: the other two runs were 26 ms). The cached-rejection 500 risk is gone too: a rejected `make` now fails every login the same way, whatever the email.

- **F2 fixed.** `auth.spec.ts:91-98` signs a token with `tokenVersion: 0` and requires `GET me` to return 200, which fails if a sent `tokenVersion: 7` were stored. The `passwordHash` leg is kept, and the comments now claim only what each step proves.
- **F3 accepted** (spec.md `## Discovered`), not re-checked.
- **F4 fixed.** `auth.spec.ts:322-330` asserts no `set-cookie` header at all on either response, and deepEquals all headers except `x-request-id` and `date`.
- **F5 accepted** (spec.md `## Discovered`), not re-checked.
- **F6 fixed.** The regenerated `app/.adonisjs/server/routes.d.ts` is committed with `auth.login` and `auth.logout`. Booting the server no longer leaves a modified tracked file (`git status` clean apart from the ticket docs).
- **F7 first bullet fixed.** The register step in the never-trimmed test now asserts 201. The other two bullets are left as is, as decided.

### New findings

None. The fix adds no dependency, keeps the single `UNAUTHORIZED_BODY`, keeps the dummy hash tied to the live hash config, and adds no branch that differs by email. The `withoutVolatile` helper is local to one test and small enough.
