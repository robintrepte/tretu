#!/usr/bin/env bash
# Nightly logical backup of every Tretu Postgres database (systemd: deploy/systemd/tretu-pg-backup.timer).
#   sudo -u postgres deploy/scripts/pg-backup.sh
#
# One custom-format dump per database (`pg_dump -Fc`, restorable per table) plus the roles (globals), each
# verified with `pg_restore --list` and a SHA-256 file, written atomically (.partial → final) with mode 600.
# Old dumps are removed after RETENTION_DAYS. With BACKUP_REMOTE set, the directory is copied off the machine
# with rsync over SSH (e.g. a Hetzner Storage Box). With BACKUP_ALERT_WEBHOOK_URL set (a Discord webhook), a
# failed run posts a short message there; a backup that silently stops running is caught by the weekly restore
# test (pg-restore-test.sh, MAX_AGE_HOURS), which alerts the same way.
#
# Env (all optional):
#   BACKUP_DIR        /var/backups/tretu-postgres
#   BACKUP_DATABASES  "tretu_web tretu_auth saga play mc_dashboard city nakama"
#   RETENTION_DAYS    14
#   BACKUP_REMOTE     e.g. u123456@u123456.your-storagebox.de:tretu-postgres/  (rsync -e "ssh -p 23")
#   BACKUP_RSYNC_SSH  ssh -p 23 -i /var/lib/postgresql/.ssh/backup_ed25519
#   BACKUP_ALERT_WEBHOOK_URL  https://discord.com/api/webhooks/<id>/<token>
#   libpq: PGHOST, PGPORT, PGUSER (default: local socket as the calling user)
set -euo pipefail
umask 077
# shellcheck source=alert.sh
source "$(dirname "${BASH_SOURCE[0]}")/alert.sh"
trap 'alert_on_failure $? "Tretu-Backup"' EXIT

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tretu-postgres}"
BACKUP_DATABASES="${BACKUP_DATABASES:-tretu_web tretu_auth saga play mc_dashboard city nakama}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.lock"
flock -n 9 || { echo "another backup is running" >&2; exit 1; }

failed=0
printf '%-16s %-8s %10s  %s\n' DATABASE RESULT SIZE FILE
for db in $BACKUP_DATABASES; do
  if [ "$(psql -X -At -d postgres -c "select count(*) from pg_database where datname = '$db'")" != "1" ]; then
    printf '%-16s %-8s %10s  %s\n' "$db" MISSING - "(database does not exist)"
    failed=$((failed + 1))
    continue
  fi
  mkdir -p "$BACKUP_DIR/$db"
  file="$BACKUP_DIR/$db/$db-$stamp.dump"
  if pg_dump -Fc -Z 6 -d "$db" -f "$file.partial" 2>"$BACKUP_DIR/$db/last-error.log" \
    && pg_restore --list "$file.partial" >/dev/null 2>>"$BACKUP_DIR/$db/last-error.log"; then
    mv "$file.partial" "$file"
    (cd "$BACKUP_DIR/$db" && sha256sum "$(basename "$file")" >"$(basename "$file").sha256")
    rm -f "$BACKUP_DIR/$db/last-error.log"
    printf '%-16s %-8s %10s  %s\n' "$db" OK "$(du -h "$file" | cut -f1)" "$file"
  else
    rm -f "$file.partial"
    printf '%-16s %-8s %10s  %s\n' "$db" FAILED - "see $BACKUP_DIR/$db/last-error.log"
    failed=$((failed + 1))
  fi
done

# Roles and their (hashed) passwords, needed to restore onto a fresh server.
mkdir -p "$BACKUP_DIR/globals"
if pg_dumpall --globals-only -f "$BACKUP_DIR/globals/globals-$stamp.sql.partial"; then
  mv "$BACKUP_DIR/globals/globals-$stamp.sql.partial" "$BACKUP_DIR/globals/globals-$stamp.sql"
else
  failed=$((failed + 1))
fi

find "$BACKUP_DIR" -type f \( -name '*.dump' -o -name '*.dump.sha256' -o -name 'globals-*.sql' \) -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name '*.partial' -mmin +720 -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  if ! rsync -a --delete --exclude .lock -e "${BACKUP_RSYNC_SSH:-ssh}" "$BACKUP_DIR/" "$BACKUP_REMOTE"; then
    echo "rsync to the remote backup target failed" >&2
    failed=$((failed + 1))
  fi
fi

if [ "$failed" -gt 0 ]; then
  echo "$failed backup step(s) FAILED" >&2
  exit 1
fi
echo "backup finished ($stamp)"
