# Review 01 — commit e35356f (scripts/backup.sh)

Ticket: tickets/nightly-backup/issues/01-backup-script.md. Spec: tickets/nightly-backup/spec.md.
Severity: blocker / important / minor.

## Findings

### 1. important — only the URL-encoded password is masked/redacted

`scripts/backup.sh:47-53, 25-33`. `PASSWORD` is the raw userinfo text, so it is still
percent-encoded. `::add-mask::` and `reason()` blank that form only. If the password holds a
reserved character (`@ : / ? # %` etc.), any tool output showing the _decoded_ password (driver
auth / URI-parse errors, a future `echo`) is neither masked by GitHub nor blanked by `reason()`.
Fix: also mask and redact the percent-decoded password (and the username is harmless). Today's
mongodump connect errors don't usually print the password, so this is defence in depth, not a
known leak.

Addendum to 1 (same finding). The ticket's own run shows mongodump's connect error _does_
echo the full URI (`failed to connect to ***`), so `reason()` doing an exact-string replace is
the only thing between the password and the log. Any normalisation by the tool (decoded
userinfo, reordered options) gets past it. Also, the GitHub runner un-escapes workflow-command
data (`%25` -> `%`, `%0A`, `%0D`). A URL-encoded password that contains `%25` (a literal `%` in
the real password) is therefore registered as a mask in its un-escaped form and does not match
what appears in the log. Fix: escape `%` -> `%25`, CR -> `%0D` and LF -> `%0A` before
`::add-mask::`, and mask/redact both the encoded and decoded password.

### 2. minor — dump-mode check doesn't compare collection sets

`scripts/backup.sh:82-87, 131-136`. Only collections whose `done dumping` line matches the sed
regex are compared. A line that doesn't parse (an odd collection name, or a future change to
mongodump's log format for one line) is dropped silently, and extra collections in the restore
are never noticed. The three required collections still guard against an empty or broken copy,
so this can't pass a copy that's missing users, tanks or waterchanges. Suggest also failing when
the set of restored collection names differs from the dumped set.

### 3. minor — `OUT` is world-readable for a moment, and breaks if it's a directory

`scripts/backup.sh:140-143`. `cp` creates `OUT` with the umask (usually 0644), then `chmod 600`.
For that moment, an archive holding the password hashes is readable by other local users. If
`OUT` is an existing directory, `cp` writes `archive.gz` inside it, and then `chmod 600` locks
the directory itself. Fix: `(umask 077 && cp "$TMP/archive.gz" "$OUT")` and refuse a directory.

### 4. minor — the lld.md restore runbook puts the URI in argv after all

`docs/design/lld.md` → Manual backup → Restore. `docker run -e MONGO_URL ... sh -c 'mongorestore
--uri "$MONGO_URL" ...'` keeps the URI off the host docker command line. But `mongorestore`'s own
argv inside the container holds the full URI, and on a Linux host `ps` shows container
processes. The text says "so it stays off the command line", which is only half true. The
laptop is macOS, where the processes sit inside the Docker Desktop VM, so the risk is low. Fix:
reuse the script's YAML `--config` trick, or reword the text.

### 5. minor — `mongo:8` is a floating tag and it receives the prod URI

`scripts/backup.sh:72`. Whatever image `mongo:8` resolves to on the night gets the prod
credentials through `-e`. CI uses the same tag, so this matches the spec ("the same image CI
uses"). Pinning by digest (`mongo:8@sha256:...`) would close the supply-chain gap. Your call.

### 6. minor — the upload key is always `fishtank_prod/` whatever `SOURCE_URI` is

`scripts/backup.sh:146`. With `BACKUP_BUCKET` set and `SOURCE_URI` pointing at another database,
that copy is filed as a prod backup. The spec fixes the key, so this isn't a spec break. Consider
using `$DB` in the key, or refusing to upload when `DB` isn't the prod name.

## Checked, no finding

- URI never in argv: it reaches `docker exec` by name (`-e SOURCE_URI`). Inside the container,
  `printf` is a dash builtin, so it's not a process. mongodump reads it from `--config`, and
  `/tmp/uri.yaml` is 0600 inside a container that is then deleted. Quote injection into the
  YAML is refused.
- Success-path output is never printed raw. Only parsed names and counts reach stdout.
  `aws ssm` stderr carries no value. On upload failure only bucket and key are printed.
- `set -euo pipefail`: every `$(...)` whose result matters is checked with `||` or by an
  explicit emptiness test. `grep` inside `reason()` is guarded with `|| true`. `fail` is never
  called from a subshell (the `while ... <<<` loops run in the main shell), so it really exits.
- A broken or empty copy can't pass. An empty DB, a missing required collection, a count
  mismatch, any non-zero exit and anything other than ` 0 document(s) failed` all fail. A
  truncated gzip always fails the CRC/EOF read in mongorestore.
- Trap: it's set before the container starts. `C` is empty until `docker run` returns, and
  `docker rm -f` plus `--rm` remove the container. `rm -rf` works on Linux even though root
  owns `archive.gz`, because the runner user owns the 0700 directory.
- Linux ownership: `docker exec` runs as root, so root can write into the 0700 bind mount
  (CAP_DAC_OVERRIDE). The `umask 077` is limited to the subshell, so mongodump creates the
  archive 0644, which the runner user can read for `put-object`.
- Upload: `s3api put-object --if-none-match '*'` sends `If-None-Match`, which satisfies the
  role's `Null` condition. A too-old CLI errors out, which fails safely. stdout is discarded.
- ARCHIVE mode never uploads (`line 145`) and says so when `BACKUP_BUCKET` is set.
- bash 3.2: no associative arrays, `mapfile` or `${x,,}`. Here-strings, `[[ ]]` and `$'\t'` all
  work. The ticket's laptop runs exercised macOS.

## Verdict

0 blockers, 1 important, 5 minor.

## Re-review (148243c)

### R1. minor — finding 4: runbook config file is written without `umask 077` and without the quote check

`docs/design/lld.md` → Manual backup → Restore. The fix does take the URI off `mongorestore`'s
argv (`printf` is a dash builtin, so it is never a process), so the "never in any process's
arguments" wording is now true. But unlike the script, the runbook writes `/tmp/uri.yaml` with
the default umask (0644) and does not refuse a URI holding `'`. A password with a single quote
breaks the YAML, and mongorestore's parse error may then echo the line, URI included, to the
operator's terminal. Inside a throwaway container the 0644 is low risk. Fix: `umask 077;` before
the `printf`, and note that a URI with `'` must be handled by hand (or copy the script's check).
(Confirmed: the snippet runs as written and leaves `/tmp/uri.yaml` at `-rw-r--r--` in the container.)

### R2. minor — finding 4: the Homebrew line right below still puts the URI in argv

`docs/design/lld.md` → Restore, last paragraph: "With Homebrew's tools instead: `mongorestore
--uri "$MONGO_URL" ...`". That runs on the macOS host itself, where `ps` can see it with no VM in
between. It contradicts the paragraph above ("never in any process's arguments"). Fix: give the
Homebrew form the same `--config` file (`umask 077`, a temp file, `rm` afterwards), or say plainly
that this form exposes the URI to local `ps`.

### R3. minor — finding 3: an existing `OUT` file keeps its old mode while it is written

`scripts/backup.sh:160-161`. `umask` applies only when `cp` creates the file. If `OUT` already
exists (a re-run with the same date-stamped name, as in the lld example), `cp` truncates it and
writes it with its existing mode (for example 0644). The `chmod 600` comes afterwards, so the old
window is still there in that case. The directory refusal works (`[ -d ]` follows symlinks, so a
symlink to a directory is refused too) and comes before the dump, so nothing slow is wasted. Fix:
`rm -f "$OUT"` before the `cp`, or `chmod 600` an existing `OUT` first.

### R4. minor — finding 1: decoding drops a trailing `%0A` and any `%00`

`scripts/backup.sh:63-66`. Tested on bash 3.2.57 (macOS) and 5.2.21 (`mongo:8`, the same
userland as ubuntu-24.04): `p%40ss%25w` -> `p@ss%w`, `%2541` -> `%41`, `%5C` -> `\`, `%C3%A9` ->
`é`, `&` stays literal. Same results on both, and the mask lines escape correctly. But `$(...)`
strips a trailing decoded newline, and bash drops NUL bytes (5.2 also prints "ignored null byte"
to stderr). A bad escape (`%zz`) prints "printf: missing hex digit" to stderr. None of these print
the value, and status is 0 so `set -e` does not fire. A shortened decoded mask still covers the
start of the password. These are not realistic Atlas passwords. No leak, noting it for
completeness only.

### R5. minor — finding 2: lld.md doesn't describe the new collection-set check

`docs/design/lld.md` → Manual backup → Dump still says the script fails only on a missing or empty
required collection or a count mismatch. It now also fails when the restored collection set
differs from the dumped one. Add it per "design docs are living".

### Checked, no finding (148243c)

- Finding 1 is fixed. `mask()` escapes `%` first, then CR and LF, which matches the runner's
  un-escape (`%25`, `%0D`, `%0A`). The encoded and decoded password are both masked and both
  blanked in `reason()`. Nothing new is printed: the decode runs in a `$(...)` builtin `printf`,
  and `mask()` writes only `::add-mask::` lines, under `GITHUB_ACTIONS=true` only. `***` in the
  `${s//…/***}` replacement is not special under 5.2's `patsub_replacement`.
- Finding 2 is fixed. `RESTORED` comes from `getCollectionNames()`, not from the log regex. So a
  dumped collection whose `done dumping` line fails to parse now shows up as an extra restored
  name and fails the run. Extra restored collections fail too. Both sides go through the same
  `awk | sort`, so the locale can't tell them apart. The check runs only after every count has
  matched, and before the copy or upload, so a broken copy still can't pass.
- `fail "OUT is a directory: $OUT"` prints only a local path. The OUT check runs before the URI
  is read.
- The `(umask 077 && cp ...)` subshell still fails the script under `set -e` (for example when
  the parent directory is missing), and it comes before the upload. A new file gets
  0644 & ~077 = 0600 on Linux (the root-owned 0644 source) and on macOS.
- bash 3.2 and Linux: no new constructs beyond `local`, `${//}`, `$'\r'` and `printf %b \xHH`,
  all tested on 3.2.57 and 5.2.21 above.

### Verdict (re-review)

Findings 1-4 are fixed in the script, with no new leak, no way for a broken copy to pass, and no
bash 3.2 or Linux breakage. 0 blockers, 0 important, 5 minor (R1-R5). R1 and R2 are leftover
gaps in finding 4's runbook fix. R3 is a leftover edge of finding 3.
