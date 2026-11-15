# 02: One-off setup — state bucket, Atlas, secrets

**What to build:** Everything the deploy needs that Terraform can't make for itself exists, and the steps to redo it are written down. An agent writes the setup part of the runbook in `lld.md` and creates the Terraform state bucket; the keeper then follows the runbook to create the Atlas M0 cluster and put the three secrets into SSM. Spec → Implementation Decisions → Atlas, Runbook contents.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human — Agent items done; the session waits for the keeper before 03

**Label:** boilerplate · **Test seams:** none (checked by `aws` commands) · **Risky:** yes — secrets; the keeper enters every secret value themselves, none passes through an agent or chat

Agent:

- [x] `lld.md` runbook, setup section: create the state bucket `fishtank-tfstate-107014414355` (versioned, encrypted, public access blocked, `eu-west-2`); Atlas M0 steps incl. region fallback, DB user scoped to `fishtank_prod`, `0.0.0.0/0`, connection string format; generating `APP_KEY` and `JWT_SECRET`; the exact `aws ssm put-parameter --type SecureString` commands for `/fishtank/prod/MONGO_URL`, `/fishtank/prod/APP_KEY`, `/fishtank/prod/JWT_SECRET`
- [x] State bucket created by running that runbook step; `aws s3api get-bucket-versioning` / `get-public-access-block` output quoted in `## Comments`

Keeper:

- [ ] Atlas M0 cluster, DB user and network access created; note the region used in `## Comments`
- [ ] Three SSM parameters exist: `aws ssm get-parameters-by-path --path /fishtank/prod --query 'Parameters[].Name'` lists all three (names only, no values)

## Comments

Agent, 2026-11-15: runbook is `docs/design/lld.md` → Prod runbook → One-off setup. Bucket `fishtank-tfstate-107014414355` created in eu-west-2 by running its step 1 verbatim. `generate:key --show` output format (`APP_KEY = <value>`) confirmed locally; the command in the runbook strips the prefix. No SSM parameters were created.

```
$ aws s3api get-bucket-versioning --bucket fishtank-tfstate-107014414355
{ "Status": "Enabled" }

$ aws s3api get-public-access-block --bucket fishtank-tfstate-107014414355
{ "PublicAccessBlockConfiguration": { "BlockPublicAcls": true, "IgnorePublicAcls": true,
    "BlockPublicPolicy": true, "RestrictPublicBuckets": true } }

$ aws s3api get-bucket-encryption --bucket fishtank-tfstate-107014414355
{ "ServerSideEncryptionConfiguration": { "Rules": [ { "ApplyServerSideEncryptionByDefault":
    { "SSEAlgorithm": "AES256" }, "BucketKeyEnabled": false,
    "BlockedEncryptionTypes": { "EncryptionType": ["SSE-C"] } } ] } }
```
