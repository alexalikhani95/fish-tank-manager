# 04: PWA and API behind one CloudFront address

**What to build:** The prod address (`*.cloudfront.net`) serves the PWA from S3 and sends `/api/*` to the Lambda, so the app and the auth cookie work on one HTTPS origin. `npm run deploy` now does all seven steps and fails unless the full smoke check passes. Spec → Implementation Decisions → Terraform (S3, CloudFront, outputs), Deploy command steps 4–7, and the runbook's deploy/rollback/backup/troubleshooting sections.

**Blocked by:** 03

**Status:** done

**Label:** new design · **Test seams:** the deploy's smoke check through CloudFront (spec step 6) · **Risky:** yes — CloudFront cookie forwarding and caching (ADR-0006: get it wrong and auth breaks or one response is served to another)

Agent:

- [x] Private PWA bucket read only through OAC; CloudFront with `PriceClass_100`, HTTPS redirect, `default_root_object`; default behaviour caching-optimised + the SPA-rewrite CloudFront Function; `/api/*` → function URL with CachingDisabled + AllViewerExceptHostHeader, all methods; **no** distribution-level custom error responses; the remaining outputs listed in the spec (CloudFront URL, distribution id, bucket name)
- [x] Deploy: add the PWA build to step 3, then steps 4–7: upload with the spec's cache headers and deletion of removed files; invalidate `/*`; smoke check exactly as spec step 6 (health JSON and not a cache hit twice, `me` 401 JSON with and without a garbage cookie, `/` and a deep link HTML, `no-cache` on `index.html` and `sw.js`), retrying for cold start; prints the URL
- [x] `terraform plan` summary quoted in `## Comments`; no apply by the agent
- [x] Runbook in `lld.md`: first deploy and **sign up on your phone straight away**, the lost-race fallback, rollback
- [x] `hld.md` deploy picture updated if it differs
- [x] Typecheck, lint, tests green; infra in its own commit, docs in another

Keeper:

- [x] Runs `npm run deploy`, reads the plan, types `yes`; smoke check output pasted into `## Comments` — then signs up on the phone straight away (ADR-0010)
- [ ] Rollback once: deploys the previous commit from a throwaway worktree, smoke check passes, then redeploys the branch head

## Comments

**2026-11-15, agent (Agent items).** `infra/prod/main.tf` (PWA bucket + public access block + OAC-only bucket policy, OAC, `fishtank-spa-rewrite` CloudFront Function, distribution, managed policies by data source, outputs `cloudfront_url`, `distribution_id`, `pwa_bucket`), `scripts/deploy.sh` (steps 3–7), `lld.md` → Prod runbook (Infra layout rows, Deploy, first sign-up, lost race, rollback, troubleshooting), `hld.md` → Deployment (one sentence on the laptop deploy until the pipeline exists; the picture already matched). Terraform 1.17.2 (checksum-verified, scratchpad): `fmt -check` and `validate` pass. Typecheck, lint, `npm test` (76), `npm run test:web` (11), script tests (15), `check-status-claims.sh` and `bash -n scripts/deploy.sh` green; shellcheck not installed.

- **Plan** (`terraform -chdir=infra/prod plan -var image_tag=$(git rev-parse HEAD)`, HEAD `c897cb7` at the time): **6 to add, 1 to change, 0 to destroy** — `aws_s3_bucket.pwa` (`fishtank-pwa-107014414355`), `aws_s3_bucket_public_access_block.pwa`, `aws_s3_bucket_policy.pwa`, `aws_cloudfront_origin_access_control.pwa`, `aws_cloudfront_function.spa`, `aws_cloudfront_distribution.app` (`PriceClass_100`, `default_root_object = "index.html"`, both behaviours `redirect-to-https`; default cache policy `658327ea…` CachingOptimized; `/api/*` cache policy `4135ea2d…` CachingDisabled, origin request policy `b689b0a8…` AllViewerExceptHostHeader; API origin `t6t74nkahza33pu2rzzjh5zvre0utcip.lambda-url.eu-west-2.on.aws`); the 1 change is `aws_lambda_function.api` `image_uri` `:1e7bdc7…` → the new SHA, expected on any new commit. New outputs: `cloudfront_url`, `distribution_id` (known after apply), `pwa_bucket`.
- **Smoke check not run** (it needs the live distribution); written by reading. A fail inside it exits the deploy with `✗ smoke: …`.
- **Upload order:** hashed `assets/` first, then the rest with `no-cache` and `--delete` (excluding `assets/`), then `assets/` with `--delete`, so the new shell never points at a missing asset. `workbox-<hash>.js` sits at the root, so it gets `no-cache` too: harmless.
- **The first apply waits for the distribution** to deploy (several minutes); the deploy also waits for the `/*` invalidation before the smoke check.

- 2026-11-16 (agent, at the keeper's request): ran `npm run deploy` of `ef55ea4`. Plan checked first (**6 to add, 1 to change, 0 to destroy**, as reviewed), then answered yes. Apply **6 added, 1 changed, 0 destroyed**; PWA uploaded; invalidation done; full smoke check passed: `✓ deployed ef55ea4ad51eb8091ee1f661d74c063cf29d2e30: https://d2xxyedlkkg5qo.cloudfront.net`. Distribution `E3I8A4K1FKGUHF`, bucket `fishtank-pwa-107014414355`. Still open: the keeper's phone sign-up (ADR-0010) and the rollback drill.

- 2026-11-18 (keeper): signed up on the phone. `POST /api/v1/auth/register` now returns `403 {"errors":[{"field":"","message":"Sign-up is closed"}]}` (ADR-0010).
