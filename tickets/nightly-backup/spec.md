# Nightly backup

Status: ready-for-agent

## Problem Statement

The keeper's whole log (their User, Tanks and WaterChanges) lives in one place: the prod MongoDB Atlas M0 cluster, which keeps no backups. If that database is deleted, corrupted by a bad deploy, or lost by Atlas, the log is gone, and the log is the one thing `PRD.md` → Success criteria depends on. Today the only safety net is the runbook's manual `mongodump`, which happens only when the keeper remembers.

## Solution

Every night a scheduled GitHub Actions job dumps the prod database and **proves the copy restores**. It loads the copy into a throwaway MongoDB inside the job and checks that every collection came back whole. Only then does it save the copy to a private S3 bucket in the keeper's AWS account. Copies expire after 30 days. If any step fails, the job fails and GitHub emails the keeper. GitHub reaches AWS with a short-lived OIDC login whose role can only read the one database secret and add new copies: it can never read, overwrite or delete a saved copy. The cost is about $0 a month.

## User Stories

1. As a keeper, I want my log copied every night without doing anything, so that I lose at most a day if the database is lost.
2. As a keeper, I want the copy made while my laptop is off, so that backups don't depend on me.
3. As a keeper, I want each copy kept 30 days and then deleted automatically, so that storage never grows and I never clean up by hand.
4. As a keeper, I want every copy restored and checked before it is saved, so that I know my backups actually work.
5. As a keeper, I want the check to fail if a copy is missing my Users, Tanks or WaterChanges (any of the three empty or absent), or if any collection restores a different number of documents than were dumped, so that an empty or broken copy never passes as a backup.
6. As a keeper, I want a failed backup to email me, so that I find out the same day rather than when I need the copy.
7. As a keeper, I want the job to run at about 3am UK time, so that it never runs while I'm logging at the tank.
8. As a keeper, I want to run a backup by hand from GitHub, so that I can take one before a risky change and check the job after setup.
9. As a keeper, I want GitHub to hold no AWS key or database password, so that nothing stored in GitHub can leak.
10. As a keeper, I want the database password read from where it already lives (SSM), so that there is one copy of each secret.
11. As a keeper, I want GitHub's AWS access limited to reading that one secret and adding new copies, so that a compromised job can't read or wipe my backups.
12. As a keeper, I want a saved copy impossible to overwrite, so that "add-only" really means add-only.
13. As a keeper, I want only workflows on `main` of my repository to get AWS access, so that a fork or pull request in my public repo can't.
14. As a keeper, I want the copies encrypted at rest and the bucket private, so that my data and password hash never become public.
15. As a keeper, I want a written restore procedure from the newest copy, so that recovery is a set of steps, not a memory test.
16. As a keeper, I want the manual backup to work on my laptop even when Homebrew can't install the MongoDB tools, so that the fallback isn't blocked by my OS version.
17. As a keeper, I want to know if GitHub turns the schedule off for inactivity, so that backups don't stop silently.
18. As a keeper, I want the infrastructure changes applied from my laptop as today, so that the deploy model stays the one I know (ADR-0012).
19. As a future maintainer, I want the bucket, OIDC provider and role written as Terraform in `infra/prod`, so that prod can be rebuilt from the repo.
20. As a future maintainer, I want the GitHub→AWS trust recorded as an ADR, so that the first CI-to-AWS link is a deliberate, reviewable decision that the deploy pipeline can reuse.
21. As a future maintainer, I want `docs/status.md` to show when the nightly backup was last verified, so that the repo matches reality.

## Implementation Decisions

**Where it runs:** a GitHub Actions workflow on `schedule` plus `workflow_dispatch`, in its own workflow file separate from CI.

- **Schedule:** cron `17 3 * * *` (UTC). That is about 3am in winter and 4am in summer; the off-minute dodges GitHub's top-of-hour delays.
- **Runner:** `runs-on: ubuntu-22.04`, pinned like CI, because MongoDB rejects newer kernels. Same shortcut comment as CI.
- **Permissions:** `permissions: id-token: write, contents: read`.
- **No `environment:`:** setting one would change the OIDC `sub` claim and the role would refuse the login.
- **Cost:** the repo is public, so Actions minutes are free.

**One script does the work:** a bash script in `scripts/` (prior art: `scripts/deploy.sh`, with `set -euo pipefail` and a `fail()` helper). The workflow calls it in a single step, so the secret never passes between steps.

Its interface, from environment variables:

- `SOURCE_URI`: the database to dump. When unset, the script reads `/fishtank/prod/MONGO_URL` from SSM (`--with-decryption`, region `eu-west-2`).
- `BACKUP_BUCKET`: where to upload. When unset, the script dumps and verifies but uploads nothing; that is the laptop mode.
- `ARCHIVE`: an existing archive file. When set, the script skips the dump and only verifies, so a broken file can be tested.

**Tools:** the script starts its own throwaway `mongo:8` container (`docker run -d --rm`), the same image CI uses, and runs `mongodump`, `mongorestore` and `mongosh` inside it with `docker exec`. The archive goes through a bind-mounted temp directory, and the URI goes in with `-e`, never as a command-line argument. There is no service container and nothing is installed from apt or Homebrew, so CI and the laptop run exactly the same code. A `trap` removes the container and the temp directory on exit.

**Steps (a copy is saved only if it passed):**

1. **Credentials.** In the workflow, assume the AWS role via OIDC (`aws-actions/configure-aws-credentials`, pinned to a major version), region `eu-west-2`.
2. **Read the secret.** Get the source URI from SSM, then `::add-mask::` both the full URI and its password part.
3. **Dump.** Run `mongodump --archive --gzip`. Parse its `done dumping <db>.<collection> (N documents)` lines into the dumped counts, and fail if no line parses.
4. **Restore.** `mongorestore` the archive into the throwaway container, under the same database name, which comes from the dump lines rather than the URI.
5. **Check.** All of these must hold, or the job fails:
   - `users`, `tanks` and `waterchanges` (the real collection names, from the Mongoose models) are each present with at least 1 document, in both the dump and the restore.
   - Every dumped collection restores exactly its dumped count. Compare against the dump's own counts, not live prod: M0 can't do `--oplog`, so a write landing mid-dump must not cause a false mismatch.
   - `mongorestore` reports `0 document(s) failed`, and every command exits zero.
   - If the keeper ever deletes every WaterChange, the backup fails loudly. That is accepted; it is the "empty dump" rule the user chose.
6. **Upload.** If `BACKUP_BUCKET` is set, `aws s3api put-object --if-none-match '*'` to key `fishtank_prod/<UTC timestamp to the second>.gz`. This uses `s3api`, not `s3 cp`, because `s3 cp` may not send the header.

**Adding a new collection later** (for example WaterTests) means adding it to the script's required list. `lld.md` says so.

**Log hygiene (public repo, public logs):** the script prints only collection names and counts. It never prints documents, never uses `set -x`, and never echoes a URI.

**Failure email:** no extra alerting. GitHub emails the account that last edited the cron line when a scheduled run fails, but only if that account's Actions email notifications are on. The keeper checks GitHub → Settings → Notifications → Actions once at setup.

**Terraform (`infra/prod`), applied by the keeper from the laptop (ADR-0012):**

- **Backup bucket** `fishtank-backups-<account id>`:
  - public access fully blocked, default SSE-S3 encryption;
  - a lifecycle rule that expires objects after 30 days and aborts incomplete multipart uploads after 1 day;
  - no versioning.
- **GitHub OIDC provider** for `token.actions.githubusercontent.com`, audience `sts.amazonaws.com`.
- **Backup role.** It trusts that provider with `StringEquals` on `sub` = `repo:alexalikhani95/fish-tank-manager:ref:refs/heads/main` and `aud` = `sts.amazonaws.com`. That admits any workflow on `main`, not only this one, which is accepted (ADR-0013). Its policy allows only:
  - `s3:PutObject` on the bucket's objects, only when the request carries `If-None-Match` (`"Null": {"s3:if-none-match": "false"}`). S3 itself then refuses to overwrite with a 412.
  - `ssm:GetParameter` on the `/fishtank/prod/MONGO_URL` ARN only. No `kms:Decrypt` is needed, because the parameter uses the AWS-managed `alias/aws/ssm` key. Verify that with `aws ssm describe-parameters` (it shows the `KeyId`), and add a KMS statement only if the key is customer-managed.
  - Nothing else: no `s3:GetObject`, `s3:ListBucket` or `s3:DeleteObject`, and no other S3 or SSM action.
- **Outputs:** the backup bucket name and the role ARN. The workflow holds both as plain values; they are not sensitive, and the account id is already public in bucket names. They must match the Terraform outputs.
- **Header comment:** the `main.tf` header still says it is applied by `npm run deploy`. That stays true.

**Rollout order** (so the first 03:17 run doesn't fail because the role doesn't exist yet):

1. **Before merge:** the builder runs `terraform plan -var image_tag=<the tag live now>`. Read the live tag with `aws lambda get-function --function-name fishtank-api --query Code.ImageUri`. The plan must show only the new backup resources and **no Lambda change**. Its summary is quoted in the ticket.
2. **Merge.**
3. **Same day:** the keeper (or the agent, if asked) runs `npm run deploy` from `main`. That applies the backup resources, and redeploys the app at the same code, which is harmless.
4. **First run:** run the workflow by hand (`gh workflow run`) and check that it passes and one object lands in the bucket.
5. **IAM checks:** record the results (Testing Decisions).
6. **Follow-up PR:** the `docs/status.md` Backups row, the ticket results, and ADR-0013 flipped to Accepted.

**Atlas:** no change. The access list is already `0.0.0.0/0` (ticket 03 of prod-deploy), so GitHub runners can reach it.

**Runbook (`lld.md`, the existing Manual backup section, reworked):**

- **The nightly job:** what it does, where the copies live, and how to run it by hand (`gh workflow run`).
- **Restore from the newest copy,** with the keeper's own AWS credentials (the backup role can't read):
  1. List the bucket and pick the newest key.
  2. `aws s3 cp` it down.
  3. `mongorestore` as today. The `--drop` warning stays.
- **Manual dump and restore:** the commands use the `mongo:8` Docker image, so they work without Homebrew. The `brew install` line stays as an optional alternative. The manual dump can simply be the script with `BACKUP_BUCKET` unset.
- **The 60-day trap:** GitHub disables scheduled workflows in a public repo after 60 days without commits. It emails a warning first. Re-enable from the Actions tab within 30 days of the last good copy, or every copy will have expired.
- **One-time setup:** check the Actions email notification setting.

**ADR-0013 (new, Proposed until merge):** GitHub Actions reaches AWS through OIDC with a narrow role per purpose; any workflow on `main` can use it. It records that ADR-0012's "no nightly backup yet" consequence no longer holds, while infra is still applied from the laptop. ADR-0012 is not edited.

**Docs:**

- `docs/status.md` gets a Backups row (bucket, schedule, last verified run) in the follow-up PR, once a real run has passed.
- `PLAN.md` Phase 2 ticks the nightly-backup item.
- `hld.md` gets the backup flow if its deploy picture shows data stores.

## Testing Decisions

- **No app tests:** there are no application code changes, so no new Japa or Vitest tests. Typecheck, lint and tests stay green.
- **One seam: the script's restore-and-check step.** It runs on every backup, so the backup tests itself.
- **Acceptance:** a real `workflow_dispatch` run on `main` after the rollout passes and leaves one object in the bucket.
- **Negative checks, before merge, on the laptop:** each runs against the dev MongoDB through Docker Desktop (`host.docker.internal`), with `BACKUP_BUCKET` unset. Each must go red with a clear message:
  1. **Empty database:** `SOURCE_URI` points at an empty database.
  2. **Missing collection:** a database with `users` and `tanks` but no `waterchanges`.
  3. **Broken archive:** `ARCHIVE` is a truncated copy of a good dump.

  A good dev database must go green. Paste the output of all four into the ticket.

- **Terraform:** `terraform fmt -check`, `validate` and the reviewed `plan` from the rollout order (Terraform ≥ 1.10).
- **IAM is proven, not assumed** (after apply, from the laptop, with no new standing permissions):
  - Run `aws iam simulate-principal-policy` on the role for: `s3:GetObject`, `s3:ListBucket`, `s3:DeleteObject`, `ssm:GetParameter` on another parameter, and `s3:PutObject` without `s3:if-none-match`. Each must be denied.
  - Run `s3:PutObject` with `s3:if-none-match` and `ssm:GetParameter` on `MONGO_URL`. Each must be allowed.
  - The real run proves the login and the upload work. Results go in the ticket.
- **Workflow syntax:** run `actionlint` if available.

## Out of Scope

Staging backups; Atlas paid tiers or Atlas-native snapshots; cross-region or cross-account copies; S3 Object Lock or versioning; point-in-time recovery; restoring automatically into prod; Slack or other alerting beyond GitHub's email; a keep-alive commit to dodge the 60-day disable; the deploy pipeline itself (it may reuse the OIDC provider later); backing up anything other than the prod database (the PWA bucket and images are rebuilt from git).

## Further Notes

- **30 days with no versioning can leave zero copies:** expiry deletes by age, so if the job fails unnoticed or is disabled for more than 30 days, every copy expires. Accepted with the 30-day rule; the runbook says to fix a failing or disabled job within 30 days.
- At current size each copy is about 1 KB. Storage and requests cost well under a cent a month.
- The role can read the prod `MONGO_URL`, so a job running on `main` can read the prod database. That is the trade for not keeping a second copy of the secret in GitHub. Only the keeper can push to `main`.
- Infra and workflow files go in their own commits, separate from docs (`AGENTS.md` → Commit discipline).
- `docs/adr/` already has two files numbered 0012, so the new ADR is 0013.

## Carried to review

- Spec check 13: nothing proves the failure email actually arrives (only that the setting is on). A deliberate failing run was not added, to keep probe code out of the workflow. Review: is the notification-setting check enough?
- Spec check 11: `simulate-principal-policy` proves the policy, not S3's own 412 on a second write to the same key. Accepted; the real run proves the happy path.
