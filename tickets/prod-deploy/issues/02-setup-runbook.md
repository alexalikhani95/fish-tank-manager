# 02: One-off setup — state bucket, Atlas, secrets

**What to build:** Everything the deploy needs that Terraform can't make for itself exists, and the steps to redo it are written down. An agent writes the setup part of the runbook in `lld.md` and creates the Terraform state bucket; the keeper then follows the runbook to create the Atlas M0 cluster and put the three secrets into SSM. Spec → Implementation Decisions → Atlas, Runbook contents.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent — flip to ready-for-human when the Agent items are ticked; the session waits for the keeper before 03

**Label:** boilerplate · **Test seams:** none (checked by `aws` commands) · **Risky:** yes — secrets; the keeper enters every secret value themselves, none passes through an agent or chat

Agent:

- [ ] `lld.md` runbook, setup section: create the state bucket `fishtank-tfstate-107014414355` (versioned, encrypted, public access blocked, `eu-west-2`); Atlas M0 steps incl. region fallback, DB user scoped to `fishtank_prod`, `0.0.0.0/0`, connection string format; generating `APP_KEY` and `JWT_SECRET`; the exact `aws ssm put-parameter --type SecureString` commands for `/fishtank/prod/MONGO_URL`, `/fishtank/prod/APP_KEY`, `/fishtank/prod/JWT_SECRET`
- [ ] State bucket created by running that runbook step; `aws s3api get-bucket-versioning` / `get-public-access-block` output quoted in `## Comments`

Keeper:

- [ ] Atlas M0 cluster, DB user and network access created; note the region used in `## Comments`
- [ ] Three SSM parameters exist: `aws ssm get-parameters-by-path --path /fishtank/prod --query 'Parameters[].Name'` lists all three (names only, no values)

## Comments
