# 03: API live on Lambda

**What to build:** `npm run deploy` takes a clean commit, pushes its image to ECR and stands up the prod API on Lambda behind a public function URL, reading its secrets from SSM; `GET /api/v1/health` on the function URL returns 200 with the database connected (Atlas). No PWA or CloudFront yet. Spec → Implementation Decisions → Runtime environment, Terraform (backend, ECR, Lambda, function URL), Deploy command steps 1–3.

**Blocked by:** 01, 02

**Status:** ready-for-agent — flip to ready-for-human when the Agent items are ticked; the keeper runs the real deploy

**Label:** new design · **Test seams:** the deploy's health check against the function URL (the full CloudFront smoke check lands in 04) · **Risky:** yes — infra, secrets (SSM → Lambda env, values in state), a public endpoint

Agent:

- [x] Flat Terraform root at `infra/prod/` in `eu-west-2`: S3 backend with `use_lockfile` on `fishtank-tfstate-107014414355` (from 02), own state key; outputs ECR repository URL, function name, function URL; ECR (`MUTABLE`, keep last 10); Lambda (`arm64`, 1024 MB, 15 s, no reserved concurrency, 14-day log group, logs-only role); env per spec incl. `APP_URL=https://localhost`; secrets via SSM data sources; function URL auth `NONE` plus the `lambda:InvokeFunction` permission to `*`
- [x] Terraform ignore entries in `.gitignore`; provider lock file committed; `terraform fmt -check` and `terraform validate` pass
- [x] `npm run deploy` script (steps 1–3 for now, minus the PWA build): refuses a dirty tree; `terraform init`; `-target` ECR apply with `-auto-approve`; ECR login; arm64 build + push tagged with the full SHA; interactive full apply with that tag
- [ ] `terraform plan` (with an image tag) output summary quoted in `## Comments`; no apply by the agent
- [x] `lld.md`: infra layout, the env/SSM wiring and `terraform init`, linking ADR-0012
- [x] Typecheck, lint, tests green; infra in its own commit

Keeper:

- [ ] Runs `npm run deploy`, reads the plan, types `yes`; then `curl <function URL>/api/v1/health` → 200 `database: connected`, pasted into `## Comments`
- [ ] Runs it again on the same commit: push succeeds (mutable tag) and Terraform shows no changes — expected, not a bug to fix

## Comments

**2026-11-15, agent (Agent items).** `infra/prod/main.tf`, `scripts/deploy.sh` (`npm run deploy`), `.gitignore`, `lld.md` → Prod runbook (Infra layout, step 4, Deploy). `terraform init` (S3 backend), `fmt -check` and `validate` pass; provider lock file committed (`hashicorp/aws` 6.73.0). Typecheck, lint, `npm test` (76), `npm run test:web` (11), script tests (15) and `check-status-claims.sh` green.

- **Plan not run yet:** `aws ssm get-parameters-by-path --region eu-west-2 --path /fishtank/prod` returned `[]`, so the three `aws_ssm_parameter` data sources fail to read. Re-run once they exist: `terraform -chdir=infra/prod plan -var image_tag=$(git rev-parse HEAD)`. The plan item stays unticked and Status stays ready-for-agent until then.
- **Terraform ≥ 1.10 needed** (`use_lockfile`). The laptop's `/opt/homebrew/bin/terraform` is 1.5.7 (Homebrew's formula is frozen there) and fails `required_version`; install `brew install hashicorp/tap/terraform`. The agent ran checks with a checksum-verified 1.17.2 binary in its scratchpad.
- **Function URL permissions, verified 2026-11-15:** AWS docs (urls-auth) say since October 2025 a `NONE` URL needs both `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction` (with `lambda:InvokedViaFunctionUrl`) for `*`. The spec assumed the URL resource adds only the first; that changed in AWS provider 6.28.0 (Jan 2026, #44858), which adds both statements (`FunctionURLAllowPublicAccess`, `FunctionURLAllowInvokeAction`) on create. With `~> 6.73` pinned, no separate `aws_lambda_permission` was added. If the keeper's curl gets 403, that is the first place to look.
- **Dirty tree:** `npm run deploy` refuses while `package-lock.json` carries its local diff in this worktree; run it from a clean checkout (or after restoring that file).
