# Low-level design — how it's built

_Living document._ Collections, routes, algorithms, and framework wiring. Updated by the ticket that changes them. Shape and flows: `hld.md`. Vocabulary: `CONTEXT.md`.

Sections describe the design, built or not; what exists is in `docs/status.md`.

## Data model — MongoDB

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

| field        | type                                  | notes                                              |
| ------------ | ------------------------------------- | -------------------------------------------------- |
| userId       | ObjectId → users, indexed             | owner                                              |
| name         | string, required, trimmed, 1–80 chars |                                                    |
| volumeLitres | number > 0                            | canonical; client converts from the preferred unit |
| brand        | string, optional                      |                                                    |
| model        | string, optional                      |                                                    |
| photoKey     | string, optional                      | S3 object key `tanks/<tankId>/photo`               |
| fish         | `[{ name: string, count: int ≥ 1 }]`  | embedded, whole array replaced on edit             |
| plants       | `[{ name: string }]`                  | embedded, whole array replaced on edit             |

**water_changes**

| field   | type                    | notes                                                                                     |
| ------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| tankId  | ObjectId → tanks        |                                                                                           |
| userId  | ObjectId → users        | denormalised for scoping                                                                  |
| at      | string `YYYY-MM-DD`     | a real day, not an instant; ≤ UTC today + 1 day; no lower bound; same-day entries allowed |
| percent | int 1–100               |                                                                                           |
| note    | string, optional        | kept exactly as sent; `''` and whitespace-only are valid, `null` is a 400                 |
| index   | `{ tankId: 1, at: -1 }` | newest first; last change                                                                 |

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

## API

Base `/api/v1`. Authenticated by the JWT cookie — or a bearer header (ADR-0006) — on everything except `auth/*` and `health`; the `auth` middleware (ADR-0009) checks it. Error bodies use the validation envelope with `field: ''`: 401 `Unauthorized`, 403 `Sign-up is closed`, 409 `Email already registered`. All `tanks/:tankId/*` routes load the Tank by `(tankId, userId)` first — see Ownership in `hld.md`. Lists are small (one keeper's data) and return the full set, newest first; add cursor pagination only when a real tank has more than a few hundred entries.

| Method               | Route                             | Notes                                                                                                                                                                                                   |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST                 | `auth/register`, `auth/login`     | `{ email, password }` → User; JWT set as an httpOnly cookie (ADR-0006). Register: 201, or 403 once any User exists (checked before the body); login: 200, same 401 for wrong password and unknown email |
| POST                 | `auth/logout`                     | 204; needs no auth, does not bump `tokenVersion`                                                                                                                                                        |
| GET / PATCH          | `me`                              | PATCH: `volumeUnit`, `temperatureUnit`; strict (unknown key or empty body → 400)                                                                                                                        |
| GET                  | `health`                          | `{ status, database }`; 503 if the Mongo connection drops after boot (boot itself waits for Mongo)                                                                                                      |
| GET / POST           | `tanks`                           | GET returns dashboard summaries (see below)                                                                                                                                                             |
| GET / PATCH / DELETE | `tanks/:tankId`                   | DELETE cascades; PATCH replaces `fish` / `plants` wholesale                                                                                                                                             |
| POST                 | `tanks/:tankId/photo`             | `{ contentType, size }` → `{ uploadUrl, key }`; allowlist `image/jpeg` \| `image/png` \| `image/webp`, ≤ 10 MB                                                                                          |
| PUT / DELETE         | `tanks/:tankId/photo`             | PUT `{ key }` confirms upload; DELETE removes                                                                                                                                                           |
| GET / POST           | `tanks/:tankId/water-changes`     | POST `{ at, percent, note? }` → 201 with the created entry; unknown keys (including forged `tankId`/`userId`) stripped. GET → 200 full array, `at` then `_id` descending; `[]` when empty               |
| PATCH / DELETE       | `tanks/:tankId/water-changes/:id` |                                                                                                                                                                                                         |
| GET / POST           | `tanks/:tankId/water-tests`       |                                                                                                                                                                                                         |
| PATCH / DELETE       | `tanks/:tankId/water-tests/:id`   | PATCH replaces `readings` wholesale                                                                                                                                                                     |
| GET                  | `tanks/:tankId/water-tests/trend` | `?parameter=nitrate` → `[{ at, value }]` ascending                                                                                                                                                      |

**Tank summary** (`GET tanks` and `GET tanks/:tankId`): the Tank's own fields plus `photoUrl` (presigned GET or null), `lastWaterChangeAt`, `lastWaterTestAt` — each nullable, derived on read and never stored on the Tank. `lastWaterChangeAt` is the max `at`: for the list, one `$group` aggregation over the User's `water_changes`; for detail, one `findOne` sorted by `at: -1`. List order is unchanged (`createdAt`, `_id` descending). `photoUrl` and `lastWaterTestAt` arrive with their features; POST/PATCH responses return the plain Tank.

Status codes: 200/201 success, 204 delete or logout, 400 validation, 401 no/invalid token, 403 sign-up closed, **404 for any Tank that isn't the caller's**, 409 duplicate email on register (only a first-sign-up race). Auth runs first on `tanks/:tankId/*`: no token is a 401 whatever the id; only then is a malformed, missing or foreign id a 404.

## Algorithms

**Unit conversion.** One module, pure functions, unit-tested against known values:

```
L_PER_US_GAL = 3.785411784
L_PER_UK_GAL = 4.54609
toLitres(value, unit)   / fromLitres(litres, unit)
toCelsius(value, unit)  / fromCelsius(c, unit)      # F = C × 9/5 + 32
```

The API never calls these. The client calls `to*` before submit and `from*` on display; display rounds (litres 0 dp, gallons 0 dp, °F 1 dp). Volume conversion lives in `web/src/volume.ts` (`toLitres`, `fromLitres`, `formatVolume`) until a second consumer needs a shared package; temperature arrives with WaterTests.

**Auth hardening.** Three rules, no rate limiter:

- Sign-up closes automatically: `POST auth/register` returns 403 once any User exists, with no env flag (ADR-0010). Two first sign-ups racing on an empty database could both succeed; accepted.
- Password 12–256 characters, checked in the Zod schema and counted exactly as sent (the JSON body parser does not trim, ADR-0011). Length only: no forced symbols or capitals, per current guidance.
- `node ace user:set-password <email>` for recovery, because `PRD.md` puts password reset out of v1 — without it a forgotten password means editing the database by hand. Lives in `app/commands/`: normalise the email (same rule as the API) → look up the User → hidden `New password` and `Confirm password` prompts → mismatch or outside 12–256 → one `updateOne` with `$set` the new hash and `$inc` `tokenVersion` (signs out every device). Every refusal exits 1 and changes nothing. It boots the whole app, so it needs the full env wherever it runs.

No rate limit on `auth/login` in v1. Lambda runs several containers, so an in-memory counter throttles per container rather than globally; a real limit means a Mongo write on every attempt, to guard the one password that can exist once registration is closed. Revisit if the app ever serves more than one keeper.

**Readings validation.** `readings` is an object; every key must be in `PARAMETERS`; every value a finite number ≥ 0 (pH and salinity too — no negative readings exist); at least one key present. Unknown key → 400 naming the key. Enforced in the Zod schema; the Mongoose schema repeats the key whitelist.

**Trend.** `find({ tankId, userId, [`readings.${p}`]: { $exists: true } }, { at, [`readings.${p}`] }).sort({ at: 1 })`. Returns `[{ at, value }]`. Client charts it; temperature converted on the client like any other display.

**Ownership check.** Route middleware (`app/middleware/tank_middleware.ts`) on the `tanks/:tankId` group, after `auth`: a non-ObjectId id → 404; `Tank.findOne({ _id: tankId, userId: ctx.userId })` → null → 404 → else `ctx.tank`. Handlers read `ctx.tank`, never re-query by id alone. Child collections are then queried with `{ tankId: ctx.tank.id, userId }` — the second filter is belt-and-braces, cheap because of the index.

**Cascade delete.** `deleteMany` on `water_changes` and `water_tests` by `{ tankId, userId }`, `DeleteObject` on `photoKey` if set, then `deleteOne` the Tank. Order: children first so a crash leaves a Tank with an empty log, not orphans with no Tank. A failing step throws (500) and stops the sequence; the success status stays 204.

**Date bound.** `water_change_validator.ts` checks exact `YYYY-MM-DD` (regex), a real day (round-trips through a UTC `Date`, so `2023-02-29` and month 13 fail) and `at ≤ UTC today + 1` by string comparison, stopping at the first failure so each field reports one error. "Today" comes from `app/services/clock.ts` (`clock.now()`), the seam tests replace to fix the clock without touching the global `Date` that JWT expiry reads.

## Framework wiring

- AdonisJS 7 `api` starter with Lucid, session, shield and `@adonisjs/auth` removed (ADR-0008, ADR-0009). Passwords use the core `hash` provider (scrypt).
- Mongoose registered as an Adonis provider (`providers/mongo_provider.ts`): one connection opened at boot from `MONGO_URL`, closed on shutdown; models under `app/models/` as Mongoose schemas.
- Auth is one route middleware, `app/middleware/auth_middleware.ts` (ADR-0009), not a guard: reads the `token` cookie, else the `Authorization: Bearer` header (ADR-0006) — only one is tried — verifies HS256 with `jose`, loads the User and rejects if the JWT's `tokenVersion` no longer matches the User's. Sets `ctx.user` and `ctx.userId`. Token and cookie helpers, `UNAUTHORIZED_BODY` and the cookie attributes (explicit, host-only, `secure` in every environment, raw JWT value) live in `app/services/auth_token.ts`.
- Validators under `app/validators/` as Zod schemas, one per request shape (ADR-0007); a `ZodError` becomes a 400 in `app/exceptions/handler.ts`; `readings` validator imports `PARAMETERS`.
- Tank-ownership middleware under `app/middleware/tank_middleware.ts` (named `tank`), registered after `auth` on the `tanks/:tankId` route group (`GET`/`PATCH`/`DELETE tanks/:tankId` and `water-changes`); handlers read `ctx.tank`. It rejects a non-ObjectId `:tankId` with 404 itself, rather than a route matcher — a matcher would 404 before `auth` and so hide the 401. `GET`/`POST tanks` filter on `userId` themselves.
- S3 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` in `app/services/photo_service.ts`. Bucket and region from env.
- Runs on Lambda via Lambda Web Adapter (ADR-0004): the same Docker image as local, adapter copied into `/opt/extensions/`, readiness check on `/api/v1/health`. The Mongo connection opened at boot is reused across warm invocations.
- Body parsing is JSON only (`config/bodyparser.ts`): no form or multipart parser, which makes true the JSON-only half of ADR-0006's CSRF defence (ADR-0011). Strings reach each Zod schema exactly as sent — untrimmed, and `''` not turned into `null` — so each schema trims and rejects empties itself (ADR-0011). An empty WaterChange note is valid; a `null` one is not.
- Commands under `app/commands/`, found automatically by ace and imported from tests through the `#commands/*` alias. Shared test helpers (cookie helpers, token signing, the expected 401 body) in `app/tests/helpers/auth.ts`.
- Env validated at boot in `start/env.ts` (`MONGO_URL`, `APP_KEY`, `JWT_SECRET` — at least 32 characters, boot refuses without it — `PHOTOS_BUCKET`, `AWS_REGION`, …).
- Tests: Japa. Unit for conversion and readings validation; functional (HTTP) against the MongoDB supplied by `MONGO_URL`, with test collections cleared by suite hooks. CI supplies an isolated MongoDB service and `fishtank_test`; local runs must also supply an isolated test database. Testcontainers adoption is planned in `PLAN.md`. S3 calls stubbed in tests (presigner is pure — no network).
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

**Server state (`web/`)** — TanStack Query over a thin `fetch` wrapper (`web/src/session.ts`) that sends `credentials: 'include'` (the JWT cookie, ADR-0006), throws on non-2xx, and cancels/clears private queries on a protected-request 401. `GET me` uses `['me']` to resolve the current User before private screens render; a null User redirects to `/login`. Login 401 stays on the form. Network/server failures show unavailable/retry, never invalid credentials. Confirmed login/logout cancels private queries and replaces the User; failed logout retains the User with unconfirmed feedback. Every request checks its login generation so even a late response that ignores abort cannot affect another login. Query functions must pass their `signal` to `session.request`. Passwords stay only in form memory and clear after a submission; neither credentials nor query data are persisted. Dev runs the API behind a Vite proxy so the cookie stays same-origin. Query owns caching and refetching; the wrapper owns transport and auth.

| Key                                     | Source                               |
| --------------------------------------- | ------------------------------------ |
| `['me']`                                | `GET me` — current User or null      |
| `['tanks']`                             | `GET tanks` — dashboard summaries    |
| `['tanks', tankId]`                     | `GET tanks/:tankId`                  |
| `['tanks', tankId, 'water-changes']`    | `GET …/water-changes`                |
| `['tanks', tankId, 'water-tests']`      | `GET …/water-tests`                  |
| `['tanks', tankId, 'trend', parameter]` | `GET …/water-tests/trend?parameter=` |

**Tank screens.** The authenticated routes share one layout (Dashboard link, sign-out, User email) and read the current User's `volumeUnit` for labels and display. Dashboard (`['tanks']`) and Tank detail (`['tanks', tankId]`) each show distinct loading, unavailable/retry and empty states; a 404 from `GET tanks/:tankId` (missing, foreign or malformed id) shows "Tank not found", while network/5xx show unavailable/retry and a 401 goes through the session wrapper's redirect. The detail screen is keyed by `tankId`, so switching Tanks never shows another Tank's data. Add Tank validates a trimmed 1–80 character name and a positive finite volume in the preferred unit, converts it with `toLitres` at full precision and POSTs once (mutations never retry). Success seeds `['tanks', id]`, invalidates `['tanks']` and navigates to the new Tank; an unconfirmed failure keeps the entered values and asks the User to check the dashboard before deliberately retrying. Cards show "Last water change: 1 Nov 2026" from `lastWaterChangeAt`, or "No water changes yet.", plus a "Log water change" link per Tank; detail shows the same summary, a log link and the WaterChange log.

**WaterChange screens.** Detail reads `['tanks', tankId, 'water-changes']` (newest first: date, `N% replaced`, note as text) with its own loading, unavailable and empty ("No water changes yet." and how to add the first) states. `/tanks/:tankId/water-change` loads the Tank (404 → "Tank not found"), keyed by `tankId` so values never cross Tanks. The form defaults the date to local calendar today (`web/src/day.ts` → `localToday`), takes a whole-number 1–100 percentage and an optional note sent exactly as typed (omitted when empty); the API alone enforces the upper date bound and its field errors are shown on the field. Days are displayed by `formatDay` from their own components in UTC, so no timezone shifts them. Save POSTs once (no retry) and is disabled while pending or offline; offline relies on the Shell's `role="status"` connection banner (shown on every screen) and keeps the values in memory, and reconnecting replays nothing. A confirmed save refetches `['tanks', tankId]` (detail and log) and `['tanks']` before navigating to the detail with "Water change saved."; an unconfirmed failure keeps the values and links to the log to check before a deliberate retry. Screens live one per file under `web/src/screens/`; shared `Field`, `Title`, `Unavailable` and `TankError` components under `web/src/components/`.

Mutations invalidate the narrowest prefix that covers what changed: logging a water change invalidates `['tanks', tankId]` (detail and its log) and `['tanks']` exactly (the dashboard's `lastWaterChangeAt` is derived on read), refetching even inactive queries before showing them. Refetch-on-focus is left on — a phone that sleeps mid-log comes back current.

Offline is out of v1 (`PRD.md` → Not in v1): `vite-plugin-pwa` precaches the shell so the app opens without a connection, but writes are not queued — the log forms disable themselves and show a "no connection" banner instead of accepting an entry that would be lost.

**PWA shell (`web/vite.config.ts`).** `vite-plugin-pwa` in `generateSW` mode writes `manifest.webmanifest` (name, `standalone`, theme colour, 192/512 icons; the 512 one is also maskable) and `sw.js`. The worker precaches only the built shell — `index.html`, the hashed JS/CSS, `registerSW.js`, the manifest and the icons — and has no runtime caching, so API responses, cookies and writes always go to the network and nothing private is stored. Navigations fall back to the precached `index.html` except `/api/*` (`navigateFallbackDenylist`), so an API URL opened in the browser gets the API's own status and JSON, and an unreachable API is a failed request, never a 200 page. Built preview does the same on the server side: its `/api` proxy runs before the SPA fallback. `registerType: 'prompt'` without a prompt: a new worker waits until every window of the app is closed and takes over on the next cold open, so an update never reloads a screen mid-entry. A cold offline start opens the shell and, without a reachable `GET me`, shows "Unable to connect" with a retry rather than the sign-in form. Icons are PNGs drawn by `web/scripts/icons.mjs` (stdlib only) into `web/public/`; rerun it after changing the drawing.

### Local frontend auth and browser checks

Use Node 24 and `npm ci` from the root. Root commands are listed in [AGENTS.md](../../AGENTS.md#commands). Start MongoDB and the API with the API's local `.env`; run `npm run dev:web` and open `http://localhost:5173`. Vite forwards `/api` to `http://127.0.0.1:3333`; `API_PROXY_TARGET` overrides that target for development or built preview. Keep the browser-facing hostname `localhost` for Chromium's Secure-cookie loopback behavior. This desktop exception does not provide trusted phone access.

For the built frontend, run `npm run build:web` then `npm run preview --workspace web` (`http://localhost:4173`). Both dev and preview proxy API requests before SPA fallback. Preview has a strict port to avoid silently testing another origin. The service worker only exists in the build, so PWA behaviour is checked against preview, never `dev:web`.

Install Chromium once with `npx playwright install chromium` (CI adds `--with-deps`). `npm run test:browser` requires MongoDB and an existing frontend build, starts/stops its own API on port 3334 and preview on 4173, and rejects occupied ports. It exclusively resets `fishtank_browser` before/after the suite; never use this name for keeper data. `MONGO_BROWSER_URL` can select another Mongo port/host but must retain that exact database name. Japa must use a distinct disposable database (`fishtank_test`). Cleanup lives alongside API test helpers to reuse Mongoose without adding it to the browser bundle. No preexisting API/preview process is reused. For manually started development or preview commands, stop with Ctrl-C; MongoDB lifecycle remains with the caller.

Specs share one User (sign-up closes after the first). `auth.spec.ts` runs first as its own Playwright project, which the `chromium` project (every other spec) depends on: it is the empty-install journey (signup → add Tank → sign out → sign in → log a WaterChange → log/summary → reload) plus auth error paths; `tanks.spec.ts`, `water-changes.spec.ts` and `pwa.spec.ts` sign in through `helpers.ts` and cover their own checks; `pwa.spec.ts` checks the manifest and icons, then, once the worker controls the page, that a Tank deep link is the worker-served shell while `/api/*` navigations and fetches return the API's own status and JSON, that no API URL is in any cache, and that offline keeps loaded data visible, makes the API a failed request and cold-opens a deep link to "Unable to connect" rather than sign-in. The auth browser flow uses real HTTP/API persistence, Chromium cookie transport and no certificate bypass/bearer injection. Additional error-path checks may intercept failures, never successful auth. Vitest and Playwright reject empty test runs. The `CI checks` job adds frontend lint/typecheck, unit tests, build and browser checks while retaining the API false-pass preflight and failure-independent doc gates.

### Phone access (trusted local HTTPS)

The User's phone uses the **built** PWA from the Mac over the home Wi-Fi, so installing and offline checks exercise the real service worker. `npm run phone` builds, then runs `vite preview --mode phone`: the same preview and `/api` proxy as above, but over HTTPS on every interface (port 4173). The phone's Secure cookie works because the origin is HTTPS; nothing about the cookie changes. No tunnel, no hosting.

The certificate and key are local inputs, never committed (`.certs/` and `*.pem` are gitignored): `PHONE_HTTPS_CERT` and `PHONE_HTTPS_KEY`, paths relative to the repo root or absolute, defaulting to `.certs/phone.pem` and `.certs/phone-key.pem`. They come from [mkcert](https://github.com/FiloSottile/mkcert), whose local certificate authority (CA) the User trusts on the phone by hand. Nothing here installs trust anywhere; a phone that shows a certificate warning is not set up, and tapping through it does not count as a check.

**Once, on the Mac** (`brew install mkcert` if missing). `mkcert -install` is not needed — it only makes the Mac's own browsers trust the CA. Regenerate the certificate whenever the Mac's Wi-Fi address changes.

```sh
mkdir -p .certs
mkcert -cert-file .certs/phone.pem -key-file .certs/phone-key.pem \
  "$(scutil --get LocalHostName).local" "$(ipconfig getifaddr en0)" localhost
open "$(mkcert -CAROOT)"   # rootCA.pem goes to the phone; rootCA-key.pem never leaves the Mac
```

**Run** — three terminals from the repo root; the phone uses the API's own `.env` and development database:

```sh
npm run db      # MongoDB (docker compose)
npm run dev     # API on 3333
npm run phone   # build + HTTPS preview; prints the Network URL
```

Open `https://<LocalHostName>.local:4173` (or the printed `https://<ip>:4173`) on the phone. If macOS asks whether `node` may accept incoming connections, allow it. **Stop** with Ctrl-C in the `phone` and `dev` terminals, then `docker compose stop`.

**iPhone (Safari).**

1. Trust the CA: AirDrop `rootCA.pem` to the iPhone (or mail it to yourself and open it in Mail) → "Profile Downloaded". Settings → General → VPN & Device Management → the mkcert profile → Install. Then Settings → General → About → Certificate Trust Settings → turn on full trust for the mkcert root.
2. Open the URL in Safari; it must load with no warning. Sign in.
3. Install: Share → Add to Home Screen (keep "Open as Web App" on) → Add. Open it from the Home Screen: it runs standalone, without Safari's bars. It may keep its storage separate from Safari and ask you to sign in again.
4. Reopen after closing it from the app switcher; turn on Airplane Mode (Wi-Fi off) and open it again for the offline checks.

**Android (Chrome).** Copy `rootCA.pem` to the phone; Settings → Security → Encryption & credentials → Install a certificate → CA certificate (menu names vary by maker). Open the URL in Chrome, then ⋮ → Install app (or Add to Home screen).

**Removing trust.** iPhone: Settings → General → VPN & Device Management → the mkcert profile → Remove Profile. Android: Encryption & credentials → Trusted credentials → User → the mkcert CA → Remove. Mac: `rm -rf .certs`; to destroy the CA itself, `mkcert -uninstall` (only if `-install` was ever run) then delete the `mkcert -CAROOT` folder. Delete the Home Screen app like any app.

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
