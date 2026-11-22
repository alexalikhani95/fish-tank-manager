# Review 02 — AWS backup infra (c8bb8fd, 61e09e6)

Read-only review. No terraform apply, no AWS write calls.

## Findings

### F1 — minor — the `Null s3:if-none-match` condition rules out multipart uploads

`infra/prod/main.tf`, role policy. CreateMultipartUpload and UploadPart are authorised as `s3:PutObject` but carry no `If-None-Match`, so the Null condition denies them. Checked: the spec (Upload step) and `scripts/backup.sh:167` use a single `aws s3api put-object --if-none-match '*'`, which is a single PUT (up to 5 GB; the dump is KB). Not a defect today. Worth one line in lld.md so nobody "fixes" the upload to `aws s3 cp` later and gets AccessDenied. The 1-day multipart-abort lifecycle rule is harmless.

### F2 — blocker — the trust policy's `sub` will never match: this repo uses GitHub's immutable subject claims

`infra/prod/main.tf`, `aws_iam_role.backup`, `StringEquals` on `token.actions.githubusercontent.com:sub` = `repo:alexalikhani95/fish-tank-manager:ref:refs/heads/main`.

Read-only check of the repo's OIDC subject setting:

```
$ gh api repos/alexalikhani95/fish-tank-manager/actions/oidc/customization/sub
{"use_default":true,"use_immutable_subject":true,"sub_claim_prefix":"repo:alexalikhani95@44570800/fish-tank-manager@1380354722"}
```

With `use_immutable_subject: true`, the token's `sub` starts with `repo:alexalikhani95@44570800/fish-tank-manager@1380354722`, so for `main` it is `repo:alexalikhani95@44570800/fish-tank-manager@1380354722:ref:refs/heads/main`. That is not the string the role expects. `AssumeRoleWithWebIdentity` gets AccessDenied, and ticket 03/04's first real run fails. This fails closed, so it is not a security hole, but the role as written cannot work.

Fix: set `sub` to `repo:alexalikhani95@44570800/fish-tank-manager@1380354722:ref:refs/heads/main` (still `StringEquals`, no wildcard). That is stricter than the name form, because a deleted-and-recreated repo or a renamed owner cannot match. Update the same string in spec.md, ticket 02, lld.md (Backup role row) and ADR-0013 if it quotes it. Before you apply, decode a real token's `sub` from a throwaway `workflow_dispatch` on `main` (ticket 04), or rerun the gh call above. The spec's "IAM simulation" step will not catch this mismatch, because `simulate-principal-policy` does not evaluate the trust policy.

### F3 — passes — the rest of the trust policy

Federated principal is only `aws_iam_openid_connect_provider.github.arn`, the action is only `sts:AssumeRoleWithWebIdentity`, and `StringEquals` (not `StringLike`) is used on the right keys (`token.actions.githubusercontent.com:sub` and `:aud`), with aud `sts.amazonaws.com`. There are no wildcards and a single statement. Forks and `pull_request` runs get a different `sub` (`pull_request`), and so does an `environment:` job. Existing `.github/workflows/ci.yml` runs only on `pull_request` and `workflow_dispatch`, with `permissions: contents: read` (no `id-token: write`), so it cannot get a token today.

### F4 — minor — the risk of "any workflow on main" includes `pull_request_target` and `workflow_run`

A `pull_request_target` or `workflow_run` workflow runs with the base ref (`refs/heads/main`), so its token's `sub` matches this role even when a fork PR triggers it. ADR-0013 accepts "any workflow on main", but this route is the one way a non-pusher could reach the role: a future workflow that checks out PR code under `pull_request_target` with `id-token: write`. Suggest one sentence in ADR-0013 Consequences or the lld Backup role row: never give `id-token: write` to a `pull_request_target`/`workflow_run` workflow. Narrowing further would need `job_workflow_ref` in a custom sub claim, which is out of scope.

### F5 — passes — the role policy is the minimum

There are exactly two statements: `s3:PutObject` on `${bucket_arn}/*` with `Null {"s3:if-none-match": "false"}`, and `ssm:GetParameter` on `data.aws_ssm_parameter.secret["MONGO_URL"].arn` (the existing data source; its ARN is `arn:aws:ssm:eu-west-2:107014414355:parameter/fishtank/prod/MONGO_URL`). There is no Get, List, Delete, tagging, ACL, KMS or `iam:*`, and no other inline or attached policies. The condition key `s3:if-none-match` is the key S3 documents for enforcing conditional writes, with `Null`=`"false"` as in AWS's own example. Condition key names are case-insensitive in IAM anyway. `jsonencode` renders `"false"` as a string, which is correct. No `kms:Decrypt` is right: the quoted `describe-parameters` shows `KeyId: alias/aws/ssm`, and the AWS-managed key's policy allows any account principal to use it through SSM. Small notes, no action needed: PutObject only checks that the header is present, and S3 accepts only `*` for If-None-Match on PUT. The workflow must call `get-parameter` (singular) with `--with-decryption`, because `get-parameters` is a different action.

### F6 — passes — the bucket

`fishtank-backups-107014414355` has all four public-access blocks, SSE-S3 (`AES256`) default encryption, and one enabled lifecycle rule with `filter {}` (whole bucket), 30-day expiration and 1-day multipart abort. There is no `aws_s3_bucket_versioning` resource, so versioning stays disabled, and no bucket policy. New buckets default to BucketOwnerEnforced (ACLs off). Optional hardening, not required by the spec: a bucket policy that denies `aws:SecureTransport = false`.

### F7 — passes — the OIDC provider

`url = "https://token.actions.githubusercontent.com"` and `client_id_list = ["sts.amazonaws.com"]`, with no `thumbprint_list`. The lock file pins hashicorp/aws 6.73.0 (constraint `~> 6.73`), and `thumbprint_list` has been optional since 5.81. AWS also no longer uses thumbprints for this provider. It is valid.

### F8 — passes — outputs, scope and docs

The outputs `backup_bucket` (bucket name) and `backup_role_arn` are added, and the `main.tf` header is unchanged. `git diff main --stat -- infra .github` shows only `infra/prod/main.tf` (+92, additions only, all backup resources), with no edits to existing resources. The quoted plan shows 7 to add, 0 to change, 0 to destroy, with no Lambda change. Infra is in its own commit (c8bb8fd), separate from the docs (61e09e6). The lld.md rows (Backup bucket, GitHub OIDC provider, Backup role, Outputs) match the code. The Backup role row's `sub` string must change with F2. ADR-0013 stays Proposed.

## Summary

1 blocker (F2), 0 important, 2 minor (F1, F4). Everything else passes.
