# Spec check: nightly-backup

Reviewer read `spec.md` and ADR-0013 as the builder. Each finding is marked **blocker** (must be fixed in the spec before building) or **minor**.

## 1. BLOCKER: the emptiness check is weaker than what the user decided

The user decided (Q3) that "an empty dump (no Users or Tanks) counts as failure", and (Q8) that the nightly check proves "Users, Tanks and WaterChanges are all there". The spec (Implementation Decisions step 4, User Story 5) only requires `users` >= 1, plus "restored count equals dumped count" for each collection _in the archive_. A dump where `tanks` or `waterchanges` is missing or empty (dropped collection, bad deploy wiping it) passes: an absent collection is not "in the archive", so nothing is compared, and 0 == 0 for an empty one. "Every collection count equal" proves the restore matches the dump. It does not prove the dump matches the data the keeper expects.
Fix: name the required collections by their real Mongo names (check `app/` models) and require each to be present with count >= 1 in both the dump and the restore. If WaterChanges is allowed to be legitimately 0 (a new Tank with no WaterChanges), say so explicitly and require presence only. Update User Story 5 to match.

## 2. BLOCKER: "runs on `ubuntu`" will break the service container

`.github/workflows/ci.yml` pins `runs-on: ubuntu-22.04` because "MongoDB rejects Linux >=6.19". The spec only says "runs on `ubuntu`". A builder who picks `ubuntu-latest` gets a `mongo:8` service (mongod) that may refuse to start on a newer kernel, and every nightly run fails. Fix: say `ubuntu-22.04`, with the same shortcut comment as CI.

## 3. BLOCKER: how the Terraform plan and apply are run is unclear and can break prod

`infra/prod/main.tf` says it is "Applied only by `npm run deploy`". `scripts/deploy.sh` needs a clean tree, uses HEAD as `image_tag`, pushes that image, rebuilds the PWA and then runs a full apply. The spec says "the keeper runs the apply" and asks for a "reviewed `plan`" before merge, but it does not say how. The root has a required `var.image_tag`. A bare `terraform plan/apply` on the feature branch with any tag other than the one live now repoints the Lambda, and a tag that is not in ECR breaks prod. Fix: say which path to use. Either (a) after merge, run `npm run deploy` on `main`, which redeploys the app as a side effect, or (b) run plan/apply with `-var image_tag=<the tag live now>` (and say how to read it: `aws lambda get-function`), and the plan must show no Lambda change. Also give the order: merge, then apply, then a `workflow_dispatch`, then the IAM checks, then a follow-up PR for the `docs/status.md` row and the ticket results. Without that order, the first 03:00 run after merge fails because the role does not exist yet, which is a false alarm. Update the `main.tf` header comment if (b) is chosen.

## 4. MINOR: OIDC `sub` is right, but "only the backup job" is not what it enforces

For `schedule` and for `workflow_dispatch` on `main`, the default `sub` is `repo:alexalikhani95/fish-tank-manager:ref:refs/heads/main`, so the trust works as written. Two caveats the spec should state:

> Later: wrong for this repo. It uses immutable subject claims, so the real `sub` includes owner and repo ids. See checks/review-02.md F2 and spec.md → Discovered.

- If the job ever sets `environment:`, the `sub` becomes `repo:…:environment:<name>` and the assume fails. Say "no `environment:`" (or trust that form instead).
- The condition admits **any** workflow on `main`, including CI's `workflow_dispatch` and any future workflow, not only the backup job. ADR-0013 says "one role per job", but `sub` cannot bind a role to a workflow file (that needs a custom `sub` template with `job_workflow_ref`). Either accept this and change the ADR wording to "one role per purpose, any workflow on main", or add a `job_workflow_ref` condition. Use `StringEquals`, not `StringLike`.

## 5. MINOR: the no-overwrite mechanism needs pinning down (the key exists)

`s3:if-none-match` is a real S3 condition key (from AWS's late-2024 "enforce conditional writes" feature). It is the value of the `If-None-Match` request header, so it works in identity and bucket policies. The spec's "with an `s3:if-none-match` condition so a write that could overwrite is denied" is loose. The working pattern is to Allow `s3:PutObject` only when `"Null": {"s3:if-none-match": "false"}`; S3 itself then returns 412 if the key exists. (Optionally add `StringEquals "*"`.) Also say which client sends the header: `aws s3api put-object --if-none-match '*'`. The high-level `aws s3 cp` may not send it on every CLI version. `s3:PutObject` also covers multipart, which is irrelevant at 1 KB. The fallback branch ("if IAM rejects the key") is moot and can be cut.

## 6. MINOR: the SSM KMS question has a known answer, still to check against the real parameter

`MONGO_URL` was created with `put-parameter --type SecureString` and no `--key-id` (`lld.md`), so it uses `alias/aws/ssm`. The AWS-managed key's policy grants decrypt via SSM to principals in the account (`kms:ViaService`/`kms:CallerAccount`). So the role needs **no** `kms:Decrypt`; only a customer-managed key would. Keep "verify": `aws ssm describe-parameters --parameter-filters Key=Name,Values=/fishtank/prod/MONGO_URL` shows `KeyId`. Expect no KMS statement.

## 7. MINOR: the "count `mongodump` reported" has no defined source or format

Step 4 compares restored counts with "the count `mongodump` reported", but it does not say how to get that count. The only source is mongodump's stderr log lines (`done dumping fishtank_prod.users (N documents)`), which also serve as the list of "every collection in the archive". The spec should say it parses those lines (and fails if none parse), or name another source: `mongorestore` prints `N document(s) restored successfully. M document(s) failed`, and `--dryRun` could list namespaces. Also state the database name: `fishtank_prod` comes from the URI, and the restore lands under the same name in the throwaway DB. The script should count there, by name, and not trust the URI's db implicitly. The real collection names are `users`, `tanks`, `waterchanges` (Mongoose models in `app/app/models/`). There is no WaterTests model or collection yet, though `hld.md` lists one.

## 8. MINOR: a `docker run` mongo tool cannot reach the service container at `localhost`

The service maps `27017:27017` on the runner host. `docker run mongo:8 mongorestore --uri mongodb://localhost:27017` targets the tool container's own localhost and fails. The spec should pick one approach: `docker run --network host` (Linux runner), `--network ${{ job.services.mongo.network }}` with host `mongo`, or `docker exec` into the service container (it already has the tools). The archive also needs a bind mount (`-v "$RUNNER_TEMP:/backup"`), and `MONGO_URL` should go in by `-e MONGO_URL`, not on the command line. On the laptop (Docker Desktop, macOS), `--network host` does not reach the dev Mongo the same way (use `host.docker.internal`), so the script must take the target URI as input. A simpler design that resolves both: the script starts its own throwaway `docker run -d mongo:8` instead of using a service container. CI and the laptop negative test would then run the exact same code. Recommend the spec allow or require this.

## 9. MINOR: the script's interface for the local negative test is not specified

Testing says the dump-verify-upload steps live in one script that must go red locally on an empty dump and on a count mismatch. But steps 2 and 5 read SSM and write S3 with the backup role, which the laptop cannot assume. The spec should define how the script is driven: for example a source URI (default: read from SSM), an upload switch, and the bucket. It should also say how a "count mismatch" is induced locally (for example a test hook that drops a document between restore and count, or comparing against a doctored expected count). Otherwise the negative case is untestable as written. Also: "never written to disk" conflicts with passing the secret between workflow steps (`$GITHUB_ENV` is a file). Say that the script itself fetches SSM, so steps 2 to 5 are a single workflow step.

## 10. MINOR: log hygiene in a public repo

Run logs of a public repo are public. Besides `::add-mask::` on the URL, mask the password substring too, because a tool may print a partial or re-encoded URI. The script must print only counts and never documents (no `mongosh` printing query results, no `set -x`). State this as a rule.

## 11. MINOR: the IAM "proven, not assumed" step is partly impossible as written

"An assumed-role check" from the laptop cannot happen: the role trusts only the GitHub OIDC provider, so the keeper cannot assume it, and widening the trust is a new standing permission. "A one-off `workflow_dispatch`" must run from `main` (the `sub` condition), so the probe code has to be merged. The spec should say which. Options: (a) `aws iam simulate-principal-policy` from the laptop for Get/List/Delete/other-SSM, with context entries for `s3:if-none-match`; it needs no new permissions but does not exercise S3's own 412. (b) A `workflow_dispatch` input (for example `selftest: true`) in the backup workflow that tries the forbidden calls and expects AccessDenied, plus a second put to the same key that expects 412 (or AccessDenied without the header). Note that (b) leaves probe code in the workflow.

## 12. MINOR: 30-day expiry with no versioning can empty the bucket

Lifecycle expiry deletes by age regardless of whether newer copies exist. If the job is failing (unnoticed email) or disabled (the 60-day trap) for more than 30 days, every copy expires and the keeper has zero backups. This is consistent with the user's "keep 30 days, auto-delete", but the spec should name the risk in Further Notes, or the runbook should say "re-enable within 30 days or you lose all copies". No change in scope is required, but it is a decision the user has not explicitly seen.

## 13. MINOR: cron timing and the failure email

- `0 3 * * *` UTC is 3am GMT and 4am BST, which the spec states (Story 7 says "about"), so it is fine. GitHub schedules are commonly delayed or dropped at the top of the hour. Use an off-minute (for example `17 3 * * *`).
- GitHub sends scheduled-run failure emails to the user who last modified the cron line, and only if that account's Actions notifications are on. Add a setup check: GitHub → Settings → Notifications → Actions, email on failed workflows. Acceptance only proves a pass. Nothing proves the failure email arrives, so consider one deliberate failing dispatch (for example the selftest input from finding 11) to check the email.
- The 60-day disable is accurate for public repos, and GitHub emails before disabling. Only commits or other repository activity reset it, not workflow runs.

## 14. MINOR: small gaps

- `hld.md` lists "water tests", but there is no WaterTest model, so the backup "covers everything" only for the three existing collections. If the check names collections explicitly (finding 1), adding WaterTests later must update the script. Say so in lld.
- Bucket name and role ARN are hard-coded in the workflow and also defined in Terraform (two homes). That is acceptable, but say the workflow values must match the Terraform outputs.
- The ADR's "Status: Proposed" should become Accepted when the PR merges, and the spec does not say who flips it.
- Atlas M0: `mongodump` cannot use `--oplog` (no access to `local`), so a dump is not point-in-time. That is harmless at 03:00 for a single user, but it explains a rare count mismatch if a write lands mid-dump. Restore and compare against the dump's own counts (not live prod), and that cannot happen.
