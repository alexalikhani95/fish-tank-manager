# Prod deploy

Status: done

## Problem Statement

The keeper can only use the app on their home Wi-Fi, through a laptop running the API and a local MongoDB. Nothing they log survives the laptop being off, and the phone can't reach the app anywhere else. `PLAN.md` → Phase 2 plans staging, prod and a full GitHub Actions pipeline, but that is several slices away from the keeper logging a real WaterChange.

## Solution

A single production environment, deployed from the keeper's laptop by one command (ADR-0012). The API runs on AWS Lambda (ADR-0004) from the same Docker image used locally. The PWA is served from S3 through CloudFront, which also sends `/api/*` to the Lambda, so the app and the API share one HTTPS address and the auth cookie works unchanged (ADR-0006). Data lives in a MongoDB Atlas free (M0) cluster. Secrets live in SSM Parameter Store. The address is the free `*.cloudfront.net` one.

## User Stories

1. As a keeper, I want the app at a public HTTPS address, so that I can log a WaterChange at the tank from my phone on any network.
2. As a keeper, I want my Tanks, WaterChanges and WaterTests stored in a hosted database, so that they survive my laptop being off.
3. As a keeper, I want to install the PWA from the prod address, so that it opens like an app from my home screen.
4. As a keeper, I want deep links (e.g. a Tank's page) to load on a cold open, so that a bookmark or reload never shows an error page.
5. As a keeper, I want to stay logged in for 30 days on prod, so that it behaves exactly like the local build.
6. As a keeper, I want API errors (401, 404, 422) to come back as the API's JSON, never as the app's HTML page, so that the PWA shows the right message.
7. As a keeper, I want no API response cached by CloudFront, so that I never see stale data or someone else's response.
8. As a keeper, I want a new deploy to reach my phone on its next cold open, so that I'm never stuck on an old version.
9. As a keeper, I want to deploy with one command from my laptop, so that shipping a change is not a checklist.
10. As a keeper, I want the deploy to refuse to run from uncommitted changes, so that every image tag is a real commit I can find again.
11. As a keeper, I want the deploy to finish by checking the live app answers through CloudFront, so that a broken deploy fails loudly instead of quietly.
12. As a keeper, I want to roll back by deploying an earlier commit, so that a bad release is one command to undo.
13. As a keeper, I want secrets kept out of git and out of the image, so that the public repo leaks nothing.
14. As a keeper, I want to put secrets in once by hand and have every deploy pick them up, so that I don't paste them on each deploy.
15. As a keeper, I want a written runbook for the one-off setup (state bucket, Atlas, secrets), so that I can redo it without remembering it.
16. As a keeper, I want to sign up on prod straight after the first deploy, so that sign-up closes behind me (ADR-0010) before anyone else finds the address.
17. As a keeper, I want a fallback for creating my User from the laptop, so that a lost race for sign-up is recoverable.
18. As a keeper, I want a manual backup command in the runbook, so that I have a copy of my log until nightly backups exist.
19. As a keeper, I want the whole thing to cost about nothing per month, so that it can stay up permanently (ADR-0004).
20. As a keeper, I want old images cleaned up automatically, so that image storage doesn't grow forever.
21. As a keeper, I want API logs kept for a short while in CloudWatch, so that I can see why something failed without paying to keep logs forever.
22. As a future maintainer, I want the infrastructure written as Terraform in the repo, so that prod can be rebuilt and later copied to staging.
23. As a future maintainer, I want Terraform state stored remotely with a lock, so that two applies can't corrupt it.
24. As a future maintainer, I want `docs/status.md` to say what is live and when it was verified, so that the repo's status matches reality.

## Implementation Decisions

**API image**

- One Dockerfile builds the API workspace into a production image (Node 24, compiled Adonis build, production dependencies only, non-root user). No env baked in.
- Build context is the **repo root**: the only lockfile is the root one (npm workspaces) and `app/` has none, so `node ace build`'s usual `cd build && npm ci --omit=dev` fails. Install with the root lockfile scoped to the `app` workspace, build, then prune to production dependencies and copy the build output plus the needed `node_modules`. Every workspace's `package.json` must stay in the context or `npm ci` fails.
- AWS Lambda Web Adapter is copied in as a Lambda extension (pinned version), so Adonis runs as a normal HTTP server. The same image runs locally with `docker run`.
- Built for `linux/arm64`. Lambda rejects multi-manifest images, so the build must produce a single-platform Docker v2 manifest (with buildx: no provenance attestation).
- A `.dockerignore` keeps `node_modules`, `.env*`, `.worktrees`, `tickets`, `qa`, `infra`, docs and the PWA's sources out of the build context (keeping `web/package.json`).

**Runtime environment** (Lambda environment variables)

- Plain: `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`, `LOG_LEVEL=info`, `TZ=UTC`, `AWS_LWA_READINESS_CHECK_PATH=/api/v1/health`, `APP_URL=https://localhost` as a fixed placeholder (required by the env schema, read into config but never used; the real CloudFront or function URL would create a Terraform dependency cycle).
- Secret, read by Terraform from SSM `SecureString` parameters under `/fishtank/prod/`: `MONGO_URL`, `APP_KEY`, `JWT_SECRET` (≥ 32 characters or the app won't boot). The keeper creates them by hand with `aws ssm put-parameter`; Terraform only reads them. Values end up in Terraform state and the Lambda console (ADR-0012).

**Terraform** — one flat root for prod (ADR-0012), region `eu-west-2` (CloudFront is global; anything CloudFront needs in `us-east-1` uses a provider alias only if required).

- Backend: S3 bucket, versioned, encrypted, public access blocked, with `use_lockfile`. The bucket, `fishtank-tfstate-107014414355` (account id keeps the global name unique), is created once by hand (runbook) since Terraform can't create its own state bucket.
- ECR repository, tags `MUTABLE` (re-deploying the same commit re-pushes its tag), lifecycle rule keeping the last 10 images.
- Lambda function from the ECR image, tag passed in as a variable; `arm64`; 1024 MB; 15 s timeout; no reserved concurrency (ADR-0004 → on hold); CloudWatch log group with 14-day retention; execution role with logs only.
- Function URL, auth `NONE` (ADR-0012). AWS now requires **both** `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` granted to `*` for a public function URL; built as two explicit `aws_lambda_permission`s (`PublicFunctionUrl`, `PublicInvokeViaFunctionUrl`), the second with `invoked_via_function_url = true` so only calls via the URL are allowed, not direct Invoke. Without them CloudFront gets 403.
- S3 bucket for the PWA: private, public access blocked, read only by CloudFront through origin access control (OAC).
- CloudFront distribution, default `*.cloudfront.net` certificate, HTTP → HTTPS redirect, `PriceClass_100` (cheapest), `default_root_object = index.html`:
  - Default behaviour → PWA bucket, managed caching-optimised policy, GET/HEAD only.
  - `/api/*` → function URL origin (HTTPS only), managed **CachingDisabled** cache policy, managed **AllViewerExceptHostHeader** origin request policy (forwards `Cookie`, query and headers but not `Host`, which the function URL rejects), all HTTP methods allowed.
  - **SPA deep links via a CloudFront Function** on the default behaviour's viewer request: a path with no file extension is rewritten to `/index.html`. **Not** via distribution-level custom error responses — those apply to every behaviour and would turn the API's 401/403/404 JSON into the HTML page. The function stays on the default behaviour only, so `/api/*` is never rewritten.
- A hashed asset deleted by a later deploy comes back from S3 through OAC as **403**, not 404. Accepted: the service worker updates on the next cold open.
- Outputs: CloudFront URL, distribution id, PWA bucket name, ECR repository URL, function name, function URL.
- `.terraform/`, state files and `*.tfvars` gitignored; the provider lock file committed.

**Deploy command** (`npm run deploy`, a shell script)

1. Refuses if the working tree has uncommitted changes; the image tag is the full commit SHA. Runs `terraform init` (idempotent) so a fresh clone works.
2. Applies the ECR repository alone first with `terraform apply -target=<the ECR repository> -auto-approve` (the Lambda can't be created before an image exists; the `-target` warning is expected), logs Docker in to ECR (`aws ecr get-login-password`), builds and pushes the image.
3. Builds the PWA, then full `terraform apply` with the image tag, **interactive**: it shows the plan and waits for `yes`. That is the reviewed plan.
4. Uploads the PWA to S3: content-hashed assets with a long immutable cache; `index.html`, `sw.js`, `registerSW.js`, the manifest and anything else unhashed with `no-cache`; files no longer in the build are deleted.
5. Invalidates CloudFront `/*`.
6. **Smoke check** through the CloudFront URL, failing the command on any miss: `GET /api/v1/health` → 200 JSON with database connected, and a second call still not a CloudFront cache hit (`x-cache` is not `Hit`); `GET /api/v1/me` without a cookie → 401 **JSON**; `GET /api/v1/me` with `Cookie: token=garbage` → 401 JSON (the Cookie header reaches Adonis); `GET /` and a deep link such as `/tanks/x` → 200 HTML; `/index.html` and `/sw.js` carry `cache-control: no-cache`. Retries briefly to ride out a cold start.
7. Prints the URL.

- Rollback: check out the earlier commit (e.g. in a throwaway worktree) and run the same command; it rebuilds the image and PWA from that commit.

**Atlas** (by hand, runbook): M0 cluster in AWS `eu-west-2` (if M0 isn't offered there, the nearest region that has it, e.g. `eu-west-1`), a database user with read/write on `fishtank_prod` only, network access `0.0.0.0/0` (ADR-0004), connection string with `fishtank_prod` as the database stored as `MONGO_URL`.

**First User**: the runbook's first-deploy step is "sign up on your phone now" (ADR-0010 closes sign-up behind it). Fallback if someone else got there first: delete that User (and anything it owns) in Atlas, then sign up again. `user:set-password` only resets an existing User's password; running it from the laptop against prod needs every env var `start/env.ts` validates, not just `MONGO_URL`.

**Runbook contents** (`lld.md`): create the state bucket (one `aws` command, versioned, encrypted, public access blocked); `terraform init`; Atlas steps; generate `APP_KEY` (`node ace generate:key --show`) and `JWT_SECRET` (`openssl rand -base64 48`); the exact `aws ssm put-parameter --type SecureString` commands for `/fishtank/prod/MONGO_URL`, `/APP_KEY`, `/JWT_SECRET`; first deploy and sign-up; rollback; manual backup; and troubleshooting: Lambda init is capped at 10 s and Mongo connects at boot, so a wrong `MONGO_URL` or Atlas network rule shows as a 5xx through CloudFront — read the Lambda's CloudWatch log group.

**Manual backup** until the backup slice: `mongodump --uri "$MONGO_URL" --archive=<dated file> --gzip`, with `brew install mongodb-database-tools` in the runbook.

**Docs**: runbook and infra layout in `lld.md`; deploy picture in `hld.md` if it changes; `PLAN.md` Phase 2 items ticked/annotated (prod only, S3 lock file instead of DynamoDB); `docs/status.md` gets the prod rows once verified.

## Testing Decisions

- No application code changes, so no new Japa or Vitest tests. Existing typecheck, lint and tests must stay green.
- **One seam: the deploy's smoke check** against the live CloudFront URL (step 6 above). It proves the image boots on Lambda, reaches Atlas, cookies and errors pass through `/api/*` unchanged, and deep links serve the app.
- Before any AWS work: the image runs locally with `docker run` against the dev MongoDB (from inside the container: `mongodb://host.docker.internal:27017/...` on Docker Desktop) and answers `/api/v1/health` on port 8080.
- Terraform: `terraform fmt -check`, `terraform validate` and a reviewed `terraform plan`.
- Acceptance on a real phone by the keeper: open the prod URL, sign up, install, log a WaterChange, cold-open and see it. Recorded in `docs/status.md`.

## Out of Scope

Staging; the GitHub Actions deploy pipeline, OIDC and approval gate; automated nightly backups (next slice); the photos bucket; Sentry, metrics and structured request-ID logging; a custom domain; reserved concurrency (until AWS raises the account limit); WAF or rate limiting; Terraform checks in CI; Atlas via Terraform; Playwright against prod.

## Further Notes

- The repo is already public.
- Lambda concurrency limit on this account is 10; ask AWS for an increase (Service Quotas) and add the cap afterwards (ADR-0004).
- Cold starts of 1–3 s are expected (ADR-0004).
- Infra and deploy files go in their own commits, separate from docs (`AGENTS.md` → Commit discipline).

## Stop 2 decisions

- Tickets approved as written (5 tickets, 2026-11-15).
- **The keeper runs every real `terraform apply` / `npm run deploy`** (tickets 03, 04). Builder agents write code and run `fmt`, `validate` and `plan` only; they never apply. Ticket 02's agent may create the state bucket.
- Resumed in the same session at the keeper's choice.

## Discovered

- **Push with a Docker v2 manifest:** a plain `--load` build exports as OCI. Push with `docker buildx build --platform linux/arm64 --provenance=false -o type=image,oci-mediatypes=false,push=true,name=<repo>:<tag>` (noted in the Dockerfile header). (ticket 01)
- **Two `node_modules` trees:** the root lockfile puts the API's deps under `app/node_modules` as well as the root; the image copies both, or the container dies on `reflect-metadata`. Don't "simplify" it to one. (ticket 01)
- **`app/tests` must stay in the build context:** `node ace build` typechecks `bin/test.ts`, which imports the test bootstrap. (ticket 01)
- **`package-lock.json` shows a local key-reordering diff** from `npm install` in the worktree. Never stage it. (setup)
- **Function URL permissions are explicit:** the provider (≥ 6.28) also adds both statements on create, but they are not in state, so ticket 03 added two `aws_lambda_permission`s with different statement IDs (`PublicFunctionUrl`, `PublicInvokeViaFunctionUrl`, the latter with `invoked_via_function_url = true`). Duplicates are harmless. (ticket 03 review)
- Ticket 03 review → for 04: `function_url` is `https://<id>.lambda-url.eu-west-2.on.aws/`; CloudFront `domain_name` needs only the host: `trimsuffix(trimprefix(<url>, "https://"), "/")`. **The function URL stays public (auth `NONE`), so don't rely on CloudFront for security (e.g. a header check) without revisiting ADR-0012/0004.** `AllViewerExceptHostHeader` means Adonis sees the function URL host; fine today. Same-origin POSTs carry the CloudFront `Origin`; production `origin: []` withholds CORS headers without rejecting. **The final `echo` and the health curl in `deploy.sh` must move to the CloudFront URL.** **Lambda adds `LambdaECRImageRetrievalPolicy` to the ECR repo itself; don't add an `aws_ecr_repository_policy` without including it.** (ticket 03 review → for 04)
