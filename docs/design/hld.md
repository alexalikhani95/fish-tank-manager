# High-level design — how it fits together

_Living document._ Components, boundaries, core flows, cross-cutting rules. Reconciled whenever a feature changes the shape. Internal detail (collections, routes, algorithms) is in `lld.md`; why and what is in `PRD.md`; decisions in `docs/adr/`.

## Components

```
 phone (PWA)                       AWS
┌──────────────┐    HTTPS     ┌────────────────────────────────────────────┐
│ React + Vite │ ───────────▶ │ CloudFront + S3 (static PWA bundle)        │
│ vite-plugin- │              │                                            │
│ pwa (SW,     │    /api/v1   │ CloudFront /api/* → Lambda (ADR-0004)      │
│ manifest)    │ ───────────▶ │  └─ api — AdonisJS (JWT guard, REST)       │
│              │              │                                            │
│              │  presigned   │ S3 photos bucket (private)                 │
│              │ ───────────▶ │                                            │
└──────────────┘              └────────────────────────────────────────────┘
                                 MongoDB Atlas M0 (system of record)
```

| Component           | Role                                                                                                   | Talks to            |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ------------------- |
| **PWA** (`web/`)    | Mobile-first React app; installable via Add to Home Screen. Holds the JWT. Converts units at the edge. | API, S3 (presigned) |
| **API** (`app/`)    | AdonisJS without Lucid (ADR-0003). Auth, ownership checks, all CRUD, presigned URL issuing.            | MongoDB, S3 (sign)  |
| **MongoDB** (Atlas) | The only database (ADR-0002) — users, tanks, water changes, water tests.                               | —                   |
| **S3 photos**       | One object per tank. Private; every read is a short-lived presigned GET.                               | —                   |

No worker, queue, cache, or email service in v1. Stack choices and reasons: `PLAN.md` → Tech Stack; reversals get an ADR.

## Boundaries

- **Exposes:** one REST API at `/api/v1/` (OpenAPI-documented). Nothing else is public.
- **Consumes:** S3 for photo bytes (the API never proxies them). Nothing inbound.
- **Frontend ↔ API:** plain HTTP + bearer JWT. The API does not know what client is calling; this keeps the PWA → Capacitor → React Native path open without backend changes.
- **Units:** the API stores and returns canonical units only (litres, °C). The client converts to and from the User's preferred unit. The one shared conversion module is the only place that knows 3.785 from 4.546.
- **Independent of `home-manager`:** same process, different stack in two places (ADR-0002, ADR-0003); separate repo, AWS resources, Atlas cluster, and Terraform state.

## Core flows

**Sign up → first tank**

1. `POST auth/register` (email + password) → the JWT arrives as an httpOnly cookie (ADR-0006). Same from `POST auth/login`.
2. `POST /tanks` with name and `volumeLitres` (client already converted) → Tank owned by the caller.
3. Every later request carries the cookie; every tank-scoped handler loads the Tank by `(id, userId)` and 404s if absent.

**Add a photo**

1. The client re-encodes the picked image to JPEG at max 1600px (`lld.md` → Photo pipeline), so only JPEG bytes ever reach S3.
2. `POST /tanks/:tankId/photo` `{ contentType, size }` → validated → `{ uploadUrl, key }` (presigned PUT, 5-minute TTL).
3. Client PUTs the bytes straight to S3.
4. `PUT /tanks/:tankId/photo` `{ key }` → API `HEAD`s the object to confirm it exists, stores `photoKey`, deletes the previous object if any.
5. Tank reads return `photoUrl` — a presigned GET, 1-hour TTL, generated per response.

**Log a water change**

1. `POST /tanks/:tankId/water-changes` `{ at, percent, note? }`.
2. Stored. Tank summary's `lastWaterChangeAt` is the max `at` for that tank — computed on read, never written to the Tank.

**Log a water test**

1. `POST /tanks/:tankId/water-tests` `{ at, readings: { nitrate: 20, ph: 7.2 }, note? }`.
2. Validator checks every key against `PARAMETERS` and every value is a finite number; unknown key → 400. Absent parameters stay absent.
3. Trend: `GET /tanks/:tankId/water-tests/trend?parameter=nitrate` → `[{ at, value }]` for tests that carry that reading, ascending by date. Chart on the client.

**Delete a tank**

One service call: delete the Tank, its WaterChanges, its WaterTests, and its S3 object. Not transactional (Mongo M0 is a replica set so multi-document transactions are available, but a half-deleted tank's orphan documents are invisible — every read is scoped by `tankId` under a Tank that no longer exists — so a transaction buys nothing here).

## Cross-cutting

**Ownership.** Single-user: there is no tenant above the User. Every tank-owned document carries `userId` alongside `tankId`. A tank-scoped route loads the Tank by `(tankId, userId)` first; **a Tank that isn't the caller's returns 404, never 403** — the caller must not learn it exists. 403 is unused in v1 (no roles). If sharing ever arrives, the tenant slots in between User and Tank (`PLAN.md` → Stretch).

**Auth.** Custom JWT guard registered with `@adonisjs/auth` (ADR-0003). HS256, 30-day expiry, secret from env. The token is delivered as an `httpOnly; Secure; SameSite=Lax` cookie and the guard falls back to an `Authorization: Bearer` header for future native clients (ADR-0006). No sessions, refresh tokens, or token table — the API stays stateless. `POST auth/logout` clears the cookie; a `tokenVersion` claim checked against `User.tokenVersion` revokes every token a User holds. CSRF: `SameSite=Lax` plus a JSON-only API, no CSRF token in v1.

**Validation.** VineJS at every request boundary. Registration closes behind `REGISTRATION_OPEN` once the keeper's account exists (`lld.md` → Auth hardening). `readings` keys and `volumeUnit`/`temperatureUnit` values are constrained in both the validator and the Mongoose schema.

**Derived, never stored.** Last water change, last test, litres replaced by a water change, trends, gallons, °F. Anything computable from the log is computed.

**Background work.** None in v1. Phase 3 reminders run as an EventBridge schedule invoking the API's Lambda, not a queue (ADR-0004).

**Observability (Phase 2).** Pino structured logs with request IDs; CloudWatch metrics; Sentry. Health: `GET /api/v1/health` → `{ status, database }`.

## Deployment

Two environments, **staging** and **prod**, fully separate Terraform roots sharing modules. **Build once, promote the artifact**: one workflow on push to `main` builds the API image tagged with the commit SHA, deploys staging automatically, waits for a manual approval (GitHub Environment `production`), deploys the _same image_ to prod, then tags a release. Rollback = redeploy the previous SHA. Both stay up: the API runs on Lambda, which costs nothing while idle (ADR-0004). Full sequence and the cost reasoning: `PLAN.md` → Deploy pipeline, Cost Management. Present state of each environment: `docs/status.md`.
