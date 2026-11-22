# 02: AWS backup infrastructure in Terraform

**What to build:** `infra/prod` gains the private backup bucket, GitHub's OIDC provider and a backup role that can only read the one database secret and add new copies, never read, overwrite or delete one. A reviewed `terraform plan` shows only these new resources. The keeper applies it from the laptop after merge (ticket 04). Spec → Implementation Decisions → Terraform, Rollout order step 1; ADR-0013.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Label:** new design · **Test seams:** none (proved by `fmt`/`validate`/`plan` here and by the IAM simulation in 04) · **Risky:** yes, IAM, a trust policy for an outside identity provider, and a bucket holding prod data

- [x] Bucket `fishtank-backups-107014414355` (the account id already in `main.tf`): all public access blocked, SSE-S3 by default, a lifecycle rule that expires objects after 30 days and aborts incomplete multipart uploads after 1 day, no versioning
- [x] OIDC provider for `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`
- [x] Backup role `fishtank-backup`, trust: `StringEquals` on `sub` = `repo:alexalikhani95/fish-tank-manager:ref:refs/heads/main` and on `aud` = `sts.amazonaws.com`
- [x] Role policy, nothing else: `s3:PutObject` on the bucket's objects with `"Null": {"s3:if-none-match": "false"}`, and `ssm:GetParameter` on the `/fishtank/prod/MONGO_URL` ARN (reuse the existing SSM data source's `.arn`). Run `aws ssm describe-parameters` to confirm the parameter uses `alias/aws/ssm`, and add `kms:Decrypt` only if its key is customer-managed. Quote the result
- [x] Outputs `backup_bucket` and `backup_role_arn`. Leave the `main.tf` header as it is; the role never applies Terraform
- [x] `terraform fmt -check` and `validate` pass (Terraform ≥ 1.10)
- [x] `terraform plan -var image_tag=<live tag>`, where the live tag comes from `aws lambda get-function --function-name fishtank-api --query Code.ImageUri`, shows only the new backup resources and **no Lambda change**. Quote the summary in `## Comments`. No apply by the agent
- [x] `lld.md` infra layout and Outputs list the new resources. ADR-0013 stays Proposed
- [x] Infra in its own commit; typecheck, lint, tests green

## Comments

### 2026-11-22: built (implementer)

Terraform added to `infra/prod/main.tf`: backup bucket (public access block, SSE-S3, 30-day expiry + 1-day multipart abort, no versioning), GitHub OIDC provider, role `fishtank-backup` and its inline policy, outputs `backup_bucket` and `backup_role_arn`. `main.tf` header unchanged. `lld.md` Infra layout gained three rows and the new outputs. ADR-0013 stays Proposed. Nothing applied.

**KMS key check** (`aws ssm describe-parameters --region eu-west-2 --parameter-filters Key=Name,Values=/fishtank/prod/MONGO_URL`):

```
[
    {
        "Name": "/fishtank/prod/MONGO_URL",
        "Type": "SecureString",
        "KeyId": "alias/aws/ssm"
    }
]
```

AWS-managed key, so no `kms:Decrypt` statement.

**Live tag** (`aws lambda get-function --function-name fishtank-api --query Code.ImageUri`): `107014414355.dkr.ecr.eu-west-2.amazonaws.com/fishtank-api:5c1cf4155e68acb1394de1d55b48d7ecf0171a65`

**`terraform fmt -check`**: clean. **`terraform validate`**: `Success! The configuration is valid.` (Terraform v1.17.2)

**Plan** (`terraform plan -lock=false -var image_tag=5c1cf4155e68acb1394de1d55b48d7ecf0171a65`; `-lock=false` so the read-only plan writes no lock file to the state bucket):

```
  # aws_iam_openid_connect_provider.github will be created
  # aws_iam_role.backup will be created
  # aws_iam_role_policy.backup will be created
  # aws_s3_bucket.backups will be created
  # aws_s3_bucket_lifecycle_configuration.backups will be created
  # aws_s3_bucket_public_access_block.backups will be created
  # aws_s3_bucket_server_side_encryption_configuration.backups will be created
Plan: 7 to add, 0 to change, 0 to destroy.
```

Only new backup resources. No Lambda change.
