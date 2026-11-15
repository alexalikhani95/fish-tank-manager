# 03: API live on Lambda

**What to build:** `npm run deploy` takes a clean commit, pushes its image to ECR and stands up the prod API on Lambda behind a public function URL, reading its secrets from SSM; `GET /api/v1/health` on the function URL returns 200 with the database connected (Atlas). No PWA or CloudFront yet. Spec → Implementation Decisions → Runtime environment, Terraform (backend, ECR, Lambda, function URL), Deploy command steps 1–3.

**Blocked by:** 01, 02

**Status:** ready-for-agent — flip to ready-for-human when the Agent items are ticked; the keeper runs the real deploy

**Label:** new design · **Test seams:** the deploy's health check against the function URL (the full CloudFront smoke check lands in 04) · **Risky:** yes — infra, secrets (SSM → Lambda env, values in state), a public endpoint

Agent:

- [ ] Flat Terraform root at `infra/prod/` in `eu-west-2`: S3 backend with `use_lockfile` on `fishtank-tfstate-107014414355` (from 02), own state key; outputs ECR repository URL, function name, function URL; ECR (`MUTABLE`, keep last 10); Lambda (`arm64`, 1024 MB, 15 s, no reserved concurrency, 14-day log group, logs-only role); env per spec incl. `APP_URL=https://localhost`; secrets via SSM data sources; function URL auth `NONE` plus the `lambda:InvokeFunction` permission to `*`
- [ ] Terraform ignore entries in `.gitignore`; provider lock file committed; `terraform fmt -check` and `terraform validate` pass
- [ ] `npm run deploy` script (steps 1–3 for now, minus the PWA build): refuses a dirty tree; `terraform init`; `-target` ECR apply with `-auto-approve`; ECR login; arm64 build + push tagged with the full SHA; interactive full apply with that tag
- [ ] `terraform plan` (with an image tag) output summary quoted in `## Comments`; no apply by the agent
- [ ] `lld.md`: infra layout, the env/SSM wiring and `terraform init`, linking ADR-0012
- [ ] Typecheck, lint, tests green; infra in its own commit

Keeper:

- [ ] Runs `npm run deploy`, reads the plan, types `yes`; then `curl <function URL>/api/v1/health` → 200 `database: connected`, pasted into `## Comments`
- [ ] Runs it again on the same commit: push succeeds (mutable tag) and Terraform shows no changes — expected, not a bug to fix

## Comments
