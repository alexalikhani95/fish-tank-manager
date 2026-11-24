# Ponytail review: nightly backup

Scope: `git diff origin/main...HEAD -- scripts/ infra/ .github/ docs/design/`. Mask, YAML --config, restore checks are kept by design.

- scripts/backup.sh:L162: delete: `chmod 600 "$OUT"`. `rm -f` above plus `umask 077` on the cp already create a fresh 0600 file. Nothing replaces it.
- scripts/backup.sh:L111-116: shrink: the ping command is written twice (loop, then re-check). `ok=; for _ in $(seq 1 30); do docker exec ... && { ok=1; break; }; sleep 1; done; [ -n "$ok" ] || fail ...`, one copy.
- scripts/backup.sh:L102-104 and L121-124: shrink: the "exactly one database" check is written twice. Extract `one_db LIST WHAT` and call it from both paths.
- scripts/backup.sh:L133-139: shrink: two print branches for the counts table. Print the restored table once; the dumped column is already compared in the L148-152 loop.
- scripts/backup.sh:L107: delete: the "BACKUP_BUCKET is ignored" echo. L165 already skips the upload in ARCHIVE mode; lld.md documents it.
- infra/prod/main.tf:L338-340 (+ lld.md Outputs row): delete: `output "backup_role_arn"`. Nothing reads it; the workflow hardcodes the ARN.
- infra/prod/main.tf:abort_incomplete_multipart_upload (+ lld.md Backup bucket row): delete: the role is denied multipart, so no incomplete upload can exist. Nothing replaces it.
- docs/design/lld.md (Manual backup): delete: "`brew install mongodb-database-tools` is an optional alternative" and the Homebrew `mongorestore --uri` sentence in Restore. A second path to a worse command; Docker is the one way.
- docs/design/hld.md (Consumes bullet "Backup:"): delete: restates the diagram line and lld.md; keep the link in one place only.

net: -30 lines possible.
