# 01: Backup script that checks its own copy

**What to build:** one command, run on the laptop, dumps a MongoDB database, restores the copy into a throwaway `mongo:8` container and checks that every collection came back whole, going red with a clear message when it didn't. With `BACKUP_BUCKET` unset it uploads nothing. This is the laptop mode, and also the core that ticket 03's nightly job calls. Spec → Implementation Decisions → One script does the work, Tools, Steps 2–6, Log hygiene; Runbook → Manual dump and restore.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Label:** new design · **Test seams:** the script's restore-and-check step (exercised by the four laptop runs below) · **Risky:** yes, it handles the prod database URI and password

- [ ] Bash script in `scripts/` in the style of `scripts/deploy.sh` (`set -euo pipefail`, `fail()`), with the env interface from the spec: `SOURCE_URI` (else read `/fishtank/prod/MONGO_URL` from SSM in `eu-west-2` with decryption, then, only when `GITHUB_ACTIONS=true`, `::add-mask::` the full URI and its password part, the text between `user:` and `@`), `BACKUP_BUCKET` (unset means no upload), `ARCHIVE` (verify an existing file, skip the dump, never upload), `OUT` (copy the checked archive here before cleanup)
- [ ] All Mongo tools run with `docker exec` inside one throwaway `mongo:8` container. The archive goes through a bind-mounted temp dir and the URI through `-e`, never argv. A `trap` removes the container and the temp dir
- [ ] Dump with `--archive --gzip`. Dumped counts come from the `done dumping <db>.<coll> (N documents)` lines, and the script fails if none parse. The database name comes from those lines
- [ ] Restore with `mongorestore --archive --gzip` and no renaming, after the throwaway `mongod` answers a `mongosh` ping. Count with `countDocuments()` per collection in that database
- [ ] The check fails unless `users`, `tanks` and `waterchanges` are each present with ≥1 document in both the dump and the restore, every dumped collection restores exactly its dumped count, `mongorestore` reports `0 document(s) failed`, and every command exits 0
- [ ] Upload, when `BACKUP_BUCKET` is set: `aws s3api put-object --if-none-match '*'` to `fishtank_prod/<UTC timestamp to the second>.gz`
- [ ] `ARCHIVE` mode (no dumped counts): the database name comes from `mongorestore`'s output, and the check is the required-collections rule on the restore, `0 document(s) failed` and zero exits
- [ ] Prints only collection names and counts: no documents, no URI, no `set -x`
- [ ] Laptop runs against the dev MongoDB through `host.docker.internal`, with output pasted in `## Comments`: a good database goes green; an empty database, a database with no `waterchanges`, and a truncated `ARCHIVE` each go red with a clear message. Use scratch databases (for example `backup_check_empty`, `backup_check_nowc`) seeded with `mongosh` and dropped afterwards. The good run uses the normal dev database with `OUT` set, and the file it leaves must pass again as `ARCHIVE`
- [ ] `lld.md` → the Manual backup section: manual dump and restore use the `mongo:8` image (the `brew install` line stays as an optional alternative), the manual dump is this script with `BACKUP_BUCKET` unset and `OUT` set, and a note says that adding a collection means adding it to the required list
- [ ] Typecheck, lint, tests and `bash scripts/check-status-claims.sh` green

## Comments
