# 02: AWS backup infrastructure in Terraform

**What to build:** `infra/prod` gains the private backup bucket, GitHub's OIDC provider and a backup role that can only read the one database secret and add new copies, never read, overwrite or delete one. A reviewed `terraform plan` shows only these new resources. The keeper applies it from the laptop after merge (ticket 04). Spec → Implementation Decisions → Terraform, Rollout order step 1; ADR-0013.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Label:** new design · **Test seams:** none (proved by `fmt`/`validate`/`plan` here and by the IAM simulation in 04) · **Risky:** yes, IAM, a trust policy for an outside identity provider, and a bucket holding prod data

- [ ] Bucket `fishtank-backups-107014414355` (the account id already in `main.tf`): all public access blocked, SSE-S3 by default, a lifecycle rule that expires objects after 30 days and aborts incomplete multipart uploads after 1 day, no versioning
- [ ] OIDC provider for `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`
- [ ] Backup role `fishtank-backup`, trust: `StringEquals` on `sub` = `repo:alexalikhani95/fish-tank-manager:ref:refs/heads/main` and on `aud` = `sts.amazonaws.com`
- [ ] Role policy, nothing else: `s3:PutObject` on the bucket's objects with `"Null": {"s3:if-none-match": "false"}`, and `ssm:GetParameter` on the `/fishtank/prod/MONGO_URL` ARN (reuse the existing SSM data source's `.arn`). Run `aws ssm describe-parameters` to confirm the parameter uses `alias/aws/ssm`, and add `kms:Decrypt` only if its key is customer-managed. Quote the result
- [ ] Outputs `backup_bucket` and `backup_role_arn`. Leave the `main.tf` header as it is; the role never applies Terraform
- [ ] `terraform fmt -check` and `validate` pass (Terraform ≥ 1.10)
- [ ] `terraform plan -var image_tag=<live tag>`, where the live tag comes from `aws lambda get-function --function-name fishtank-api --query Code.ImageUri`, shows only the new backup resources and **no Lambda change**. Quote the summary in `## Comments`. No apply by the agent
- [ ] `lld.md` infra layout and Outputs list the new resources. ADR-0013 stays Proposed
- [ ] Infra in its own commit; typecheck, lint, tests green

## Comments
