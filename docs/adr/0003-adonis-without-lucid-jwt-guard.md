# 0003. AdonisJS without Lucid; custom JWT guard over Mongoose

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

ADR-0002 makes MongoDB the only database. AdonisJS — the backend framework inherited from `home-manager` — is SQL-shaped in two places: **Lucid** (its ORM) and **`@adonisjs/auth`**, whose bundled user and access-token providers assume a Lucid model. Everything else in Adonis (routing, middleware, IoC, VineJS validation, `ace` commands, Japa HTTP tests, env validation) is database-agnostic, and the slim starter ships without Lucid.

The obvious alternative is a Mongo-native framework — NestJS with `@nestjs/mongoose` and Passport JWT — which needs no custom auth code but is a different framework from the one the process, skills, Docker image, and test patterns were built around.

## Decision

We will keep **AdonisJS (slim starter, no Lucid)** with **Mongoose** registered as a provider, and write a **custom JWT guard** for `@adonisjs/auth`:

- The guard implements Adonis's `GuardContract` — verifies an HS256 bearer token, loads the User from the Mongoose model, attaches it to `ctx.auth`.
- Tokens are stateless: 30-day expiry, secret from env, no token collection, no refresh tokens. Logout is the client discarding the token.
- Passwords hashed with Adonis's `hash` service (unchanged).

Alternatives considered:

- **NestJS + Mongoose** — rejected. Zero auth glue, but a second framework to learn, tool, and document while the `home-manager` process is still bedding in. The point of this project is proving the process on a second app.
- **Adonis with Postgres for `users` only** — rejected in ADR-0002.
- **Implement Adonis's `UserProviderContract` + access-tokens provider over Mongoose** — viable, ~150 lines, keeps opaque DB-backed tokens. Rejected in favour of JWT: a token collection is state that buys nothing for a single-user app; JWT is half the code.

## Consequences

- One "auth glue" ticket in Phase 1, ~80 lines plus tests. After that, auth is ordinary Adonis: `auth` middleware, `ctx.auth.user`.
- Tokens cannot be revoked server-side before expiry. Acceptable for v1 (single user, 30-day TTL). If revocation is ever needed, add a `tokenVersion` field on User checked by the guard — no token table required.
- Adonis docs and community examples assume Lucid; a reader will find `app/auth/guards/jwt.ts` surprising, hence this record.
- Anything else in the Adonis ecosystem that assumes Lucid (Bouncer's model hooks, `@adonisjs/lucid` seeders) is simply not used. Nothing in v1 needs them.
