# Review — ticket 03 (API on Lambda)

Scope: `git show eb66047` (infra/prod/main.tf, scripts/deploy.sh, .gitignore, package.json), docs commits a975d0f, 5967610. Read-only; no plan/apply/push run.

## Findings

### F1 — important — deploy.sh has no `pipefail` (`#!/bin/sh`, `set -eu`)

`scripts/deploy.sh:3`. The ECR login is `aws ecr get-login-password ... | docker login --password-stdin`. Without pipefail, an `aws` failure (expired SSO, wrong profile) is hidden; docker login then fails on an empty password with a confusing message, or — worse — succeeds off a cached credential in the Docker keychain and the script carries on as if the login were fresh. Fix: `#!/usr/bin/env bash` + `set -euo pipefail` (macOS bash 3.2 supports it). The ticket/brief asked for `set -euo pipefail`.

### F2 — important — add explicit function URL permissions, tracked in state (with `invoked_via_function_url = true`)

Checked the provider source at v6.73.0 (`internal/service/lambda/function_url.go`). The builder is right that Create adds both statements: `FunctionURLAllowPublicAccess` (`lambda:InvokeFunctionUrl`, `*`) and `FunctionURLAllowInvokeAction` (`lambda:InvokeFunction`, `InvokedViaFunctionUrl: true`, `*`). It ignores `ResourceConflictException` if a statement ID already exists. So the first deploy will work. But:

- **No drift detection.** Neither statement is in state, and Read never looks at the function policy. If one is removed (by hand, or by a future AWS change), `plan` shows "no changes" while the URL returns 403.
- **Only on Create.** Update calls only `UpdateFunctionUrlConfig`, and Delete never removes the statements. A future `AWS_IAM` to `NONE` change (or the reverse) leaves the policy wrong without anyone seeing it, and removing the URL leaves the public statements behind.
- **Hidden dependency on a provider side effect.** Lambda's own `CreateFunctionUrlConfig` API adds nothing. This works only because of provider code that changed in 6.28 and could change again.

Recommendation: add two `aws_lambda_permission` resources. Give them **statement IDs different from the provider's** (e.g. `PublicFunctionUrl` and `PublicInvokeViaFunctionUrl`). Reusing the provider's IDs would conflict: the URL is created first, so the permission's `AddPermission` gets `ResourceConflictException`. Duplicate statements under different IDs are allowed and harmless.

```hcl
resource "aws_lambda_permission" "url_public" {
  statement_id           = "PublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}
resource "aws_lambda_permission" "url_invoke" {
  statement_id             = "PublicInvokeViaFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "*"
  invoked_via_function_url = true # without this, any AWS account can call lambda:Invoke directly
}
```

(`invoked_via_function_url` is a documented argument of `aws_lambda_permission` in 6.73.) **Security note:** the ticket's Agent item and the spec say "the `lambda:InvokeFunction` permission to `*`". Taken literally, without `invoked_via_function_url = true`, that lets any principal call the Lambda Invoke API directly, outside the URL and CloudFront. Whoever adds the permission must keep that condition.

### F3 — minor — ticket and spec disagree with what was built

Ticket 03's first Agent item is ticked but promises "plus the `lambda:InvokeFunction` permission to `*`", which was not built. Spec → Terraform still says the URL resource "only adds the first, so add a permission for the second", while spec → Discovered says the opposite. Whatever F2 settles, make the spec body, the ticket checkbox and lld.md's Function URL row say the same thing, and spell out the `InvokedViaFunctionUrl` condition there.

### F4 — minor — `HOST=0.0.0.0` is also read by Lambda Web Adapter

LWA 1.0.0 still honours the old unprefixed `HOST` (deprecated, to be removed in 2.0) as the address _it dials_ to reach the app. Default is 127.0.0.1. So the adapter will connect to `0.0.0.0:8080`. On Linux that reaches loopback, so it works, but by accident. Adonis needs `HOST` (env.ts), so keep it. Note it in lld.md so nobody "fixes" it into something that breaks the adapter, e.g. a specific interface IP. `PORT=8080` matches LWA's default/fallback. `AWS_LWA_READINESS_CHECK_PATH` is the current name. The default healthy range 100–499 treats the 503 from `/api/v1/health` as not ready, which is correct.

### F5 — minor — a bad `MONGO_URL` will time out instead of failing with a clear error

`providers/mongo_provider.ts` awaits `mongoose.connect` at boot with the default `serverSelectionTimeoutMS` of 30 s. That is longer than Lambda's 10 s init cap and the 15 s timeout. A wrong URL or Atlas network rule therefore shows up as init/invoke timeouts, not as a Mongo error in CloudWatch. Fix (app code, so outside this ticket): pass `{ serverSelectionTimeoutMS: 5000 }`. At minimum, the runbook's troubleshooting should say "timeout = check MONGO_URL / Atlas access list".

### F6 — minor — the deploy prints the health URL but never checks it

The ticket lists "the deploy's health check against the function URL" as the test seam. `deploy.sh` only echoes the URL, so a Lambda that fails to boot still prints `✓ deployed`. Either `curl -fsS --retry 5 --retry-all-errors` it before printing ✓, or change the wording to "prints" and leave the check to the keeper (Keeper item) and the ticket 04 smoke check. The `✓` is misleading as it stands.

### F7 — minor — `-auto-approve` on the `-target` ECR apply

Today this only creates or updates `aws_ecr_repository.api`, and data sources are not read (nothing targeted depends on them), so it is safe. But any later edit to that resource (rename, a change that forces replacement) is applied without review. `force_delete` is unset, so replacing a repository that holds images fails rather than wiping them. That is the right safety net: keep `force_delete` off. Worth one line in a comment.

### F8 — minor — the whole Lambda environment map shows as `(sensitive value)` in plan

`merge()` with the SSM values marks all of `environment.variables` sensitive, so the keeper can't see a change to plain vars (e.g. `LOG_LEVEL`) in the interactive plan either. Accepted cost. lld.md's "Plan shows them as `(sensitive value)`" is accurate but could say "the whole env map". No secret is echoed by the script: no `set -x`, and `terraform output` is read only for non-secret outputs.

### F9 — minor — things ticket 04 (CloudFront) will hit

- `function_url` is `https://<id>.lambda-url.eu-west-2.on.aws/`. A CloudFront `domain_name` needs only the host: `trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")` (or `split("/", …)[2]`).
- The function URL stays public and can be reached without CloudFront (auth `NONE`, ADR-0012). With no reserved concurrency and no WAF (ADR-0004), that is the accepted exposure. Don't put anything into CloudFront that the API relies on for security (e.g. a header-based "only from CloudFront" check) without revisiting this.
- `AllViewerExceptHostHeader` means Adonis sees the function URL host. Fine today: nothing reads `APP_URL` or the host for absolute URLs, and `auth_token.ts` sets `secure: true` explicitly, so no trust-proxy/protocol detection is needed.
- Same-origin `POST`s carry `Origin: https://<dist>.cloudfront.net`. CORS `origin: []` in production only withholds CORS headers and doesn't reject, so same-origin calls work.
- The final `echo` in `deploy.sh` must move to the CloudFront URL in 04.
- Lambda adds an ECR repository policy (`LambdaECRImageRetrievalPolicy`) on function create, outside Terraform. Harmless and no drift (no `aws_ecr_repository_policy` is managed). Don't add one in 04 without including Lambda's statement.

## Verified OK

- Env vars cover every key in `app/start/env.ts`: NODE_ENV enum, PORT number, HOST `0.0.0.0` (passes the host format), LOG_LEVEL, APP_KEY, APP_URL (`https://localhost` passes the url format with `tld:false`), JWT_SECRET (≥32 is the keeper's job, as the runbook says), MONGO_URL. `TZ` is an unreserved Lambda var. `APP_URL` is exported in `config/app.ts` but nothing imports it.
- `arm64` function ↔ `--platform linux/arm64` image. Base `node:24-slim` and the LWA image are multi-arch. `--provenance=false` + `oci-mediatypes=false` + `push=true` gives a single Docker v2 manifest, which Lambda accepts.
- IAM: trust is `lambda.amazonaws.com` only. Policy is `logs:CreateLogStream`/`PutLogEvents` on `<log group arn>:*` (the provider strips `:*` from `arn`, so the suffix is right). No `CreateLogGroup`, because Terraform owns the group, and `depends_on` orders it before the function. No ECR permissions are needed on the execution role. Least-privilege.
- SSM data sources use `with_decryption` by default, and `value` is sensitive. Secrets live in state and the Lambda console, as ADR-0012 accepts. State bucket encrypted.
- Script: `git status --porcelain` also catches untracked files (ignored `.env` files are excluded from the image by `.dockerignore`). The tag is the full `rev-parse HEAD`. ECR login uses `eu-west-2`, the same as provider and backend, and `${REPO%%/*}` is the registry host. The full apply has no `-auto-approve`, so it is interactive, and saying no exits non-zero. The script is mode 100755, and `npm run deploy` maps to it.
- `.gitignore` covers `.terraform/`, state and `*.tfvars`. The lock file is committed.
- `terraform fmt -check` passes. `terraform validate` passes with Terraform 1.17.2 (scratch binary). Read-only AWS checks: `/fishtank/prod` parameters still `[]`, so plan can't run yet, as the ticket says. The `fishtank-api` function doesn't exist yet.
- Docs a975d0f / 5967610: the lld.md infra table, Lambda environment, and Deploy steps match main.tf / deploy.sh. Apart from F2/F3/F8 wording, the claims are accurate. "Re-running on the same commit shows no changes" is true because `image_uri` is unchanged. Note that a rebuilt image with a different digest under the same tag is _not_ picked up by Lambda until the URI changes. That's fine for the same commit, but don't count on a re-run to refresh the image.

## Tally

blockers: 0 · important: 2 (F1, F2) · minor: 7 (F3–F9) · total: 9
