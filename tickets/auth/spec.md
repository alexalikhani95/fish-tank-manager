# Auth

Status: ready-for-agent

## Problem Statement

The keeper can't log in. Today every API request acts as one fake User whose id is set in an env var (`DEV_USER_ID`). Anyone who can reach the API can read and change every Tank, and the app can't be deployed or installed on the keeper's phone until that changes.

## Solution

The keeper registers their User once with an email and password, then logs in and stays logged in on their phone for 30 days. Once that one User exists, sign-up closes by itself. Every Tank route needs a logged-in User, and a User only ever sees their own Tanks. The User carries the keeper's preferred volume unit and temperature unit, which the keeper can change. A forgotten password is reset from the server with one command, which also signs out every device.

## User Stories

1. As a keeper, I want to create an account with my email and a password, so that my Tanks are mine alone.
2. As a keeper, I want to be logged in straight after creating my account, so that I don't have to type my password twice.
3. As a keeper, I want sign-up to close as soon as my account exists, so that no stranger can make an account on my app.
4. As a keeper, I want sign-up to stay closed without me remembering to switch it off, so that a forgotten setting can't leave it open.
5. As a keeper, I want a closed sign-up to refuse every attempt the same way, so that it gives away nothing about my account.
6. As a keeper, I want my email accepted however I type its capitals or spaces, so that `Me@Example.com ` and `me@example.com` are the same login.
7. As a keeper, I want a password of at least 12 characters with no forced symbols or capitals, so that I can use a long passphrase.
8. As a keeper, I want a clear error naming the field when my email or password is invalid, so that I know what to fix.
9. As a keeper, I want to log in with my email and password, so that I can use the app on a new device.
10. As a keeper, I want the same error for a wrong password and an unknown email, so that nobody can find out which emails have accounts.
11. As a keeper, I want to stay logged in on my phone for 30 days, so that I'm not typing my password every time I log a WaterChange.
12. As a keeper, I want my login kept in a cookie the page's scripts can't read, so that a malicious script can't steal it.
13. As a keeper, I want another website to be unable to submit a form to my API using my login, so that my cookie can't be used against me.
14. As a keeper, I want to log out, so that this device no longer has access.
15. As a keeper, I want logging out to sign out only the device I'm on, so that my other devices stay logged in.
16. As a keeper, I want to be able to log out even when my login has already expired, so that a stale cookie is always cleared.
17. As a keeper, I want to see my own account (email and display units), so that the app can show my settings.
18. As a keeper, I want to choose litres, US gallons or UK gallons as my volume unit, so that Volumes show the way I think about them.
19. As a keeper, I want to choose °C or °F as my temperature unit, so that temperature Readings show the way I read them.
20. As a keeper, I want litres and °C as my defaults, so that a new account works without any setup.
21. As a keeper, I want an invalid unit, or a field that can't be changed, refused with a clear error, so that a typo doesn't look like a saved setting.
22. As a keeper, I want every Tank route to require me to be logged in, so that nobody else can see or change my Tanks.
23. As a keeper, I want a Tank that isn't mine to look like it doesn't exist, so that nobody can learn it exists.
24. As a keeper, I want an expired, tampered-with or revoked login refused, so that only a real, current login gets in.
25. As a keeper who forgot their password, I want to reset it on the server with `node ace user:set-password <email>`, so that I don't have to edit the database by hand.
26. As a keeper, I want that command to ask for the new password twice at a hidden prompt, so that it never lands in my shell history and a typo can't lock me out.
27. As a keeper, I want resetting my password to sign out every device, so that a lost phone loses access.
28. As a keeper, I want the command to refuse a too-short password, a mismatched confirmation or an unknown email with a clear message and change nothing, so that I can't lock myself out by mistake.
29. As a future native client, I want to send my login as an `Authorization: Bearer` header instead of the cookie, so that a mobile app can use the same API.
30. As a keeper, I want my password hash and internal counters never sent back by the API, so that they can't leak.
31. As a developer, I want the fake `DEV_USER_ID` User removed completely, so that there's no back door left in.
32. As a developer, I want the app to refuse to start without a strong `JWT_SECRET`, so that a missing secret can't be shipped.

## Implementation Decisions

- **Auth is one route middleware, not an `@adonisjs/auth` guard** (ADR-0009). It reads the `token` cookie if present, otherwise the `Authorization: Bearer` header. Only one is ever tried: a bad cookie is a 401 even if a valid header is also sent. It verifies the HS256 JWT with `jose` using `JWT_SECRET`, loads the User, and rejects if the token's `tokenVersion` doesn't match the User's. On success it sets `ctx.user` (the User document) and `ctx.userId`. The `HttpContext` type augmentation for both moves into the auth middleware, since the old `DEV_USER_ID` middleware that held it is deleted. The Tanks controller stays unchanged and keeps reading `ctx.userId`.
- **Token:** HS256 JWT with the User id as subject, the User's `tokenVersion` as a claim, and a fixed 30-day expiry. There is no refresh and no sliding renewal: the keeper logs in again after 30 days.
- **Cookie:** named `token`, with every attribute set explicitly on the cookie rather than taken from the app's cookie defaults (which are `secure` in production only and 2 hours long): `httpOnly`, `secure: true` in every environment, `sameSite: 'lax'`, path `/`, max age 30 days, and no `Domain` (host-only). Its value is the bare JWT, not passed through Adonis's cookie signing, encryption or encoding, because the JWT is already signed. The middleware reads it the same way, raw. It is set on register and login, and cleared on logout.
- **JSON only.** The `form` and `multipart` body parsers are removed. Photos upload straight to S3 by presigned URL, so nothing needs multipart. This makes true the "JSON-only API" half of ADR-0006's CSRF defence, which cookie auth relies on. A form-encoded body arrives as an empty body and fails validation.
- **Error bodies** use the existing validation envelope. A non-field error has `field: ''`, the same as the handler's whole-body rule. Exact bodies:
  - 401: `{ errors: [{ field: '', message: 'Unauthorized' }] }`
  - 403: `{ errors: [{ field: '', message: 'Sign-up is closed' }] }`
  - 409: `{ errors: [{ field: '', message: 'Email already registered' }] }`
- **401** covers any request to a protected route with no token, an invalid signature, an expired token, a `tokenVersion` mismatch, or a token whose User no longer exists. Login failures get the same 401 body.
- **Routes** (base `/api/v1`). The public ones are `auth/register`, `auth/login`, `auth/logout` and `health`. Everything else needs auth.
  - `POST auth/register` `{ email, password }`. If any User already exists it returns **403** before the body is validated, so a closed sign-up answers every request the same way. Otherwise it creates the User, sets the cookie and returns **201** with the User. A duplicate email caught by the unique index (only possible when two first sign-ups race) returns **409**.
  - `POST auth/login` `{ email, password }`. Correct credentials return **200** with the User and set the cookie. A wrong password or an unknown email returns the identical **401** (same status and body). An unknown email still runs a hash verify against a dummy hash, so the response time doesn't reveal whether the email exists.
  - `POST auth/logout` clears the cookie and returns **204**. It needs no auth, so an expired or tampered cookie is still cleared. It does not bump `tokenVersion`.
  - `GET me` returns **200** with the User.
  - `PATCH me` `{ volumeUnit?, temperatureUnit? }` uses a strict schema. An unknown key is a 400 naming that key. `volumeUnit` must be one of `L | usGal | ukGal`, and `temperatureUnit` one of `C | F`. An empty body is a 400 with `field: ''`. It returns **200** with the updated User.
- **Passwords are never trimmed.** The JSON body parser's default string trimming is turned off (`trimWhitespaces: false`); email is still trimmed by its Zod rule, and Tank names by theirs. The 12–256 length counts the password exactly as sent, and `user:set-password` uses the prompt value as typed, so a passphrase with a leading or trailing space works the same everywhere.
- **Validation** is Zod (ADR-0007), as with Tanks, and errors go through the existing exception handler. Email is trimmed, lowercased and must be a valid email. The password must be 12–256 characters, with length as the only rule. Register and login share one schema, which strips unknown keys like the Tank create schema does.
- **User model** follows the `users` table in `lld.md`: `email` (unique index, lowercased), `passwordHash`, `volumeUnit` (default `L`), `temperatureUnit` (default `C`), `tokenVersion` (default 0), plus timestamps. Its JSON matches how Tanks go out (Mongoose JSON with `_id`), but drops `passwordHash`, `tokenVersion` and `__v`: `{ _id, email, volumeUnit, temperatureUnit, createdAt, updatedAt }`.
- **Passwords** are hashed with Adonis's `hash` service, using the default scrypt driver. This needs the hash config and the hash provider registered in the Adonis rc file, both removed in PR #3 because nothing used them.
- **Sign-up closes automatically** once one User exists. There is no `REGISTRATION_OPEN` env var, and this replaces `lld.md` → Auth hardening's first rule.
- **`node ace user:set-password <email>`** works in this order:
  1. It normalises the argument with the same email rule as the API and looks up the User. An unknown email exits non-zero before any prompt.
  2. It asks `New password` and then `Confirm password`, both hidden.
  3. A mismatch, or a password outside 12–256 characters, exits non-zero and changes nothing.
  4. On success it sets the new hash and increments `tokenVersion`, which signs out every device.

  The command boots the app, since it needs Mongo and `hash`. It is importable from tests through a `#commands/*` import alias.

- **Env:** `JWT_SECRET` is required, at least 32 characters, and checked at boot.
  - `.env.example` gets `JWT_SECRET=` with a comment saying it must be at least 32 characters (e.g. `openssl rand -base64 48`).
  - The test env file gets a fixed value of 32 or more characters.
  - The PR description reminds the keeper to add it to their local `app/.env`.
  - `DEV_USER_ID` is removed from the env schema, `.env.example` and the test env, along with the middleware that read it.
  - `COOKIE_DOMAIN` is not added, because the cookie is host-only.
- **Local data:** the ticket that removes `DEV_USER_ID` also deletes the Tanks in the local dev database (`fishtank_dev`), which belong to the old fake User. Nothing is deployed, so there is nothing to migrate.
- **Design docs** change in the same PR, in one docs pass after the last ticket (not per ticket). Until then, where `lld.md` or `hld.md` disagree with this spec or ADR-0009, the spec and ADR-0009 win:
  - `lld.md`:
    - API: auth scope, the status codes line (403 closed sign-up, 204 logout), the route notes.
    - Auth hardening: sign-up closes automatically, passwords 12–256.
    - Ownership check: `auth.user.id` → `ctx.userId`.
    - Framework wiring: middleware instead of guard, `jose`, no `@adonisjs/auth`, JSON-only body parsing, an env list without `DEV_USER_ID` and `COOKIE_DOMAIN`, and remove the `DEV_USER_ID` stub line.
  - `hld.md`:
    - the Auth paragraph (middleware, ADR-0009);
    - the Validation paragraph (no `REGISTRATION_OPEN`);
    - the PWA row ("Holds the JWT" → the browser holds an httpOnly cookie);
    - the "403 is unused in v1" line, which now covers closed sign-up.
  - `PLAN.md`: reword the Auth item to match (middleware, ADR-0009, sign-up closes automatically) and tick it.
  - `docs/status.md`: the App row, and the ADR range in the Product plan row (now up to ADR-0009).

## Testing Decisions

- **Good tests check what a caller sees,** not how it works inside: status codes, response bodies, and the `Set-Cookie` header. The middleware, token signing and hashing are not tested directly, so they can change freely. Test setup may use the models directly (create a second User, bump `tokenVersion`, delete a User), as the Tanks tests already do.
- **How tests carry the cookie:** read the raw `token=<jwt>` value from the response's `Set-Cookie` header and send it back as a raw `cookie` header. Japa's cookie helpers sign or encode values, so they don't fit a bare JWT. One test checks the cookie's attributes: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, a 30-day `Max-Age`, and no `Domain`.
- **Seam 1, the HTTP API**, through Japa functional tests with the API client. This is the same seam as the existing Tanks tests, which are the prior art. It covers:
  - register, including closed sign-up returning 403 even for an invalid body;
  - login, including wrong-password and unknown-email responses being `deepEqual`;
  - a form-encoded login, which is not a 200 and sets no cookie;
  - logout, including with an expired or tampered cookie (still 204, cookie cleared);
  - `GET`/`PATCH me`, including an exact key set with no `passwordHash` or `tokenVersion`;
  - every 401 case: no token, tampered, expired, revoked, deleted User;
  - Tanks routes needing auth.
- **Seam 2, the `user:set-password` command**, run in-process from a test with its two hidden prompts answered by the test. Its effects are checked through Seam 1: the new password logs in, the old one doesn't, and a token from before the reset gets 401. It also covers an unknown email, a mismatched confirmation and a too-short password, each changing nothing.
- **Bearer fallback:** one test per route group (`me` and `tanks`) proves the `Authorization: Bearer` header works with no cookie (ADR-0006).
- **The Tanks tests switch from `DEV_USER_ID`** to a real logged-in User. The ownership test (another User's Tank is a 404) creates its second User directly through the model, since sign-up is closed, and logs it in.
- **Expired and tampered tokens:** tests sign a JWT with the test `JWT_SECRET` and a past expiry, or alter a real token's signature. These are the only tokens tests build themselves.
- **Each test** starts from empty `users` and `tanks` collections (`group.each.setup` + `deleteMany`, never dropping a collection, so the email unique index survives), as `tanks.spec.ts` already does.
- **Not tested automatically:**
  - the 409 duplicate-email race (accepted, see Further Notes);
  - boot refusing a missing or short `JWT_SECRET`, which is checked by hand (boot with none, and with 31 characters) and recorded in the PR.

## Out of Scope

- Web login and sign-up screens, and the Vite dev proxy (`web/` isn't started).
- Changing the password from inside the app, and deleting the User.
- Email verification and password reset by email (PRD → Not in v1).
- Rate limiting on login (`lld.md` → Auth hardening).
- Refresh tokens, sliding sessions, and a "log out everywhere" endpoint.
- A second User, sharing, or roles.
- Changing the Tank JSON shape (`_id` vs `id`).
- CI, deployment, and CloudFront cookie forwarding (Phase 2).
- Fish, Plants and cascade delete on Tanks.

## Further Notes

- **Race on first sign-up, accepted:** two different emails registering at the same instant on an empty database could both succeed. It can only happen in the moments before the keeper registers, and it's the same exposure the planned `REGISTRATION_OPEN` flag had.
- `JWT_SECRET` has to be added to each environment's secrets before deploy (Phase 2).
- Stories keep the keeper's word "account". In the model and the code, it is the User (`CONTEXT.md`).

## Stop 2 decisions

- Tickets approved as written (5 tickets).
