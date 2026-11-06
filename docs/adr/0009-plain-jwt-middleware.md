# 0009. Plain JWT middleware instead of an `@adonisjs/auth` guard

- **Status:** Accepted
- **Date:** 2026-10-29

## Context

ADR-0003 keeps `@adonisjs/auth` for its `GuardContract` and writes a custom JWT guard over Mongoose; ADR-0008 brings the package back for that alone. The guard contract exists so an app can switch between several guards. This app has exactly one way to authenticate (the JWT cookie, with a bearer fallback per ADR-0006), so the contract buys nothing, and it costs a guard class, a user provider, `config/auth.ts` and a provider registration.

## Decision

We will authenticate with **one route middleware**: read the `token` cookie, else the `Authorization: Bearer` header, verify the HS256 JWT with `jose`, load the User, reject on a `tokenVersion` mismatch, and put the User on `ctx`. No `@adonisjs/auth`.

Everything else in ADR-0003 and ADR-0006 stands: stateless 30-day tokens, the cookie, `tokenVersion`, passwords via Adonis `hash`.

Alternatives considered:

- **Custom guard over `@adonisjs/auth`** (ADR-0003). Rejected: three files and a dependency to wrap one check. It earns its place only with a second guard.
- **Hand-written HS256 over `node:crypto`.** Rejected: a few lines saved, at the cost of owning signature and claim checks. `jose` has no dependencies.

## Consequences

- **Amends ADR-0003 and ADR-0008**: the "custom guard" and "`@adonisjs/auth` comes back" parts no longer hold.
- Handlers read the User from `ctx`, not `ctx.auth.user`. Adonis examples that assume `ctx.auth` don't apply.
- **Revisit** if a second way to authenticate arrives (API keys, OAuth): then the guard contract earns its place.
