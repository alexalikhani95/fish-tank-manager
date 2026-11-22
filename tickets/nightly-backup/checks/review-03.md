# Review 03 — nightly workflow (ec2ef2f, a5c962e)

Read-only review. No workflows triggered, no AWS writes.

## Findings

1. **minor — checkout persists the GITHUB_TOKEN.** `.github/workflows/backup.yml` uses `actions/checkout@v4` without `persist-credentials: false`, so the token is written to `.git/config` for the rest of the job, where `scripts/backup.sh` (and anything it runs) can read it. The token is only `contents: read` and the repo is public, so the impact is low, but the job never runs git after checkout. Fix: add `with: persist-credentials: false`.

2. **minor — action pins are mutable major tags; a SHA pin would matter here (keeper's call).** `actions/checkout@v4` and `aws-actions/configure-aws-credentials@v4` follow the spec ("pinned to a major version"), so this is not a spec miss. But the job has `id-token: write`, and every step can mint the OIDC token (`ACTIONS_ID_TOKEN_REQUEST_*` is in each step's env). A moved or hijacked `v4` tag of either action could assume `fishtank-backup` and read the prod `MONGO_URL`. That is the worst case the role exists to limit, and it is the one gap left. CI's major-tag pins carry no AWS reach, so this workflow is where a pin pays off. Fix if the keeper wants it: full commit SHAs with a `# v4.x.y` comment, in this file only. Needs your decision: it changes a spec decision.

3. **minor — "The nightly job (below)" in Manual backup points the wrong way.** `docs/design/lld.md` → Manual backup says the nightly job is "below". The `### Nightly backup` section comes directly above it. Fix: "(above)", or link `→ Nightly backup`.

4. **minor — the bucket name and the 30-day expiry are written again in the runbook.** `lld.md` → Nightly backup hard-codes `B=fishtank-backups-107014414355` and repeats "Copies expire after 30 days". Both already live in the Infra layout table a few lines up (one home per fact), and the bucket is also in the workflow, where it is needed. The runbook already says "change them there if the Terraform outputs change", but the `B=` line is a third copy it does not mention. Fix: drop the 30-day sentence (link Infra layout → Backup bucket), and write `B=$(terraform -chdir=infra/prod output -raw backup_bucket)`, or say the name comes from Infra layout.

5. **minor — the restore one-liner breaks on an empty bucket, which is exactly the 60-day-trap case.** If every copy has expired, `list-objects-v2` returns no `Contents`. `sort_by(null, …)` then errors with a JMESPath type error, or `KEY` ends up as `None`, and `aws s3 cp s3://…/None` fails with a confusing 404. Fix: one line after it saying "no key, or `None`, means no copies are left: see the 60-day trap", or guard with `[ "$KEY" != None ]`.

6. **minor (answers carried spec check 13) — the email can be proven without probe code.** Dispatching the workflow on a non-main branch (`gh workflow run backup.yml --ref feature/nightly-backup`) fails at `configure-aws-credentials`, because the `sub` is `…:ref:refs/heads/feature/nightly-backup`. It fails before any AWS read or the script runs. GitHub sends failed `workflow_dispatch` runs to the dispatcher, so one run proves both "fail closed off main" and "a failure email arrives". The caveat: scheduled-run email goes to the last editor of the cron line, not the dispatcher. For a solo repo that is the same account. Suggest adding it as a step in ticket 04. The settings-only check is acceptable if the keeper declines. Not run here (read-only review).

## Checked, no finding

- **Triggers:** only `schedule` (`17 3 * * *`) and `workflow_dispatch`, with no `pull_request*`, `push` or `workflow_run`. Schedules run only on the default branch. A dispatch on any non-main ref or a tag gets a `sub` of `…:ref:refs/heads/<other>` or `…:ref:refs/tags/<x>`. The role's `StringEquals` rejects it, `configure-aws-credentials` fails, and the job stops before `scripts/backup.sh`, so it fails closed. Only accounts with write access can dispatch, and in this repo that is the keeper alone.
- **Permissions:** `id-token: write` and `contents: read` at workflow level, nothing else. There is no `environment:`, and a comment explains why. These match the spec and ADR-0013.
- **Role ARN and bucket:** `arn:aws:iam::107014414355:role/fishtank-backup` matches `aws_iam_role.backup` (name `fishtank-backup`, default path, account from the bucket name). `BACKUP_BUCKET=fishtank-backups-107014414355` matches `aws_s3_bucket.backups`. Region `eu-west-2` matches the provider and the script's SSM call. The trust `sub` uses the immutable form from spec → Discovered.
- **Env and secret flow:** the action exports the `AWS_*` session env, and the one following step runs the script with only `BACKUP_BUCKET` set. `SOURCE_URI`, `ARCHIVE` and `OUT` are unset, so the script reads SSM, masks the URI and password, and uploads with a single `s3api put-object --if-none-match '*'` (spec → Discovered). `MONGO_URL` never leaves the script's process, so it never crosses steps. The runner has docker and AWS CLI v2 preinstalled.
- **Runner pin:** `ubuntu-22.04` with CI's exact shortcut comment. The pin matters here too, because the `mongo:8` container shares the host kernel.
- **Checkout:** needed, since the script lives in the repo. Only the credential persistence is excess (finding 1).
- **Runbook restore:** uses the keeper's own credentials, says why (the role can't list or read), lists the newest key, `aws s3 cp`s it, then reuses Manual backup → Restore by reference and keeps the `--drop` warning. Keys of the form `YYYY-MM-DDTHH-MM-SSZ` sort lexically by time, so "last is newest" holds.
- **60-day trap wording:** matches the spec, including re-enabling within 30 days of the last good copy.
- **Notification check:** GitHub → Settings → Notifications → Actions, and who gets the email, match the spec.
- **hld.md:** the picture shows Atlas, so adding the backup flow is in scope. It links to `lld.md` → Nightly backup instead of restating the flow.
- **Commits:** the workflow (ec2ef2f, `ci:`) is separate from the docs (a5c962e).
- **actionlint:** not installed on this machine, so it was not run. I checked the YAML by reading it.

## Verdict

blockers=0 total=6
