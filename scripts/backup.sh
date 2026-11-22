#!/usr/bin/env bash
# Backup: dump a MongoDB database, restore the copy into a throwaway mongo:8 container, check
# every collection came back whole, and only then upload it. Spec: tickets/nightly-backup/spec.md;
# runbook in docs/design/lld.md → Manual backup. Runs on the laptop and in the nightly workflow.
#
# Env:
#   SOURCE_URI     database to dump; unset reads /fishtank/prod/MONGO_URL from SSM
#   BACKUP_BUCKET  bucket to upload to; unset uploads nothing (laptop mode)
#   ARCHIVE        an existing archive: skip the dump, only verify, never upload
#   OUT            copy the checked archive here before cleanup
#
# Public repo, public logs: print only collection names and counts. No documents, no URI, no set -x.
# Works on macOS's bash 3.2: no associative arrays.
set -euo pipefail

# A new collection must be added here (lld.md → Manual backup).
REQUIRED="users tanks waterchanges"

fail() {
  echo "✗ backup: $*" >&2
  exit 1
}
# The reason a Mongo tool failed, for a failure message: its "Failed:" line, else its last line,
# without the timestamp and with the URI and password blanked (connect errors echo the URI).
reason() {
  local s
  s=$(printf '%s\n' "$1" | grep 'Failed:' | tail -n 1 || true)
  if [ -z "$s" ]; then s=$(printf '%s\n' "$1" | grep -v '^[[:space:]]*$' | tail -n 1 || true); fi
  s=${s#*$'\t'}
  if [ -n "${SOURCE_URI:-}" ]; then s=${s//"$SOURCE_URI"/***}; fi
  if [ -n "${PASSWORD:-}" ]; then s=${s//"$PASSWORD"/***}; fi
  if [ -n "${PASSWORD_DEC:-}" ]; then s=${s//"$PASSWORD_DEC"/***}; fi
  printf '%s' "$s"
}
# mask VALUE: register VALUE as a GitHub log mask. The runner un-escapes the data, so escape it first.
mask() {
  local m=$1
  m=${m//"%"/%25}
  m=${m//$'\r'/%0D}
  m=${m//$'\n'/%0A}
  echo "::add-mask::$m"
}
# count NAME LIST: the count for NAME in a "name count" per line LIST, or nothing.
count() { printf '%s\n' "$2" | awk -v n="$1" '$1 == n { print $2 }'; }

command -v docker >/dev/null || fail "docker is not installed"
if [ -n "${OUT:-}" ] && [ -d "$OUT" ]; then fail "OUT is a directory: $OUT"; fi

# 1. The source URI (not needed to verify an existing ARCHIVE).
PASSWORD=
PASSWORD_DEC=
if [ -z "${ARCHIVE:-}" ]; then
  if [ -z "${SOURCE_URI:-}" ]; then
    SOURCE_URI=$(aws ssm get-parameter --region eu-west-2 --name /fishtank/prod/MONGO_URL \
      --with-decryption --query Parameter.Value --output text) ||
      fail "could not read /fishtank/prod/MONGO_URL from SSM"
  fi
  # The password: the text between "user:" and "@" (URL-encoded, so it holds no raw @), and its
  # percent-decoded form, which a tool may print instead.
  userinfo=${SOURCE_URI#*://}
  userinfo=${userinfo%%@*}
  if [ "$userinfo" != "${SOURCE_URI#*://}" ] && [[ $userinfo == *:* ]]; then PASSWORD=${userinfo#*:}; fi
  if [ -n "$PASSWORD" ]; then
    PASSWORD_DEC=${PASSWORD//\\/\\\\}
    PASSWORD_DEC=$(printf '%b' "${PASSWORD_DEC//"%"/\\x}")
  fi
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    mask "$SOURCE_URI"
    if [ -n "$PASSWORD" ]; then mask "$PASSWORD"; fi
    if [ -n "$PASSWORD_DEC" ]; then mask "$PASSWORD_DEC"; fi
  fi
  # The URI reaches mongodump through a YAML config file inside the container, never argv.
  [[ $SOURCE_URI != *"'"* ]] || fail "SOURCE_URI contains a single quote"
  export SOURCE_URI
elif [ ! -f "$ARCHIVE" ]; then
  fail "ARCHIVE is not a file: $ARCHIVE"
fi

# 2. One throwaway mongo:8 container runs mongod and all the tools; the archive goes through a
#    bind-mounted temp dir. On Linux the container's root owns the archive: it stays world-readable
#    inside this 0700 dir so the host can copy and upload it, and delete it. The trap removes both.
TMP=$(mktemp -d)
C=
cleanup() {
  if [ -n "$C" ]; then docker rm -f "$C" >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
}
trap cleanup EXIT
C=$(docker run -d --rm --add-host=host.docker.internal:host-gateway -v "$TMP:/backup" mongo:8) ||
  fail "could not start the mongo:8 container"

# 3. Dump, parsing the dumped counts and the database name from mongodump's log.
DUMPED=
if [ -z "${ARCHIVE:-}" ]; then
  out=$(docker exec -e SOURCE_URI "$C" sh -c '
    (umask 077 && printf "uri: '\''%s'\''\n" "$SOURCE_URI" > /tmp/uri.yaml)
    mongodump --config=/tmp/uri.yaml --archive=/backup/archive.gz --gzip' 2>&1) ||
    fail "mongodump failed: $(reason "$out")"
  DUMPED=$(printf '%s\n' "$out" |
    sed -nE 's/.*done dumping `?([^.`[:space:]]+)\.([^`[:space:]]+)`? \(([0-9]+) documents?\).*/\1 \2 \3/p')
  [ -n "$DUMPED" ] || fail "mongodump reported no collections (is the database empty or the name wrong?)"
  DB=$(printf '%s\n' "$DUMPED" | awk '{ print $1 }' | sort -u)
  [ "$(printf '%s\n' "$DB" | wc -l)" -eq 1 ] || fail "the dump holds more than one database: $(echo $DB)"
  DUMPED=$(printf '%s\n' "$DUMPED" | awk '{ print $2, $3 }')
else
  cp "$ARCHIVE" "$TMP/archive.gz"
  if [ -n "${BACKUP_BUCKET:-}" ]; then echo "ARCHIVE mode verifies only; BACKUP_BUCKET is ignored"; fi
fi

# 4. Restore into the throwaway mongod, under the same database name, once it answers a ping.
for _ in $(seq 1 30); do
  if docker exec "$C" mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$C" mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1 ||
  fail "the throwaway mongod did not start"
out=$(docker exec "$C" mongorestore --archive=/backup/archive.gz --gzip 2>&1) ||
  fail "mongorestore failed: $(reason "$out")"
[[ $out == *" 0 document(s) failed"* ]] || fail "mongorestore: $(reason "$out")"
if [ -n "${ARCHIVE:-}" ]; then
  DB=$(printf '%s\n' "$out" |
    sed -nE 's/.*finished restoring `?([^.`[:space:]]+)\.[^`[:space:]]+`? \(.*/\1/p' | sort -u)
  [ -n "$DB" ] || fail "mongorestore restored no collections"
  [ "$(printf '%s\n' "$DB" | wc -l)" -eq 1 ] || fail "the archive holds more than one database: $(echo $DB)"
fi
RESTORED=$(docker exec -e DB="$DB" "$C" mongosh --quiet --eval '
  const d = db.getSiblingDB(process.env.DB)
  d.getCollectionNames().forEach((c) => print(c + " " + d.getCollection(c).countDocuments()))') ||
  fail "could not count the restored collections"

# 5. Check, printing names and counts only.
echo "database $DB"
if [ -n "$DUMPED" ]; then
  printf '  %-16s %8s %8s\n' collection dumped restored
  while read -r name n; do printf '  %-16s %8s %8s\n' "$name" "$n" "$(count "$name" "$RESTORED")"; done <<<"$DUMPED"
else
  printf '  %-16s %8s\n' collection restored
  while read -r name n; do printf '  %-16s %8s\n' "$name" "$n"; done <<<"$RESTORED"
fi
for name in $REQUIRED; do
  if [ -n "$DUMPED" ]; then
    n=$(count "$name" "$DUMPED")
    [ "${n:-0}" -ge 1 ] || fail "required collection $name is missing or empty in the dump"
  fi
  n=$(count "$name" "$RESTORED")
  [ "${n:-0}" -ge 1 ] || fail "required collection $name is missing or empty in the restore"
done
if [ -n "$DUMPED" ]; then
  while read -r name n; do
    r=$(count "$name" "$RESTORED")
    [ "$r" = "$n" ] || fail "$name: dumped $n, restored ${r:-none}"
  done <<<"$DUMPED"
  [ "$(printf '%s\n' "$DUMPED" | awk '{ print $1 }' | sort)" = "$(printf '%s\n' "$RESTORED" | awk '{ print $1 }' | sort)" ] ||
    fail "the restored collections differ from the dumped ones"
fi
echo "✓ backup: the copy restores whole"

# 6. Keep and upload, only after the check passed.
if [ -n "${OUT:-}" ]; then
  (umask 077 && cp "$TMP/archive.gz" "$OUT")
  chmod 600 "$OUT"
  echo "saved to $OUT"
fi
if [ -n "${BACKUP_BUCKET:-}" ] && [ -z "${ARCHIVE:-}" ]; then
  KEY="fishtank_prod/$(date -u +%Y-%m-%dT%H-%M-%SZ).gz"
  aws s3api put-object --bucket "$BACKUP_BUCKET" --key "$KEY" --body "$TMP/archive.gz" \
    --if-none-match '*' >/dev/null || fail "upload to s3://$BACKUP_BUCKET/$KEY failed"
  echo "✓ uploaded s3://$BACKUP_BUCKET/$KEY"
fi
