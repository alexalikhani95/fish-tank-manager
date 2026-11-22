# Ticket check: nightly-backup

## 1. blocker, ticket 01: `ARCHIVE` mode has no dumped counts to compare against

**Problem:** the count check compares restored counts to the counts parsed from `mongodump`'s `done dumping` lines, and the database name also comes from those lines. With `ARCHIVE` set the dump is skipped, so neither exists. The builder must invent where the expected counts and db name come from (e.g. `mongorestore --dryRun`, or the restore's own `N document(s) restored` lines), and the truncated-archive negative check depends on that choice.
**Fix:** say in the ticket (and spec) what `ARCHIVE` mode checks: e.g. db name and expected counts from `mongorestore`'s output lines for the archive; required collections ≥1 and `0 document(s) failed` still apply; a truncated archive must fail on a non-zero exit or a parse/count mismatch.

## 2. blocker, ticket 01: laptop mode keeps no copy, so it cannot be "the manual dump"

**Problem:** the archive is written to a temp dir that the `trap` deletes on exit, and with `BACKUP_BUCKET` unset nothing is uploaded. So laptop mode dumps, checks and throws the copy away. Yet ticket 01 (and the spec's Runbook) says the manual dump before a risky change "is this script with `BACKUP_BUCKET` unset". As written, the runbook would tell the keeper to take a backup that leaves no file behind. User story 8/16 fallback breaks.
**Fix:** add an output for laptop mode, e.g. an `OUT` env var (or a default `./fishtank_prod-<timestamp>.gz` outside the repo) that the checked archive is copied to before the trap runs. Add it to the spec's env interface, then point the lld.md wording at it. Or drop the "manual dump = the script" line and keep a plain `docker run mongo:8 mongodump` command in the runbook.

## 3. minor, ticket 01: `::add-mask::` prints the URI on the laptop

**Problem:** `::add-mask::<value>` only means something inside Actions. On the laptop (`SOURCE_URI` unset, reading from SSM) it writes the full prod URI and password to the terminal, against "never echoes a URI". Nothing says to guard it.
**Fix:** emit the mask lines only when `GITHUB_ACTIONS=true`. Say how to split out the password part (from `mongodb+srv://user:pass@host`) so the builder doesn't guess.

## 4. minor, ticket 01: "≥1 document in both the dump and the restore" got shortened

**Problem:** the spec requires the three collections present with ≥1 document **in both** the dump counts and the restored counts. The ticket just says "each have ≥1 document", which a builder could check on one side only.
**Fix:** copy the spec wording: "present with ≥1 document in both the dump and the restore".

## 5. minor, ticket 01: `ARCHIVE` plus `BACKUP_BUCKET` together is undefined

**Problem:** nothing says whether a verified `ARCHIVE` may then be uploaded. If yes, a laptop with keeper credentials could upload any file; if no, the script should refuse.
**Fix:** state one rule, e.g. "`ARCHIVE` set means no upload, even if `BACKUP_BUCKET` is set" (simplest, matches "only verifies").

## 6. minor, ticket 01: how the restore gets "the same database name" is left open

**Problem:** the spec says restore under the db name taken from the dump lines. With `mongorestore --archive` that happens by default, but a builder may add `--nsFrom/--nsTo` or `--db` and the check then counts the wrong database. Also the throwaway container must be started and ready (`mongosh` ping loop) before `mongorestore`; neither ticket nor spec says so, and a race here gives flaky red runs.
**Fix:** one line: "restore with `mongorestore --archive --gzip` (no renaming), after waiting for the throwaway `mongod` to answer a ping; count with `mongosh` `countDocuments()` per dumped collection in that db".

## 7. minor, ticket 01: the negative-check fixtures aren't described

**Problem:** the builder must create an empty database and a `users`+`tanks`-only database on the dev MongoDB but isn't told to use separate throwaway database names (not the dev `fishtank` data) or to drop them afterwards.
**Fix:** say "use scratch databases (e.g. `backup_check_empty`, `backup_check_nowc`) on the dev MongoDB, seeded with `mongosh`, dropped after; the good run uses the normal dev database".

## 8. minor, ticket 02: role name and bucket name not fixed, but ticket 03 hard-codes both

**Problem:** ticket 03 writes the role ARN and bucket name into the workflow as plain values, "matching the Terraform outputs". Ticket 02 names the bucket pattern but not the role name or the output names. The 03 builder has to read 02's code to find them, which is OK as 03 is blocked by 02, but the ticket should pin them.
**Fix:** in 02, name the role (e.g. `fishtank-backup`) and the outputs (e.g. `backup_bucket`, `backup_role_arn`), and note the bucket is `fishtank-backups-107014414355` (account id is already in `main.tf`). Also say to reuse `data.aws_ssm_parameter.secret["MONGO_URL"].arn` for the policy resource, and to add the new outputs to the lld.md Outputs row.

## 9. minor, ticket 02: the main.tf header-comment requirement is dropped

**Problem:** the spec says the `main.tf` header ("Applied only by `npm run deploy`") must stay true. No ticket mentions it, so a builder might edit it to mention GitHub.
**Fix:** add a line to 02: "leave the `main.tf` header as is; the role does not apply Terraform".

## 10. minor, ticket 03: PLAN.md tick lands before the job has ever run

**Problem:** ticket 03 ticks the nightly-backup item in `PLAN.md` Phase 2 in the merge PR, but the job first runs in ticket 04 after merge. If the first run fails, PLAN says done while status.md says "manual only". Spec puts the PLAN tick under Docs without saying which PR.
**Fix:** move the PLAN.md tick to ticket 04's follow-up PR, beside the status.md row and the ADR flip. (Or keep it in 03 and say why.)

## 11. minor, ticket 03: new runbook prose risks the status-claims gate

**Problem:** `scripts/check-status-claims.sh` fails on phrases like "last verified", "currently running", "is live" in `docs/design/` and `PLAN.md`. The runbook text about the nightly job is easy to phrase that way. Ticket 03 doesn't list the gate in its checks.
**Fix:** add "`bash scripts/check-status-claims.sh` passes" to 03 (and 01, which also edits lld.md); live state goes only in status.md (ticket 04).

## 12. minor, ticket 03: overlap with ticket 01 on the same lld.md section

**Problem:** both 01 and 03 rewrite the lld.md Manual backup section (01: manual dump/restore with `mongo:8`; 03: nightly job, restore from newest copy with `mongorestore`). Ticket 03 doesn't say the restore step must use 01's `mongo:8` form, so the two halves may disagree (Homebrew `mongorestore` vs Docker).
**Fix:** in 03 say "the restore step reuses the `mongo:8` restore command 01 wrote"; 03 is already blocked by 01, so no ordering change needed.

## 13. minor, ticket 04: IAM simulation commands need context keys spelled out

**Problem:** `simulate-principal-policy` only tests the `Null` condition if `--context-entries` passes `s3:if-none-match` (and omits it for the deny case), with `--resource-arns` set to an object ARN in the bucket and the SSM ARNs. A human following 04 won't know this, and without it the PutObject checks give a misleading result.
**Fix:** paste the two exact commands into 04 (object ARN `arn:aws:s3:::fishtank-backups-107014414355/fishtank_prod/x.gz`, `--context-entries ContextKeyName=s3:if-none-match,ContextKeyValues=*,ContextKeyType=string`), and note the keeper's own credentials need `iam:SimulatePrincipalPolicy`.

## Checked and fine

- Blocked-by lines: 01 and 02 independent; 03 needs 01 (script path) and 02 (ARN, bucket); 04 needs 03 and the merge. Correct.
- Test seams match the spec: one seam (restore-and-check) in 01; 02/03/04 have none and say how they're proved.
- Every user story lands in a ticket: 1–8, 17 → 03; 4–5, 9–10, 16 → 01; 11–14, 19 → 02; 15 → 03; 18 → 04; 20 → ADR-0013 already on the branch; 21 → 04. Rollout steps 1→02, 3–6→04. Status lines follow `docs/agents/issue-tracker.md`.
