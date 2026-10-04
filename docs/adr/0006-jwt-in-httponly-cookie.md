# 0006. JWT in an httpOnly cookie, still stateless

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

ADR-0003 built a custom JWT guard: HS256 bearer token, 30-day expiry, no token collection, "logout is the client discarding the token". `hld.md` said only "Token stored client-side" and never picked where, which left the first auth ticket to decide by default — in practice `localStorage`.

A 30-day bearer token in `localStorage` is the common SPA pattern and the one security guidance argues against: it is readable by any XSS, and nothing about it can be revoked before it expires. Current guidance for browser apps (IETF's browser-based-apps BCP, OWASP) is that the browser should not hold a long-lived credential — a server-set `httpOnly` cookie, or a short-lived in-memory access token with a rotating refresh token.

XSS defeats every client-side option for abuse during a session: with script execution an attacker can call the API from the page whatever we do. The question is blast radius — whether a reusable 30-day credential can be lifted off the device — not whether XSS is survivable.

`PRD.md` requires staying logged in on the phone, so an in-memory-only token is out without a refresh flow, and a refresh flow means a stored refresh token, which is exactly the state ADR-0003 avoided.

## Decision

We will deliver the JWT as an **`httpOnly; Secure; SameSite=Lax` cookie** set by the API, and keep the token itself stateless.

- `POST auth/register` and `POST auth/login` set the cookie and return the User, not a token in the body.
- The guard reads the cookie first and **falls back to the `Authorization: Bearer` header**, so the Capacitor / React Native path in `PLAN.md` → Stretch still works without touching the backend.
- `POST auth/logout` clears the cookie. A cookie the client cannot read is also one it cannot discard, so logout becomes a real endpoint.
- The JWT carries a **`tokenVersion`** claim matched against `User.tokenVersion`. The guard already loads the User to authenticate, so the check is free. Bumping the field invalidates every token that User holds — logout-everywhere, and recovery if the phone is lost.
- CSRF: `SameSite=Lax` blocks cross-site POSTs, the API accepts `application/json` only, and there are no form-encoded or `GET`-mutating endpoints. No CSRF token in v1.

Alternatives considered:

- **`localStorage` bearer token, 7-day expiry, plus `tokenVersion`** — rejected. Least work and revocable, but leaves a reusable credential where any XSS can read it, for no gain over a cookie.
- **In-memory access token + rotating refresh token in a cookie** — rejected for v1. The strongest posture and the closest to the published guidance, but it needs `POST auth/refresh`, a refresh-token collection, and reuse detection, which makes the API stateful and contradicts ADR-0003's central simplification. Revisit if this ever serves more than one keeper.
- **Server-side sessions** — rejected. A session collection is the state ADR-0002/0003 deliberately avoided.

## Consequences

- **Amends ADR-0003** in three places: the guard verifies a cookie _or_ a bearer token, not only a bearer token; logout is an endpoint, not a client-side discard; and the `tokenVersion` field that ADR-0003 listed as "if revocation is ever needed" is now part of v1.
- **The PWA cannot read auth state from storage.** There is no token in JavaScript, so the protected-route wrapper decides from `GET me` (401 → `/login`) instead of checking for a token. The `fetch` wrapper sends `credentials: 'include'`.
- **CloudFront must forward the `Cookie` header** to the Lambda function URL and must not cache authenticated responses. One cache-policy setting, but a real Phase 2 item — get it wrong and either auth breaks or one user's data is served to another.
- **Local development crosses origins.** Vite on `:5173` and the API on `:3333` are different origins, so dev needs either a Vite proxy (`/api` → the API, keeping it same-origin) or `SameSite=None` in dev only. The proxy is the better answer; production is same-origin behind CloudFront anyway.
- **Revocation is now possible** without a token table, at the cost of one integer per User.
- **Tests change shape.** Japa HTTP tests authenticate by cookie; keep one test per route group proving the bearer fallback still works, since that path is what a future native client depends on.
- **Revisit** if the app ever has more than one User (refresh-token rotation becomes worth its weight), or if a native client arrives and the bearer fallback proves awkward.
