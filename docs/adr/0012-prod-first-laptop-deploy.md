# 0012. Prod first, deployed from the laptop

- **Status:** Accepted
- **Date:** 2026-11-14

## Context

`PLAN.md` → Phase 2 lands staging and prod together behind one GitHub Actions pipeline (build once, deploy staging, approval gate, promote to prod). That is the end state, but it is several pieces of work before the keeper can log a WaterChange from their phone against real infrastructure: GitHub→AWS login (OIDC), two Terraform roots, a staging smoke test and the approval gate.

The keeper wants to use the app for real now. One person, one environment, a few hundred requests a month.

## Decision

We will ship **prod only** first, **deployed by a script on the keeper's laptop**: build the API image, push it to ECR, `terraform apply`, upload the PWA to S3, and check `/api/v1/health` through CloudFront.

- Terraform is **one flat root, `infra/prod/`**. Shared modules wait until staging gives them a second user.
- State lives in **S3 with Terraform's built-in lock file** (`use_lockfile`), not a DynamoDB lock table.
- Secrets live in **SSM Parameter Store**, put there by hand, and Terraform copies them into the Lambda's environment variables.
- The Lambda **function URL is public** (auth `NONE`). CloudFront's origin access control for Lambda needs a payload hash on every POST, which the PWA's `fetch` does not send.
- Atlas (M0, `eu-west-2`, database `fishtank_prod`) is set up by hand from a runbook.

Alternatives considered:

- **Full pipeline first** — rejected for now. Right end state, but it delays real use by several slices and adds OIDC, staging and the gate before any of it is exercised.
- **The app fetching secrets from SSM at boot** — rejected. More code and a slower cold start, to keep secrets out of a private, encrypted state file.
- **Atlas via Terraform's Atlas provider** — rejected. A one-off cluster does not repay storing Atlas API keys.

## Consequences

- **Deploys depend on the keeper's laptop** and its AWS credentials. No record of what is in prod beyond the image tag. The pipeline slice fixes both.
- **Secrets are readable** in the Terraform state file and the Lambda console, to anyone with access to this AWS account. Acceptable with one account holder.
- **Anyone who finds the function URL can call the API directly**, bypassing CloudFront. They meet the same auth; there is no WAF or rate limit at CloudFront to bypass.
- **No nightly backup yet.** M0 has none; until the backup slice lands, the runbook's manual `mongodump` is the only copy.
- **Revisit** when staging arrives: extract modules, move deploys into GitHub Actions, and decide whether secrets stay in state.
