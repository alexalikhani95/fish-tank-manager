# Fish Tank Manager — Project Plan

Single-user aquarium log. A **User** owns **Tanks**; each Tank has a log of **WaterChanges** and **WaterTests**. Same shape and process as `home-manager` — this doc mirrors its `PLAN.md` so the two projects are built the same way; the stack differs where `docs/adr/` says so.

A new feature touches `PRD.md` (what), `hld.md`/`lld.md` (how), and a Phase here (when); unresolved choices go under Open Questions at the bottom. What actually exists: `docs/status.md`.

---

## Documents

| Doc                  | Job                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| `PRD.md`             | Why and what — problem, users, goals, success criteria, v1 features |
| `docs/design/hld.md` | How it fits — components, boundaries, core flows, deployment shape  |
| `docs/design/lld.md` | How it's built — collections, routes, algorithms, framework wiring  |
| `CONTEXT.md`         | Vocabulary                                                          |
| `docs/adr/`          | Decisions and why                                                   |
| `docs/status.md`     | What actually exists right now                                      |
| this file            | Phases, progress, cost, roadmap                                     |

## Tech Stack

- **Frontend**: React + TypeScript (Vite), **mobile-first PWA** via `vite-plugin-pwa`. No app store. Charts: Recharts. Escalation path if ever needed: Capacitor → React Native (Stretch); the API is plain REST so neither touches the backend.
- **Backend**: Node.js + TypeScript — **AdonisJS** (slim starter, no Lucid) — ADR-0003
- **DB**: **MongoDB only** via Mongoose (Atlas free M0). No relational database — ADR-0002
- **Auth**: custom JWT guard for `@adonisjs/auth` backed by Mongoose — ADR-0003
- **Photos**: S3, presigned upload and read URLs
- **Compute**: **AWS Lambda** — the API's Docker image via Lambda Web Adapter, behind CloudFront, always on at no cost — ADR-0004
- **Infra**: AWS (Lambda, ECR, S3, CloudFront, Parameter Store) + MongoDB Atlas — Terraform
- **CI/CD**: GitHub Actions
- **Observability**: Pino, CloudWatch, Sentry
- **Testing**: Japa (unit + HTTP), Testcontainers (real MongoDB), Playwright (e2e, Phase 2)

Not in the stack, deliberately: RDS/Postgres, SQS, Redis, SES (until Phase 3). Nothing in v1 needs them.

How these fit together: `docs/design/hld.md`. Data model and API: `docs/design/lld.md`.

---

## Phase 1 — Core

**Goal: a working app, properly tested, installed on the keeper's phone and in daily use for their own tanks.**

- [ ] Scaffold: `app/` (AdonisJS slim + Mongoose provider) and `web/` (Vite React PWA); root `npm run dev|test|lint|format|typecheck`; fill in `AGENTS.md` → Commands
- [ ] Auth: register / login / `GET /me`, custom JWT guard over Mongoose (ADR-0003), 30-day tokens, password hashed with Adonis `hash`; `PATCH /me` for `volumeUnit` and `temperatureUnit`
- [ ] Tanks CRUD — `Tank` with embedded `fish[]` and `plants[]`; every query scoped by `userId`; foreign tank → 404; delete cascades WaterChanges, WaterTests, and the S3 object
- [ ] Photo — `POST /tanks/:tankId/photo` returns a presigned PUT; confirm stores the key; tank responses carry a short-lived presigned GET. 10 MB, jpeg/png/webp/heic
- [ ] Water changes — create / edit / delete; list per tank newest first; tank summary exposes `lastWaterChangeAt` (derived)
- [ ] Water tests — `PARAMETERS` constant (8 parameters, one unit each); `readings` map validated against it; create / edit / delete; list per tank; tank summary exposes `lastWaterTestAt` (derived); `GET …/trend?parameter=` for charts
- [ ] Unit conversion — one shared module (litres ↔ US/UK gallons, °C ↔ °F), unit-tested; API stores canonical, client converts at the edge
- [ ] REST API: `/api/v1/`, consistent resource naming, proper status codes, OpenAPI docs
- [ ] React PWA — mobile-first, installable. Screens: sign in / sign up, dashboard, tank (details, fish, plants, water changes, water tests, trend chart), water change form, water test form, settings. Built as vertical slices alongside the API — real use on the keeper's phone is the acceptance test
- [ ] Testing: unit tests for unit conversion and `readings` validation; HTTP tests against a Testcontainers Mongo for register → create tank → log change → log test → trend; a tenancy test proving another user's tank is a 404
- [ ] Basic CI: GitHub Actions on every PR — `prettier --check` → lint → typecheck → tests (fast to slow). Branch protection on `main` blocks merge on red. `concurrency` with `cancel-in-progress`
- [ ] Doc gates in CI, run on every PR including docs-only ones: `bash scripts/check-status-claims.sh` and `node --test 'scripts/**/*.test.mjs'`
- [ ] Dependabot (`.github/dependabot.yml`) — weekly npm updates + security PRs
- [ ] Install skills after scaffold: `npx skills add mattpocock/skills` (lockfile); repo-local `running-the-app` + `reconciling-status` — see `docs/agents/workflow.md` → Skills
- [ ] Naive-user testing agent — install techgarden's `naive-user` plugin once the PWA has its first screen; findings under `qa/naive-user/`
- [ ] `/develop` command — written **after the first feature ships through the manual flow**; scope in `docs/agents/workflow.md` → "Planned: `/develop`"

---

## Phase 2 — Deploy

**Goal: production-shaped deployment and monitoring. A copy of `home-manager`'s Phase 3 minus RDS, SQS, and SES.**

- [ ] Terraform modules: Lambda (container image, function URL, reserved concurrency), S3 (frontend bucket + photos bucket) + CloudFront (`/*` → PWA bucket, `/api/*` → function URL) — one root per environment (`infra/envs/staging`, `infra/envs/prod`) sharing the same modules
- [ ] Remote state (S3 backend + DynamoDB lock), separate state key per environment
- [ ] MongoDB Atlas free M0 cluster; one cluster, two databases (`fishtank_staging`, `fishtank_prod`)
- [ ] ECR lifecycle rule: keep last 10 images
- [ ] Both environments stay up — idle Lambda costs nothing, so there is nothing to destroy (ADR-0004)
- [ ] Deploy pipeline (see below)
- [ ] Pino structured logging with request IDs; CloudWatch metrics; Sentry
- [ ] Secrets via SSM Parameter Store `SecureString` (`MONGO_URL`, `APP_KEY`, JWT secret)
- [ ] E2E browser tests (Playwright) — a handful of critical flows only (sign up → create tank → log change → log test → see trend). Run on PR against a local API + Testcontainers Mongo; later reused as the post-deploy smoke test against staging

### Deploy pipeline

Fully separate infra from `home-manager` and `wedding-manager` (own Terraform, own hosts, own Atlas cluster) on the same AWS account. Two environments: **staging** and **prod**. Principle: **build once, promote the artifact** — prod runs the exact image staging tested.

One GitHub Actions workflow on push to `main`:

1. **Build** — lint, typecheck, tests. Build API Docker image tagged with the commit SHA, push to ECR. Build frontend bundle as a workflow artifact. Nothing environment-specific baked in; config arrives via env vars / Parameter Store at runtime.
2. **Deploy staging** (automatic) — `terraform apply` staging root, update the Lambda function to `:<sha>`, sync frontend to staging bucket, smoke test (`/health` + one real endpoint).
3. **Deploy prod** (gated) — job targets GitHub Environment `production` with required reviewer; workflow pauses until approved. Same steps, prod root, **same image** — no rebuild.
4. **Tag** (automatic, after prod succeeds) — create `vX.Y.Z` git tag on that SHA + GitHub Release with auto-generated notes. Record of "what's in prod", not a trigger.

Rollback = re-run the prod job with the previous SHA; image is still in ECR.

Requires a **public repo** (GitHub Environment approval gates are Pro-only on private). Fine — it's a portfolio project. PR checks (lint/typecheck/test) are a separate workflow from Phase 1.

---

## Phase 3 — Nice-to-have

**Goal: the things a keeper wants after a month of use.**

- [ ] SES — verified sender, sandbox exit; then email verification on sign-up and password reset
- [ ] Water-change reminders — per-tank interval ("every 14 days"); EventBridge schedule invokes the API, which finds overdue tanks → email, later web push to the installed PWA
- [ ] One AI feature — e.g. read a test-strip photo into a WaterTest, or "is this tank overstocked?" from its fish list and volume

---

## Cost Management

Same AWS account and credit pool as `home-manager` and `wedding-manager`; their `PLAN.md` → Cost Management holds the credit balance, budget, and the account-level alarms. Rules carried over: Upstash-style free tiers over managed AWS services, no NAT Gateway. Rule of this project: Lambda over always-on compute (ADR-0004).

Estimated cost per environment, always on: Lambda, CloudFront, Parameter Store and CloudWatch Logs inside AWS's always-free tiers at one keeper's traffic; ECR image storage is cents → **~$0/month per environment**. Atlas M0 is free; no RDS is the single biggest saving versus `home-manager` (ADR-0002). Photos: S3 free tier covers 5 GB — thousands of tank photos.

Alarm state and what is actually provisioned: `docs/status.md`.

---

## Stretch / Later

- [ ] Sharing a tank with another User (would introduce a tenant above Tank — see `PRD.md` → Users for why v1 is single-user)
- [ ] Species catalogue — autocomplete for fish and plant names, care ranges per species, compatibility warnings
- [ ] Multiple photos per tank, photo per WaterTest
- [ ] Equipment and maintenance log (filter media, heater, lights) with intervals
- [ ] Feeding and dosing log
- [ ] User-defined Parameters
- [ ] Capacitor wrapper if a native API is needed; React Native + App Store if this becomes a product for other people

---

## Open Questions

None right now — all v1 decisions settled in the 2026-09-21 planning session. Add here as new features come up.
