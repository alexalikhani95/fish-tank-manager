# 03: The nightly GitHub job

**What to build:** a GitHub Actions workflow runs ticket 01's script every night at 03:17 UTC, and by hand, logging in to AWS through the role from ticket 02 and uploading the checked copy. A failed run makes GitHub email the keeper. The runbook covers the nightly job, restoring from the newest copy, the 60-day trap and the one-time email setting. Spec → Implementation Decisions → Where it runs, Steps 1, Failure email; Runbook; Docs (the PLAN.md tick waits for 04).

**Blocked by:** 01, 02

**Status:** ready-for-agent

**Label:** pattern (the workflow copies the CI workflow's runner pin and comment) · **Test seams:** none (`actionlint` here; the real run in 04) · **Risky:** yes, CI that gets AWS credentials

- [x] Its own workflow file, separate from CI: `schedule` cron `17 3 * * *` plus `workflow_dispatch`; `runs-on: ubuntu-22.04` with CI's shortcut comment; `permissions: id-token: write, contents: read`; no `environment:`
- [x] `aws-actions/configure-aws-credentials` pinned to a major version, region `eu-west-2`, with the role ARN from 02's output. Then a single step runs the script with `BACKUP_BUCKET` set to 02's bucket output. Both values are written in as plain values and match the Terraform outputs
- [x] `actionlint` passes if available (say so if it isn't)
- [x] `lld.md` runbook: the nightly job (what it does, where copies live, `gh workflow run`); restore from the newest copy with the keeper's own credentials (list the bucket, `aws s3 cp` the newest key, then the `mongo:8` restore command ticket 01 wrote, with the `--drop` warning kept); the 60-day trap (re-enable within 30 days of the last good copy); the one-time GitHub → Settings → Notifications → Actions check
- [x] `hld.md` gets the backup flow if its deploy picture shows data stores
- [x] The workflow in its own commit, separate from docs; typecheck, lint, tests and `bash scripts/check-status-claims.sh` green

## Comments

Built `ec2ef2f` (workflow) and `a5c962e` (docs); review-03 fixes `ccf04c4`, `7e48442`. `actionlint` is not installed; the `rhysd/actionlint` Docker image ran clean, both at build and after the review-03 fixes. Typecheck, lint, `npm test` (76/76) and `check-status-claims.sh` green. Not run against AWS until ticket 04.
