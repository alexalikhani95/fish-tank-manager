# 01: Backup script that checks its own copy

**What to build:** one command, run on the laptop, dumps a MongoDB database, restores the copy into a throwaway `mongo:8` container and checks that every collection came back whole, going red with a clear message when it didn't. With `BACKUP_BUCKET` unset it uploads nothing. This is the laptop mode, and also the core that ticket 03's nightly job calls. Spec → Implementation Decisions → One script does the work, Tools, Steps 2–6, Log hygiene; Runbook → Manual dump and restore.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Label:** new design · **Test seams:** the script's restore-and-check step (exercised by the four laptop runs below) · **Risky:** yes, it handles the prod database URI and password

- [x] Bash script in `scripts/` in the style of `scripts/deploy.sh` (`set -euo pipefail`, `fail()`), with the env interface from the spec: `SOURCE_URI` (else read `/fishtank/prod/MONGO_URL` from SSM in `eu-west-2` with decryption, then, only when `GITHUB_ACTIONS=true`, `::add-mask::` the full URI and its password part, the text between `user:` and `@`), `BACKUP_BUCKET` (unset means no upload), `ARCHIVE` (verify an existing file, skip the dump, never upload), `OUT` (copy the checked archive here before cleanup)
- [x] All Mongo tools run with `docker exec` inside one throwaway `mongo:8` container. The archive goes through a bind-mounted temp dir and the URI through `-e`, never argv. A `trap` removes the container and the temp dir
- [x] Dump with `--archive --gzip`. Dumped counts come from the `done dumping <db>.<coll> (N documents)` lines, and the script fails if none parse. The database name comes from those lines
- [x] Restore with `mongorestore --archive --gzip` and no renaming, after the throwaway `mongod` answers a `mongosh` ping. Count with `countDocuments()` per collection in that database
- [x] The check fails unless `users`, `tanks` and `waterchanges` are each present with ≥1 document in both the dump and the restore, every dumped collection restores exactly its dumped count, `mongorestore` reports `0 document(s) failed`, and every command exits 0
- [x] Upload, when `BACKUP_BUCKET` is set: `aws s3api put-object --if-none-match '*'` to `fishtank_prod/<UTC timestamp to the second>.gz`
- [x] `ARCHIVE` mode (no dumped counts): the database name comes from `mongorestore`'s output, and the check is the required-collections rule on the restore, `0 document(s) failed` and zero exits
- [x] Prints only collection names and counts: no documents, no URI, no `set -x`
- [x] Laptop runs against the dev MongoDB through `host.docker.internal`, with output pasted in `## Comments`: a good database goes green; an empty database, a database with no `waterchanges`, and a truncated `ARCHIVE` each go red with a clear message. Use scratch databases (for example `backup_check_empty`, `backup_check_nowc`) seeded with `mongosh` and dropped afterwards. The good run uses the normal dev database with `OUT` set, and the file it leaves must pass again as `ARCHIVE`
- [x] `lld.md` → the Manual backup section: manual dump and restore use the `mongo:8` image (the `brew install` line stays as an optional alternative), the manual dump is this script with `BACKUP_BUCKET` unset and `OUT` set, and a note says that adding a collection means adding it to the required list
- [x] Typecheck, lint, tests and `bash scripts/check-status-claims.sh` green

## Comments

**2026-11-22, implementer.** `scripts/backup.sh` built; `lld.md` → Manual backup reworked. Laptop runs below, against the dev MongoDB (Docker Desktop, `host.docker.internal`), `BACKUP_BUCKET` unset. The dev database `fishtank_dev` did not exist on this machine, so the agent seeded it with 1 user, 2 tanks and 3 waterchanges for the good run, and dropped it afterwards along with the scratch databases `backup_check_empty` (one empty `users` collection) and `backup_check_nowc` (1 user, 1 tank). The truncated archive is the first half (341 of 683 bytes) of the good run's `OUT` file. Scratch paths shown as `/tmp`.

```text
$ SOURCE_URI=mongodb://host.docker.internal:27017/fishtank_dev OUT=/tmp/fishtank_dev.gz bash scripts/backup.sh
database fishtank_dev
  collection         dumped restored
  waterchanges            3        3
  tanks                   2        2
  users                   1        1
✓ backup: the copy restores whole
saved to /tmp/fishtank_dev.gz
exit 0

$ ARCHIVE=/tmp/fishtank_dev.gz bash scripts/backup.sh
database fishtank_dev
  collection       restored
  waterchanges            3
  users                   1
  tanks                   2
✓ backup: the copy restores whole
exit 0

$ SOURCE_URI=mongodb://host.docker.internal:27017/backup_check_empty bash scripts/backup.sh
database backup_check_empty
  collection         dumped restored
  users                   0        0
✗ backup: required collection users is missing or empty in the dump
exit 1

$ SOURCE_URI=mongodb://host.docker.internal:27017/backup_check_nowc bash scripts/backup.sh
database backup_check_nowc
  collection         dumped restored
  users                   1        1
  tanks                   1        1
✗ backup: required collection waterchanges is missing or empty in the dump
exit 1

$ ARCHIVE=/tmp/truncated.gz bash scripts/backup.sh
✗ backup: mongorestore failed: Failed: corruption found in archive; ParserConsumer.BodyBSON() ( corruption found in archive; read bson ( unexpected EOF ) )
exit 1

```

Also checked: a database with no collections at all goes red with `✗ backup: mongodump reported no collections (is the database empty or the name wrong?)`; a URI with a password that cannot connect prints the mongodump error with the URI blanked (`failed to connect to ***`), and with `GITHUB_ACTIONS=true` emits `::add-mask::` for the URI and the password first. Not exercised: the SSM read and the S3 upload (no prod access in this ticket; the real run in ticket 04 proves both). Typecheck, lint, `npm test` (76 passed), `node --test 'scripts/**/*.test.mjs'` (15 passed) and `bash scripts/check-status-claims.sh` green.

After these runs, two small edits for Linux runners (where the container's root owns files in the bind mount): the `umask 077` now covers only the in-container URI file, so the archive stays readable by the host for the upload, and the `OUT` copy is `chmod 600`. The good run and its `ARCHIVE` re-check were repeated after the edits against a scratch `backup_check_good` (1 user, 1 tank, 1 waterchange, dropped afterwards): both green.

### Review-01 fixes

Findings 1-4 of `checks/review-01.md` fixed (5 and 6 left: the spec settles them). `mask()` now escapes `%`, CR and LF before `::add-mask::`, and the encoded and percent-decoded password are both masked and blanked by `reason()`. Dump mode fails when the restored collection set differs from the dumped one. `OUT` is written under `umask 077` and refused when it is a directory. The lld.md restore runbook now reads the URI from a YAML `--config` file, as the script does.

Masking check: fake URI `mongodb://bob:p%40ss%25w@unreachable.invalid:27017/x`, `GITHUB_ACTIONS=true`. The `::add-mask::` lines carry the escaped forms (`p%2540ss%2525w` and `p@ss%25w`), which the runner un-escapes to the encoded and decoded password. With those lines removed, the output has neither `p%40ss%25w` nor `p@ss%w` (0 matches each):

```
✗ backup: mongodump failed: Failed: can't create session: failed to connect to ***: server selection error: ...
```

Runs through host.docker.internal against the dev MongoDB (scratch databases dropped afterwards; 1 user, 2 tanks, 3 waterchanges):

```
$ SOURCE_URI=mongodb://host.docker.internal:27017/backup_check_good OUT=<scratch>/good.gz bash scripts/backup.sh
database backup_check_good
  collection         dumped restored
  tanks                   2        2
  waterchanges            3        3
  users                   1        1
✓ backup: the copy restores whole
saved to <scratch>/good.gz
exit 0
-rw-------@ 536

$ ARCHIVE=<scratch>/good.gz bash scripts/backup.sh
database backup_check_good
  collection       restored
  waterchanges            3
  tanks                   2
  users                   1
✓ backup: the copy restores whole
exit 0

$ OUT=<a directory> ... (refused)
✗ backup: OUT is a directory: <scratch>
exit 1

$ SOURCE_URI=.../backup_check_red bash scripts/backup.sh   (no waterchanges)
database backup_check_red
  collection         dumped restored
  tanks                   2        2
  users                   1        1
✗ backup: required collection waterchanges is missing or empty in the dump
exit 1
```

Typecheck, lint, `npm test` (76 passed) and `bash scripts/check-status-claims.sh` green.

### Ponytail pass

Applied from `checks/ponytail.md`: removed `chmod 600 "$OUT"`, the "BACKUP_BUCKET is ignored" echo; one ping loop; `one_db` helper for the one-database check; the counts table prints once (restored only; the dumped-vs-restored comparison stays in the check loop, so `lld.md` now says "restored counts"). Removed the hld.md "Backup:" bullet. Not applied (spec requires): `backup_role_arn` output, `abort_incomplete_multipart_upload`, Homebrew alternatives.

Runs against the dev MongoDB via host.docker.internal (scratch dbs dropped after):

```
$ bash -n scripts/backup.sh          -> ok
$ SOURCE_URI=.../backup_check_good OUT=<scratch>/good.gz bash scripts/backup.sh
database backup_check_good
  users 1, waterchanges 3, tanks 2
✓ backup: the copy restores whole
saved to <scratch>/good.gz           exit 0, OUT mode 600

$ ARCHIVE=<scratch>/good.gz bash scripts/backup.sh
✓ backup: the copy restores whole    exit 0

$ SOURCE_URI=.../backup_check_nowc bash scripts/backup.sh
✗ backup: required collection waterchanges is missing or empty in the dump    exit 1

$ ARCHIVE=<truncated 100 bytes> bash scripts/backup.sh
✗ backup: mongorestore failed: Failed: I/O failure reading beginning of archive: unexpected EOF    exit 1
```
