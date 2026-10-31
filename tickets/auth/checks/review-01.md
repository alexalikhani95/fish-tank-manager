# Review 01: register and GET me (commit 59128db)

Strict security review of ticket `tickets/auth/issues/01-register-and-me.md` against `spec.md`, ADR-0006 and ADR-0009.

## Findings

### F1 (minor) A validly signed token whose `sub` is not an ObjectId is a 500, not a 401

`app/app/middleware/auth_middleware.ts:37` passes `claims.sub` straight to `User.findById`. If `sub` is missing or not a 24-hex string, Mongoose throws a CastError, which escapes the middleware and becomes a 500 (or whatever the exception handler does with CastError) instead of the exact 401 body. Scenario: only reachable with a token signed by the real secret (a future ticket signing with a different subject, or a hand-made token in dev), so not exploitable without the secret. Fix: check `typeof claims.sub === 'string' && Types.ObjectId.isValid(claims.sub)` (and `typeof claims.tokenVersion === 'number'`) before the lookup, returning null otherwise.

### F2 (minor) `jwtVerify` does not require `exp` or `sub`

`app/app/services/auth_token.ts:45`. `algorithms: ['HS256']` is pinned, so `alg` confusion (`none`, RS256 with the secret as a public key, HS512) is closed; good. But jose only checks `exp` if it is present. Scenario: any token ever signed with `JWT_SECRET` without `setExpirationTime` (a future command, a test helper copied into app code, a debugging script) is valid forever, contradicting the fixed 30-day rule in the spec. Fix (one option): `jwtVerify(token, secret, { algorithms: ['HS256'], requiredClaims: ['exp', 'sub'] })`. Defence in depth only; today the only signer sets `exp`.

Confirmed by hand (server booted on :3399 against a throwaway `fishtank_review01` database, since dropped): a token signed with the test secret and no `exp` gets `GET me` 200. F1 also confirmed: a validly signed token with `sub: 'nope'` returns a Mongoose `CastError` body (500 path), not the 401 body.

### F3 (minor) An empty `token` cookie falls through to the bearer header

`app/app/middleware/auth_middleware.ts:28-30`. Adonis `request.plainCookie` returns `'' || undefined` for `token=`, so `??` moves on to the header. Confirmed: `Cookie: token=` plus a valid `Authorization: Bearer` gives 200. The spec says "cookie if present, else bearer; only one is ever tried". Scenario: low impact (the bearer is still fully verified, so no bypass), but it breaks the stated "only one" rule and the existing "tries only the cookie" test would not catch it. Fix: decide presence on the raw cookie (e.g. `request.cookiesList()` has the key) rather than truthiness, or accept and say so in the spec.

### F4 (minor) Closed sign-up answers malformed JSON with 400, not 403

`app/start/kernel.ts:35` (global bodyparser) runs before `AuthController.register`'s `User.exists` check (`app/app/controllers/auth_controller.ts:16`). Confirmed: with a User present, `POST auth/register` with `content-type: application/json` and body `{bad` returns 400 with the parser's `SyntaxError` (and, in dev, a stack trace), not the exact 403. The ticket says "the exact 403 body, even for an invalid body". It leaks nothing about the account (the same 400 happens while sign-up is open), so this is a wording gap more than a hole; either note in the spec that "invalid" means schema-invalid, or accept. Not worth moving the bodyparser for.

### F5 (minor) Bearer scheme is matched case-sensitively

`app/app/middleware/auth_middleware.ts:30` uses `startsWith('Bearer ')`. RFC 7235/9110 auth schemes are case-insensitive; confirmed `Authorization: bearer <valid jwt>` is a 401. Scenario: a future native client or HTTP library that sends `bearer` is locked out with no hint. Fix: `/^Bearer (.+)$/i`. Not a security issue (fails closed).

### F6 (minor) "Unknown keys stripped" test does not prove `tokenVersion` was stripped

`app/tests/functional/auth.spec.ts:71-78` sends `tokenVersion: 7` but only asserts `volumeUnit` is `'L'`. If the schema stopped stripping and the controller spread the body into `User.create`, `tokenVersion: 7` would be stored, signed into the cookie, and `GET me` would still work: the test stays green. Today the controller passes only `{ email, passwordHash }` (`auth_controller.ts:23`), so the code is correct; the test just doesn't pin it. Fix (black-box): also send `passwordHash: 'x'` and then prove the sent password still works once login lands (ticket 02), or assert `GET me` with a token signed for `tokenVersion: 0` succeeds.

### F7 (minor) "Tries only the cookie" test does not check the exact 401 body

`app/tests/functional/auth.spec.ts:217-226` asserts status only. Every other 401 test asserts `unauthorized`; this one should too, so a future change that, say, throws (500 with a 401 status set elsewhere) or returns a different message is caught. One line.

## Checked and fine

- **Algorithm pinning:** `jwtVerify(token, secret, { algorithms: ['HS256'] })` (`auth_token.ts:45`). Confirmed an HS512 token signed with the same secret is a 401. jose rejects `alg: none` in `jwtVerify` regardless, and a `Uint8Array` key can't be used as an RSA/EC public key.
- **tokenVersion and deleted User:** `!user || user.tokenVersion !== claims.tokenVersion` (`auth_middleware.ts:37-38`); a token missing the claim compares `undefined !== 0` and fails closed. Tested black-box.
- **Cookie:** raw on both sides (`encode: false` / `encoded: false`); every attribute explicit; `domain: ''` emits no `Domain`. Real header: `token=<jwt>; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`. The test asserts the exact attribute set and the round trip proves the value is raw.
- **Closed sign-up:** `User.exists({})` runs before `credentialsSchema.parse`; tested with `{}` and with valid credentials; no cookie set. `text/plain` and form bodies on a closed sign-up get the 403.
- **409:** `MongoServerError` code 11000 maps to the exact body; untested, as the spec accepts.
- **JSON only:** `form.types: []`, `multipart.types: []`; form-encoded register is a 400 with no cookie (tested). Remaining JSON types are not CORS-safelisted, so a cross-site form can't reach the parser.
- **No password trimming:** `trimWhitespaces: false`, `passwordRule` has no `.trim()`; 11 chars + space is 201 (tested). Email trimmed and lowercased by Zod (tested).
- **User JSON:** `toJSON` transform drops `passwordHash`, `tokenVersion`, `__v`; test asserts the exact key set.
- **JWT_SECRET at boot:** by hand, `node --import=@poppinss/ts-exec bin/server.ts` with no `JWT_SECRET` and with a 31-character one both exit with "JWT_SECRET must be at least 32 characters"; with 32 characters it boots and `/health` is 200. `.env.example` has the generation comment; `.env.test` has a 42-character value.
- **Hash:** provider registered in `adonisrc.ts`, `config/hash.ts` scrypt with Adonis defaults.
- **Context typing:** `user` and `userId` declared in `auth_middleware.ts`, removed from `current_user_middleware.ts`; `DEV_USER_ID` and its middleware still in place for Tanks.
- **Exports:** `emailRule`, `passwordRule` exported from `app/app/validators/auth_validator.ts`.
- **Lockfile:** adds `jose@6.2.14` with `resolved` + `integrity` (zero dependencies). The removed entries (`@vinejs/vine`, `@vinejs/compiler`, `validator`, `camelcase`, `dayjs`, `dlv`, `normalize-url`, `@types/validator`) were all `optional: true, peer: true`, not installed, and not imported anywhere in `app/`. Safe, though unrelated churn from npm pruning optional peers.
- **Over-engineering:** none worth cutting. `config/hash.ts` restates scrypt defaults, which is the Adonis stub; fine.
- **Gates:** `npm run typecheck`, `npm run lint` clean; `npm test` 30/30 passed.

## Verdict

No blockers. Seven minor findings; F1 and F2 are the ones worth fixing before ticket 02 reuses this code (both one-liners in the verify path). F3 deviates from the spec's "only one is tried" wording and needs either a fix or a spec note.

## Re-review (25fa49f)

Gates on 25fa49f: `npm run typecheck` and `npm run lint` clean, `npm test` 32/32 passed.

- **F1 fixed.** `auth_middleware.ts:37` now returns null unless `isObjectIdOrHexString(claims.sub)` and `typeof claims.tokenVersion === 'number'`. Using `isObjectIdOrHexString` instead of `isValidObjectId` is right: checked by hand, it rejects `'nope'` and the 12-character `'aaaaaaaaaaaa'` and accepts a 24-hex id. Tested black-box (`sub: 'nope'`, `tokenVersion: '0'`), exact 401 body.
- **F2 fixed.** `auth_token.ts:45-48` adds `requiredClaims: ['exp', 'sub']` next to `algorithms: ['HS256']`. Tested with a signed token that has no `exp`, exact 401 body.
- **F3 fixed.** `auth_middleware.ts:29-33` checks `TOKEN_COOKIE in request.cookiesList()`, so an empty `token=` counts as present and is a 401 even with a valid bearer (tested). `cookiesList()` returns the raw parsed header, the same value `plainCookie(..., { encoded: false })` gave, so the raw-cookie rule still holds. With no cookie header it is `{}`, so the bearer path still works (the existing bearer test passes).
- **F4 accepted** (noted in `spec.md` → `## Discovered`), not re-checked.
- **F5 fixed.** `/^Bearer (.+)$/i` matches the scheme in any case; `bearer <jwt>` is 200 (tested). Extra spaces or a missing token still fail closed.
- **F6 moved to ticket 02**, not re-checked.
- **F7 fixed.** The cookie-only test now asserts the exact `unauthorized` body for both cookies.

### New findings

#### N1 (minor) Spec's "only tokens tests build themselves" line is now out of date

`app/tests/functional/auth.spec.ts:32-37` (`signWithTestSecret`) and the new test "is a 401 for a signed token with a bad subject or no expiry" build three more tokens (bad `sub`, no `exp`, string `tokenVersion`). `spec.md` → Testing Decisions still says expired and tampered tokens "are the only tokens tests build themselves." Scenario: a later ticket's implementer reads the spec and treats these tests as off-spec, or deletes them. The tests are right; the spec needs one line (in `## Discovered` or Testing Decisions). No code change.

No other new issues: the fix adds no dependency, keeps HS256 pinning, keeps the tokenVersion and deleted-User checks, and the cookie still fails closed.
