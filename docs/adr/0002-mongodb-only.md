# 0002. MongoDB is the only database

- **Status:** Accepted
- **Date:** 2026-09-21

## Context

This repo copies its process and default stack from `home-manager`, whose default is Postgres (RDS, Lucid) as the system of record plus MongoDB for one append-only feed. That polyglot setup was a deliberate portfolio goal there.

Fish Tank Manager's data is a User who owns Tanks, each with a log of WaterChanges and WaterTests. There are no cross-entity joins, no roles, no tenant above the User. WaterTests carry a variable set of Readings whose parameter list will grow; the natural shape is a document with a map, not a wide table or an EAV join.

RDS `db.t4g.micro` is ~$14/month per environment — the single largest line in the shared AWS budget. Free Postgres hosts (Neon, Supabase) remove that cost but add a third vendor.

During planning, "Postgres for some collections, Mongo for the rest" was raised twice, including "Postgres just for `users` so `@adonisjs/auth` works out of the box".

## Decision

We will use **MongoDB (Atlas M0) as the only database**. No Postgres, no RDS, no Neon.

Alternatives considered:

- **Postgres + Mongo, as in `home-manager`** — rejected. Nothing here has two data shapes; a second store adds two Testcontainers, two data models, cross-store ID references, two backup stories, and (on RDS) doubles the per-environment cost. Polyglot persistence is already demonstrated in `home-manager`; repeating it here shows nothing new.
- **Postgres for `users` only** (to get Adonis auth providers for free) — rejected. A second database for a table with a handful of rows is heavier than the ~80-line JWT guard it saves (ADR-0003).
- **Postgres only** — rejected. `readings` as a map fits documents; the owner wants Mongo depth for the portfolio; and the cost argument stands.

## Consequences

- Per-environment cost drops to ~$10/month before the destroy rules — no RDS.
- AdonisJS loses Lucid and its auth providers; a custom guard is required — ADR-0003.
- No migrations tool. Schema changes are Mongoose schema changes plus, if needed, a one-off `ace` command to backfill.
- No multi-document transactions used in v1; cascade deletes are ordered children-first so a crash leaves no orphans that any read can reach.
- Revisit if a relational need appears that documents handle badly (sharing with roles, cross-tank reporting with joins). The trigger is a concrete query that hurts, not a preference.
