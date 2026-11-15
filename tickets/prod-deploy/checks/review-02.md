# Review 02 — prod setup runbook (commit a955b99, docs/design/lld.md "Prod runbook")

## Findings

### 1. [minor] Step 1: only `create-bucket` carries `--region`

`put-bucket-versioning`, `put-bucket-encryption`, `put-public-access-block` and the three Check commands have no `--region $R`, so they use whatever the keeper's default region is. The S3 CLI usually follows the region redirect, so they will most likely still work, but the ticket asks for region on every command. Fix: add `--region $R` to each, or move the `aws() { command aws --region eu-west-2 "$@"; }` wrapper to the top of the runbook so it covers step 1 too.

Checked: the keeper's default region is `us-east-1` (`aws configure get region`). `aws s3api get-bucket-versioning --bucket fishtank-tfstate-107014414355` without `--region` still returned `Enabled`, so the step-1 commands work in practice. This stays minor.

### 2. [minor] `APP_KEY` starts with `-` about 1 time in 64, and then `put-parameter` refuses it

`generate:key` uses `string.random(32)` (base64url, which includes `-` and `_`). In 64,000 draws, 1,010 keys started with `-`. The AWS CLI then reads `--value -abc…` as a new flag. I tested this with a read-only call: `aws ssm get-parameter --name "-abcDEF_123"` gives `argument --name: expected one argument`, while `--name="-abcDEF_123"` parses fine. Nothing is created and the key is not printed, so the keeper only has to rerun it. Fix: write `--value="$(…)"` (with `=`) on all three `put-parameter` commands.

### 3. [minor] Step 1 "Check" line is not copy-pasteable

`get-public-access-block` and `get-bucket-encryption` are written as bare subcommand names, with no `aws s3api … --bucket $B`. Also, `$B` only exists if the keeper is still in the same shell. Fix: write out three full commands, each with `--bucket fishtank-tfstate-107014414355 --region eu-west-2`.

### 4. [minor] The SSM "Check" only works in the shell that defined `aws()`

`aws ssm get-parameters-by-path --path /fishtank/prod …` has no `--region`. It relies on the wrapper function from step 3, which lasts only for that shell. If the keeper checks from a new terminal, the default region is `us-east-1` and the command returns `[]`. That looks like "the secrets are missing", and the keeper might create them again in the wrong place. I confirmed it: right now it returns `[]` with `--region eu-west-2` as well, since nothing has been created yet. Fix: add `--region eu-west-2` to the check command explicitly.

### 5. [minor] Atlas connection string: the copied string has a `<db_password>` placeholder and `/?`

The Atlas Drivers dialog gives `mongodb+srv://<user>:<db_password>@<cluster>.<id>.mongodb.net/?retryWrites=true&w=majority&appName=<Cluster>`. The runbook should say (a) replace `<db_password>` with the generated password, angle brackets included, and (b) the result must read `.mongodb.net/fishtank_prod?…`, so the name goes between the existing `/` and `?`, with no extra `/`. The trailing `appName=` is harmless. Format and encoding otherwise check out: `openssl rand -hex 24` is `[0-9a-f]` only, so no URL-encoding is needed. Scoping the user to `readWrite@fishtank_prod` (Atlas "Specific Privileges") is correct, and it includes createIndex.

### 6. [minor] "Rerun its command with `--overwrite`" does not work for `MONGO_URL` on its own

The `MONGO_URL` command reads `$MONGO_URL`, which was `unset` right after use. Rerunning only the `put-parameter` line sends `--value ""`. SSM rejects that (min length 1), so it fails safely but confusingly. Fix: say to rerun the `read -rs` line plus `put-parameter … --overwrite` plus `unset`. Without `--overwrite`, a rerun fails with `ParameterAlreadyExists` and changes nothing. That is the right default. A rerun of step 1's `create-bucket` fails with `BucketAlreadyOwnedByYou`, and the next lines still run and are idempotent.

### 7. [minor] Paste step 3 carefully: run the `read` line alone, and the comments rely on `interactivecomments`

- With bracketed paste (the default in macOS Terminal/iTerm2 with zsh), pasting the whole block works: zsh runs it as one buffer, and `read` waits on the tty. Without bracketed paste (some tmux/ssh setups), `read -rs` takes the _next pasted line_ (`aws ssm put-parameter …`) as the connection string, and the real put never runs. Safer: tell the keeper to run the `read` line on its own first.
- The trailing `# …` comments on the `aws()` and `read` lines only parse as comments when `setopt interactivecomments` is on. It is on in the keeper's zsh (checked with `zsh -i -c setopt`), but it is off in stock zsh. There, the `read` line would split at `;` and run `in bash: read …` as a command. Moving the comments to their own line or into prose removes the dependency.

## Verified as working

- `read -rs "MONGO_URL?Atlas connection string: "` in zsh reads the full string (with `?`, `&` and `+`) without echoing it. Tested with `zsh -f`. In bash the same line fails with `not a valid identifier`, and the bash alternative in the comment is correct.
- `node ace generate:key --show` (in `app/node_modules/@adonisjs/core/build/commands/generate_key.js`) prints `APP_KEY = <32 chars>` via `logger.log`. When stdout is not a TTY there are no ANSI codes. The `DEP0205` deprecation warning goes to stderr, which `2>/dev/null` discards. `sed -n 's/^APP_KEY = //p'` yields exactly 32 chars. Env validation does not break it: `JWT_SECRET=short` still printed a key. If node or sed fails, `--value ""` is rejected by the CLI, so the failure is safe and no empty secret is stored.
- `openssl rand -base64 48` gives one 64-char line, with no `-` in the base64 alphabet, which is at least 32 as `start/env.ts` requires.
- No secret lands in shell history: the history only stores `$MONGO_URL` and `$(…)` unexpanded, and `read` input is not recorded. No secret is printed: `put-parameter` returns only `Version`/`Tier`, and the check uses `--query 'Parameters[].Name'` with no `--with-decryption`.
- The `aws()` wrapper puts `--region eu-west-2` on every SSM command in step 3.
- Bucket state matches the runbook (read-only checks, account `107014414355`). Location `eu-west-2`, versioning `Enabled`, all four public-access-block flags `true`, SSE `AES256`, ownership `BucketOwnerEnforced`, no bucket policy. No `/fishtank/prod` parameters exist yet, as expected.

## Verdict

0 blockers, 7 minor. The runbook is safe to follow as written. Every failure mode found fails loudly and leaks nothing. Findings 2, 4 and 6 are worth fixing before the keeper runs step 3.
