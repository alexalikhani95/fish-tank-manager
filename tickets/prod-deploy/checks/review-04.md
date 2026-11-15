# Review — ticket 04 (PWA behind CloudFront)

Scope: `git show fbf2097` (infra/prod/main.tf, scripts/deploy.sh), `git show c1e769e` (docs), against `tickets/prod-deploy/spec.md` and `issues/04-pwa-behind-cloudfront.md`.

## Findings

### F1 — minor — scripts/deploy.sh:36 — manifest.webmanifest content type is left to the AWS CLI's guess and never checked

`aws s3 sync web/dist ... --cache-control "no-cache"` sets no `--content-type`; the CLI guesses from Python `mimetypes` (+ the host's mime.types files). `.webmanifest` is not in older tables, so it can land as `binary/octet-stream` (or vary by the deployer's machine/CLI version). The smoke check never requests the manifest.
Failure: Chrome/Android fetches the manifest with the wrong type; install prompt / standalone mode silently breaks on the phone, deploy reports green.
Fix: after the shell sync, `aws s3 cp web/dist/manifest.webmanifest s3://$BUCKET/manifest.webmanifest --content-type application/manifest+json --cache-control no-cache`, and add `expect /manifest.webmanifest 200 application/manifest+json` to the smoke check.
(Downgraded from important after checking: Chrome does not reject a manifest on MIME type, so this is correctness hygiene, not a broken install. Recent Python `mimetypes` does know `.webmanifest`; older CLI builds / macOS `/etc/apache2/mime.types` may not.)

### F2 — minor — scripts/deploy.sh:68 — the garbage-cookie check cannot tell "Cookie reached Adonis" from "Cookie was dropped"

`app/app/middleware/auth_middleware.ts:28-35`: a garbage `token` cookie and no cookie both end in the same `401 UNAUTHORIZED_BODY`. The check matches spec step 6 exactly, but the spec's parenthetical "(the Cookie header reaches Adonis)" is not actually proven, and nothing checks the other half of ADR-0006: `Set-Cookie` coming back, or a non-GET method reaching the function URL.
Failure: a future behaviour/policy change that strips cookies or blocks POST still passes the smoke check; the keeper finds out at sign-in on the phone.
Fix (cheap, no User needed): add `expect /api/v1/auth/logout <its status> application/json -X POST` and assert `header set-cookie` contains `token=` (logout clears the cookie with no auth). That covers POST + Set-Cookie passthrough. Cookie forwarding itself stays proven only by the keeper's phone sign-in — say so in the runbook rather than in the spec parenthetical.

### F3 — minor — scripts/deploy.sh:65-66 — missing `x-cache` header passes the cache-hit check

`XCACHE=$(header x-cache)` is empty if the header is absent, and `[[ "" != *Hit* ]]` passes. The check is meant to prove the call went through CloudFront uncached.
Failure: unlikely today (BASE is the CloudFront URL), but the assertion is weaker than it reads.
Fix: `[[ $XCACHE == *"Miss from cloudfront"* ]] || fail ...` (CachingDisabled always yields `Miss`).

### F4 — minor (PLAUSIBLE) — infra/prod/main.tf (ordered_cache_behavior /api/*) and docs/design/lld.md CloudFront row — `Authorization` on GET may not reach the function URL

AWS documents that `Authorization` cannot be added to an origin request policy and must be in the cache policy to be forwarded on GET/HEAD; CachingDisabled has no headers. Whether the managed AllViewer* policies are an exception is not something I could verify offline. The auth middleware falls back to `Authorization: Bearer` (ADR-0006).
Failure: a non-browser client using Bearer on GET gets 401 through CloudFront. No v1 impact: the PWA uses the cookie.
Fix: none needed for v1; either verify once after the keeper deploy (`curl -H 'Authorization: Bearer x' .../api/v1/me` vs CloudWatch) or soften the lld row to "Cookie and query forwarded; Bearer header via CloudFront not verified".

### F5 — minor — docs/design/lld.md (Rollback) — rollback to a commit before fbf2097 would remove CloudFront and the PWA bucket

The earlier commit's `main.tf` has no distribution/bucket and its `deploy.sh` has no upload/smoke-through-CloudFront. Apply would plan destroying the distribution (and fail on the non-empty bucket), leaving the phone's URL dead.
Failure: keeper rolls back "one commit too far" to before ticket 04 and types yes.
Fix: one line in Rollback: "only to commits at or after ticket 04 (fbf2097); if the plan destroys `aws_cloudfront_distribution.app` or `aws_s3_bucket.pwa`, answer no."

### F6 — minor (ponytail) — infra/prod/main.tf (`/api/*` behaviour, `compress = true`) — no-op setting

CloudFront only compresses when the cache policy enables gzip/brotli; Managed-CachingDisabled does not, so `compress = true` on `/api/*` does nothing and suggests API responses are compressed.
Fix: delete the line.

## Checked and fine

- `/api/*`: all 7 methods, cached GET/HEAD, CachingDisabled + AllViewerExceptHostHeader (Cookie, query, other headers; no Host), HTTPS-only origin, host derived with trimprefix/trimsuffix per Discovered. `Set-Cookie` is passed back by CloudFront by default.
- SPA rewrite on the default behaviour only, viewer-request, `publish = true` + `.arn`; `/api/*` path pattern wins so it is never rewritten. No `custom_error_response`. `force_json_response_middleware` makes the 401 JSON even with `Accept: */*`.
- OAC (s3, always, sigv4) + bucket policy scoped to `AWS:SourceArn` of this distribution, public access blocked, `depends_on` the block; no dependency cycle. 403-not-404 for missing files matches the spec's accepted trade-off.
- Sync order: new `assets/` (immutable) → shell with `no-cache` + `--delete` (exclude also protects `assets/` from deletion) → `assets/ --delete`. No window where a live shell points at a deleted asset; edge copies of the no-cache shell live ≤ MinTTL 1 s and are invalidated anyway.
- Invalidation `/*` and `wait invalidation-completed` before the smoke check.
- Smoke check matches spec step 6; `fail` inside `$(...)` propagates via the assignment's status under `set -e`; no `-f`, status compared explicitly; `--retry` without `-f` still retries 408/429/5xx/timeouts and only on the first health call (cold start); 4xx not retried.
- Dirty tree: `git status --porcelain` refuses before anything runs (untracked files included). `web/` reads no `import.meta.env`, so ignored env files cannot change the PWA build.
- `terraform apply` answered "no" exits non-zero, so nothing after step 3 runs.
- Runbook "lost the race" collections (`users`, `tanks`, `waterchanges`, keyed by `userId`) match today's models.

## Verdict

blockers=0 total=6. Safe for the keeper to run; F2 is the one worth doing before the deploy since it is the only automated proof of the ADR-0006 cookie path.
