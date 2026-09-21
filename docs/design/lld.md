# Low-level design — how it's built

_Living document._ Collections, routes, algorithms, and framework wiring. Updated by the ticket that changes them. Shape and flows: `hld.md`. Vocabulary: `CONTEXT.md`.

Marked **(planned)** until scaffolded — this is the design, not yet a description of code.

## Data model — MongoDB (planned)

Mongoose schemas with `timestamps: true` (`createdAt`, `updatedAt`). `_id` is the default ObjectId. Every tank-owned collection carries both `tankId` and `userId`; reads always filter on both. No transactions in v1 (`hld.md` → Delete a tank).

**users**

| field           | type                           | notes                          |
| --------------- | ------------------------------ | ------------------------------ |
| email           | string, unique, lowercased     | login identity                 |
| passwordHash    | string                         | Adonis `hash` (scrypt default) |
| volumeUnit      | enum `L` \| `usGal` \| `ukGal` | default `L`; display only      |
| temperatureUnit | enum `C` \| `F`                | default `C`; display only      |

**tanks**

| field        | type                                 | notes                                              |
| ------------ | ------------------------------------ | -------------------------------------------------- |
| userId       | ObjectId → users, indexed            | owner                                              |
| name         | string, required                     |                                                    |
| volumeLitres | number > 0                           | canonical; client converts from the preferred unit |
| brand        | string, optional                     |                                                    |
| model        | string, optional                     |                                                    |
| photoKey     | string, optional                     | S3 object key `tanks/<tankId>/photo`               |
| fish         | `[{ name: string, count: int ≥ 1 }]` | embedded, whole array replaced on edit             |
| plants       | `[{ name: string }]`                 | embedded, whole array replaced on edit             |

**water_changes**

| field   | type                    | notes                          |
| ------- | ----------------------- | ------------------------------ |
| tankId  | ObjectId → tanks        |                                |
| userId  | ObjectId → users        | denormalised for scoping       |
| at      | string `YYYY-MM-DD`     | a day, not an instant; ≤ today |
| percent | int 1–100               |                                |
| note    | string, optional        |                                |
| index   | `{ tankId: 1, at: -1 }` | newest first; last change      |

**water_tests**

| field    | type                     | notes                                  |
| -------- | ------------------------ | -------------------------------------- |
| tankId   | ObjectId → tanks         |                                        |
| userId   | ObjectId → users         | denormalised for scoping               |
| at       | string `YYYY-MM-DD`      | ≤ today                                |
| readings | `Map<parameter, number>` | keys ⊆ `PARAMETERS`; absent ≠ 0        |
| note     | string, optional         |                                        |
| index    | `{ tankId: 1, at: -1 }`  | newest first; last test; trend queries |

Dates are stored as `YYYY-MM-DD` strings, not `Date`: the domain is day-granular, string sort is date sort, and it sidesteps every timezone bug a midnight `Date` invites.

**`PARAMETERS`** — a constant in shared code (`packages/shared` or duplicated in `app/` and `web/` until a shared package exists), the single source of truth for what a WaterTest may contain:

| key         | label       | unit | decimals |
| ----------- | ----------- | ---- | -------- |
| ammonia     | Ammonia     | ppm  | 2        |
| nitrite     | Nitrite     | ppm  | 2        |
| nitrate     | Nitrate     | ppm  | 0        |
| ph          | pH          | —    | 1        |
| gh          | GH          | °dH  | 0        |
| kh          | KH          | °dH  | 0        |
| temperature | Temperature | °C   | 1        |
| salinity    | Salinity    | SG   | 3        |

Adding a parameter is one row here. The form, the validator, the trend endpoint, and the chart all read from it. `temperature` is the only parameter with a display conversion (°C ↔ °F, per `User.temperatureUnit`).

## API (planned)

Base `/api/v1`. Bearer JWT on everything except `auth/*` and `health`. All `tanks/:tankId/*` routes load the Tank by `(tankId, userId)` first — see Ownership in `hld.md`. Lists are small (one keeper's data) and return the full set, newest first; add cursor pagination only when a real tank has more than a few hundred entries.

| Method               | Route                             | Notes                                                       |
| -------------------- | --------------------------------- | ----------------------------------------------------------- |
| POST                 | `auth/register`, `auth/login`     | `{ email, password }` → `{ token }`                         |
| GET / PATCH          | `me`                              | PATCH: `volumeUnit`, `temperatureUnit`                      |
| GET                  | `health`                          | `{ status, database }`                                      |
| GET / POST           | `tanks`                           | GET returns dashboard summaries (see below)                 |
| GET / PATCH / DELETE | `tanks/:tankId`                   | DELETE cascades; PATCH replaces `fish` / `plants` wholesale |
| POST                 | `tanks/:tankId/photo`             | `{ contentType, size }` → `{ uploadUrl, key }`              |
| PUT / DELETE         | `tanks/:tankId/photo`             | PUT `{ key }` confirms upload; DELETE removes               |
| GET / POST           | `tanks/:tankId/water-changes`     |                                                             |
| PATCH / DELETE       | `tanks/:tankId/water-changes/:id` |                                                             |
| GET / POST           | `tanks/:tankId/water-tests`       |                                                             |
| PATCH / DELETE       | `tanks/:tankId/water-tests/:id`   | PATCH replaces `readings` wholesale                         |
| GET                  | `tanks/:tankId/water-tests/trend` | `?parameter=nitrate` → `[{ at, value }]` ascending          |

**Tank summary** (`GET tanks` and `GET tanks/:tankId`): the Tank plus `photoUrl` (presigned GET or null), `lastWaterChangeAt`, `lastWaterTestAt` — the last two from one `findOne` per collection sorted by `at: -1`, or an aggregation when the dashboard has many tanks.

Status codes: 200/201 success, 204 delete, 400 validation, 401 no/invalid token, **404 for any Tank that isn't the caller's**, 409 duplicate email on register.

## Algorithms

**Unit conversion.** One module, pure functions, unit-tested against known values:

```
L_PER_US_GAL = 3.785411784
L_PER_UK_GAL = 4.54609
toLitres(value, unit)   / fromLitres(litres, unit)
toCelsius(value, unit)  / fromCelsius(c, unit)      # F = C × 9/5 + 32
```

The API never calls these. The client calls `to*` before submit and `from*` on display; display rounds (litres 0 dp, gallons 0 dp, °F 1 dp).

**Readings validation.** `readings` is an object; every key must be in `PARAMETERS`; every value a finite number ≥ 0 (pH and salinity too — no negative readings exist); at least one key present. Unknown key → 400 naming the key. Enforced in the VineJS validator; the Mongoose schema repeats the key whitelist.

**Trend.** `find({ tankId, userId, [`readings.${p}`]: { $exists: true } }, { at, [`readings.${p}`] }).sort({ at: 1 })`. Returns `[{ at, value }]`. Client charts it; temperature converted on the client like any other display.

**Ownership check.** Route middleware on the `tanks/:tankId` group: `Tank.findOne({ _id: tankId, userId: auth.user.id })` → null → 404 → else `ctx.tank`. Handlers read `ctx.tank`, never re-query by id alone. Child collections are then queried with `{ tankId: ctx.tank.id, userId }` — the second filter is belt-and-braces, cheap because of the index.

**Cascade delete.** `deleteMany` on `water_changes` and `water_tests` by `tankId`, `DeleteObject` on `photoKey` if set, then `deleteOne` the Tank. Order: children first so a crash leaves a Tank with no history, not orphans with no Tank.

## Framework wiring (planned)

- AdonisJS **slim** starter — no Lucid, no `@adonisjs/session`. `@adonisjs/auth` kept for the guard contract only (ADR-0003).
- Mongoose registered as an Adonis provider (`providers/mongo_provider.ts`): one connection opened at boot from `MONGO_URL`, closed on shutdown; models under `app/models/` as Mongoose schemas.
- JWT guard under `app/auth/guards/jwt.ts` implementing `GuardContract`; user provider under `app/auth/user_provider.ts` loading from the `User` model. Registered in `config/auth.ts` as the default guard.
- Validators under `app/validators/` (VineJS), one per request shape; `readings` validator imports `PARAMETERS`.
- Tank-ownership middleware under `app/middleware/tank_middleware.ts`, registered on the `tanks/:tankId` route group.
- S3 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` in `app/services/photo_service.ts`. Bucket and region from env.
- Env validated at boot in `start/env.ts` (`MONGO_URL`, `APP_KEY`, `JWT_SECRET`, `PHOTOS_BUCKET`, `AWS_REGION`, …).
- Tests: Japa. Unit for conversion and readings validation; functional (HTTP) against a Testcontainers Mongo, one container per test run, database dropped between suites. S3 calls stubbed in tests (presigner is pure — no network).
- `web/`: Vite + React + TypeScript, `vite-plugin-pwa`, Recharts for trends, the shared conversion module and `PARAMETERS` imported (or copied until a shared package exists).
