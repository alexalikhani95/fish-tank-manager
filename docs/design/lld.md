# Low-level design — how it's built

_Living document._ Collections, routes, algorithms, and framework wiring. Updated by the ticket that changes them. Shape and flows: `hld.md`. Vocabulary: `CONTEXT.md`.

Marked **(planned)** until scaffolded — this is the design, not yet a description of code.

## Data model — MongoDB (planned)

Mongoose schemas with `timestamps: true` (`createdAt`, `updatedAt`). `_id` is the default ObjectId. Every tank-owned collection carries both `tankId` and `userId`; reads always filter on both. No transactions in v1 (`hld.md` → Delete a tank).

**users**

| field           | type                           | notes                                   |
| --------------- | ------------------------------ | --------------------------------------- |
| email           | string, unique, lowercased     | login identity                          |
| passwordHash    | string                         | Adonis `hash` (scrypt default)          |
| volumeUnit      | enum `L` \| `usGal` \| `ukGal` | default `L`; display only               |
| temperatureUnit | enum `C` \| `F`                | default `C`; display only               |
| tokenVersion    | int, default 0                 | bumped to revoke every token (ADR-0006) |

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

| field   | type                    | notes                                      |
| ------- | ----------------------- | ------------------------------------------ |
| tankId  | ObjectId → tanks        |                                            |
| userId  | ObjectId → users        | denormalised for scoping                   |
| at      | string `YYYY-MM-DD`     | a day, not an instant; ≤ UTC today + 1 day |
| percent | int 1–100               |                                            |
| note    | string, optional        |                                            |
| index   | `{ tankId: 1, at: -1 }` | newest first; last change                  |

**water_tests**

| field    | type                     | notes                                  |
| -------- | ------------------------ | -------------------------------------- |
| tankId   | ObjectId → tanks         |                                        |
| userId   | ObjectId → users         | denormalised for scoping               |
| at       | string `YYYY-MM-DD`      | ≤ UTC today + 1 day                    |
| readings | `Map<parameter, number>` | keys ⊆ `PARAMETERS`; absent ≠ 0        |
| note     | string, optional         |                                        |
| index    | `{ tankId: 1, at: -1 }`  | newest first; last test; trend queries |

Dates are stored as `YYYY-MM-DD` strings, not `Date`: the domain is day-granular, string sort is date sort, and it sidesteps every timezone bug a midnight `Date` invites.

The upper bound is **UTC today + 1 day**, not UTC today. The client sends the date its own clock shows and the API runs in UTC, so a keeper logging a change at 23:30 British Summer Time would otherwise send tomorrow's date and get a 400 on the one screen that has to be fast. One day of slack covers every zone ahead of UTC without sending a timezone on every write; the worst it permits is a personal log dated a day early.

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

Base `/api/v1`. Authenticated by the JWT cookie — or a bearer header (ADR-0006) — on everything except `auth/*` and `health`. All `tanks/:tankId/*` routes load the Tank by `(tankId, userId)` first — see Ownership in `hld.md`. Lists are small (one keeper's data) and return the full set, newest first; add cursor pagination only when a real tank has more than a few hundred entries.

| Method               | Route                             | Notes                                                                                                          |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| POST                 | `auth/register`, `auth/login`     | `{ email, password }` → User; JWT set as an httpOnly cookie (ADR-0006)                                         |
| POST                 | `auth/logout`                     | clears the cookie                                                                                              |
| GET / PATCH          | `me`                              | PATCH: `volumeUnit`, `temperatureUnit`                                                                         |
| GET                  | `health`                          | `{ status, database }`                                                                                         |
| GET / POST           | `tanks`                           | GET returns dashboard summaries (see below)                                                                    |
| GET / PATCH / DELETE | `tanks/:tankId`                   | DELETE cascades; PATCH replaces `fish` / `plants` wholesale                                                    |
| POST                 | `tanks/:tankId/photo`             | `{ contentType, size }` → `{ uploadUrl, key }`; allowlist `image/jpeg` \| `image/png` \| `image/webp`, ≤ 10 MB |
| PUT / DELETE         | `tanks/:tankId/photo`             | PUT `{ key }` confirms upload; DELETE removes                                                                  |
| GET / POST           | `tanks/:tankId/water-changes`     |                                                                                                                |
| PATCH / DELETE       | `tanks/:tankId/water-changes/:id` |                                                                                                                |
| GET / POST           | `tanks/:tankId/water-tests`       |                                                                                                                |
| PATCH / DELETE       | `tanks/:tankId/water-tests/:id`   | PATCH replaces `readings` wholesale                                                                            |
| GET                  | `tanks/:tankId/water-tests/trend` | `?parameter=nitrate` → `[{ at, value }]` ascending                                                             |

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

**Auth hardening.** Three rules, no rate limiter:

- `REGISTRATION_OPEN` (env, boolean). `POST auth/register` returns 403 when it is false. It stays true only until the keeper has created their account on each environment, then it is flipped off for good — a closed endpoint beats a throttled one, and this app has exactly one intended User.
- Password minimum 12 characters, checked in the VineJS validator. Length only: no forced symbols or capitals, per current guidance.
- `node ace user:set-password <email>` for recovery, because `PRD.md` puts password reset out of v1 — without it a forgotten password means editing the database by hand.

No rate limit on `auth/login` in v1. Lambda runs several containers, so an in-memory counter throttles per container rather than globally; a real limit means a Mongo write on every attempt, to guard the one password that can exist once registration is closed. Revisit if the app ever serves more than one keeper.

**Readings validation.** `readings` is an object; every key must be in `PARAMETERS`; every value a finite number ≥ 0 (pH and salinity too — no negative readings exist); at least one key present. Unknown key → 400 naming the key. Enforced in the VineJS validator; the Mongoose schema repeats the key whitelist.

**Trend.** `find({ tankId, userId, [`readings.${p}`]: { $exists: true } }, { at, [`readings.${p}`] }).sort({ at: 1 })`. Returns `[{ at, value }]`. Client charts it; temperature converted on the client like any other display.

**Ownership check.** Route middleware on the `tanks/:tankId` group: `Tank.findOne({ _id: tankId, userId: auth.user.id })` → null → 404 → else `ctx.tank`. Handlers read `ctx.tank`, never re-query by id alone. Child collections are then queried with `{ tankId: ctx.tank.id, userId }` — the second filter is belt-and-braces, cheap because of the index.

**Cascade delete.** `deleteMany` on `water_changes` and `water_tests` by `tankId`, `DeleteObject` on `photoKey` if set, then `deleteOne` the Tank. Order: children first so a crash leaves a Tank with no history, not orphans with no Tank.

## Framework wiring (planned)

- AdonisJS **slim** starter — no Lucid, no `@adonisjs/session`. `@adonisjs/auth` kept for the guard contract only (ADR-0003).
- Mongoose registered as an Adonis provider (`providers/mongo_provider.ts`): one connection opened at boot from `MONGO_URL`, closed on shutdown; models under `app/models/` as Mongoose schemas.
- JWT guard under `app/auth/guards/jwt.ts` implementing `GuardContract`: reads the `token` cookie, else the `Authorization: Bearer` header (ADR-0006), verifies HS256, then loads the User via `app/auth/user_provider.ts` and rejects if the JWT's `tokenVersion` no longer matches the User's. Registered in `config/auth.ts` as the default guard.
- Validators under `app/validators/` (VineJS), one per request shape; `readings` validator imports `PARAMETERS`.
- Tank-ownership middleware under `app/middleware/tank_middleware.ts`, registered on the `tanks/:tankId` route group.
- S3 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` in `app/services/photo_service.ts`. Bucket and region from env.
- Runs on Lambda via Lambda Web Adapter (ADR-0004): the same Docker image as local, adapter copied into `/opt/extensions/`, readiness check on `/api/v1/health`. The Mongo connection opened at boot is reused across warm invocations.
- Env validated at boot in `start/env.ts` (`MONGO_URL`, `APP_KEY`, `JWT_SECRET`, `PHOTOS_BUCKET`, `AWS_REGION`, `COOKIE_DOMAIN`, …).
- Tests: Japa. Unit for conversion and readings validation; functional (HTTP) against a Testcontainers Mongo, one container per test run, database dropped between suites. S3 calls stubbed in tests (presigner is pure — no network).
- `web/`: Vite + React + TypeScript, `vite-plugin-pwa`, Tailwind v4 via `@tailwindcss/vite` (CSS-first config, no `tailwind.config.js`), shadcn/ui components as editable source under `web/src/components/ui/` (ADR-0005), `react-router` for the screens below, TanStack Query for server state, Recharts for trends, the shared conversion module and `PARAMETERS` imported (or copied until a shared package exists).

**Screens (`web/`)** — `react-router`; everything but `/login` and `/signup` sits behind a wrapper that redirects to `/login` when `GET me` returns 401 — the token is an httpOnly cookie, so the client cannot read auth state directly (ADR-0006):

| Path                                | Screen                                                               |
| ----------------------------------- | -------------------------------------------------------------------- |
| `/login`, `/signup`                 | sign in / sign up                                                    |
| `/`                                 | dashboard — tank summaries                                           |
| `/tanks/new`, `/tanks/:tankId/edit` | tank create / edit (name, volume, brand, model, fish, plants, photo) |
| `/tanks/:tankId`                    | tank — details, water change log, water test log, trend chart        |
| `/tanks/:tankId/water-change`       | log a water change (`?id=` to edit)                                  |
| `/tanks/:tankId/water-test`         | log a water test (`?id=` to edit)                                    |
| `/settings`                         | volume unit, temperature unit, sign out                              |

Deep links matter: the installed PWA reopens on the last screen, and a tank is shareable as a URL to yourself.

**Server state (`web/`)** — TanStack Query over a thin `fetch` wrapper (`web/src/lib/api.ts`) that sends `credentials: 'include'` (the JWT cookie, ADR-0006), throws on non-2xx, and clears the Query cache and redirects to `/login` on 401. Dev runs the API behind a Vite proxy so the cookie stays same-origin. Query owns caching and refetching; the wrapper owns transport and auth.

| Key                                     | Source                               |
| --------------------------------------- | ------------------------------------ |
| `['tanks']`                             | `GET tanks` — dashboard summaries    |
| `['tanks', tankId]`                     | `GET tanks/:tankId`                  |
| `['tanks', tankId, 'water-changes']`    | `GET …/water-changes`                |
| `['tanks', tankId, 'water-tests']`      | `GET …/water-tests`                  |
| `['tanks', tankId, 'trend', parameter]` | `GET …/water-tests/trend?parameter=` |

Mutations invalidate the narrowest prefix that covers what changed: logging a water change invalidates `['tanks', tankId, 'water-changes']` and `['tanks']` (the dashboard's `lastWaterChangeAt` is derived on read). Refetch-on-focus is left on — a phone that sleeps mid-log comes back current.

Offline is out of v1 (`PRD.md` → Not in v1): `vite-plugin-pwa` precaches the shell so the app opens without a connection, but writes are not queued — the log forms disable themselves and show a "no connection" banner instead of accepting an entry that would be lost.

**Photo pipeline (`web/`)** — the picked file is re-encoded before it is uploaded, never sent as-is:

```
file = <input type="file" accept="image/*" capture="environment">
bitmap = await createImageBitmap(file)     // throws on a format the browser cannot decode
canvas = scale(bitmap, maxEdge = 1600)     // aspect preserved, no upscale
blob   = await canvas.toBlob('image/jpeg', 0.85)   // ~400 KB from a ~5 MB original
POST …/photo { contentType: 'image/jpeg', size: blob.size } → presigned PUT → PUT blob
```

Two problems, one solution. **Size**: a phone photo is 3–8 MB, the dashboard shows it as a tile, and the presigned GET's 1-hour TTL changes the URL often enough that the browser cache keeps missing — so the full original would be re-downloaded repeatedly. **HEIC**: iPhones shoot HEIC, Safari can decode and display it, Chrome and Firefox cannot. iOS often transcodes HEIC to JPEG on upload, but not reliably, so a HEIC that slipped through would render on the keeper's phone and break on a laptop.

Re-encoding fixes size everywhere and makes HEIC a visible failure at pick time (`createImageBitmap` throws → "that format isn't supported, use JPEG") instead of a broken `<img>` weeks later. `heic` is therefore **not** in the allowlist: nothing but JPEG ever reaches S3. A WASM HEIC decoder (`heic2any`, libheif) would make Chrome work too, at a few hundred KB in a mobile-first bundle — rejected for v1.
