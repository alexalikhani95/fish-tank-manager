# 0008. AdonisJS 7 `api` starter, stripped, instead of the v6 slim starter

- **Status:** Accepted
- **Date:** 2026-10-18

## Context

ADR-0003 chose AdonisJS's **slim starter** because it ships without Lucid. At scaffold time there was no slim kit for AdonisJS 7, and v6 — the only major with one — is the deprecated line, with an open-redirect advisory against it.

## Decision

We will scaffold from the **AdonisJS 7 `api` starter** and remove what ADR-0002/0003 rule out: Lucid, `@adonisjs/session` and shield. `@adonisjs/auth` comes back with the JWT guard, for the guard contract only. Everything else in ADR-0003 (Mongoose as a provider, custom JWT guard) stands.

Alternatives considered:

- **v6 slim starter** — rejected. Deprecated major with a known advisory; we would be upgrading before shipping.
- **Hand-assemble v7 from `@adonisjs/core`** — rejected. More wiring to own for the same result as deleting a few packages from the `api` starter.

## Consequences

- The scaffold carries some `api`-starter leftovers (config files, `imports` aliases). Remove them when they get in the way, not pre-emptively.
- ADR-0003's "slim starter" clause is superseded; the rest of it is not.
