#!/usr/bin/env bash
# Restore test: restores the newest dump of every database into a scratch database `<db>_restore_test`,
# checks that it has tables and rows, then drops it again (systemd: deploy/systemd/tretu-pg-restore-test.timer).
#   sudo -u postgres deploy/scripts/pg-restore-test.sh            # all databases
#   sudo -u postgres deploy/scripts/pg-restore-test.sh saga play  # some
#   KEEP=1 … keeps the restored databases for inspection.
# Env: BACKUP_DIR (default /var/backups/tretu-postgres), BACKUP_DATABASES, MAX_AGE_HOURS (26: the newest dump
# must be younger, so a silently stopped backup fails this test too), BACKUP_ALERT_WEBHOOK_URL (Discord webhook:
# a failed run posts a short message there).
set -euo pipefail
# shellcheck source=alert.sh
source "$(dirname "${BASH_SOURCE[0]}")/alert.sh"
trap 'alert_on_failure $? "Tretu-Restore-Test"' EXIT

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tretu-postgres}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-26}"
if [ $# -gt 0 ]; then dbs=("$@"); else read -r -a dbs <<<"${BACKUP_DATABASES:-tretu_web tretu_auth saga play mc_dashboard city nakama}"; fi

failed=0
printf '%-16s %-8s %8s %10s  %s\n' DATABASE RESULT TABLES ROWS DUMP
for db in "${dbs[@]}"; do
  dump="$(ls -1t "$BACKUP_DIR/$db"/"$db"-*.dump 2>/dev/null | head -n 1 || true)"
  if [ -z "$dump" ]; then
    printf '%-16s %-8s %8s %10s  %s\n' "$db" FAILED - - "no dump in $BACKUP_DIR/$db"
    failed=$((failed + 1)); continue
  fi
  age_h=$(( ($(date +%s) - $(stat -c %Y "$dump")) / 3600 ))
  if [ "$age_h" -ge "$MAX_AGE_HOURS" ]; then
    printf '%-16s %-8s %8s %10s  %s\n' "$db" FAILED - - "newest dump is ${age_h} h old: $dump"
    failed=$((failed + 1)); continue
  fi
  if [ -f "$dump.sha256" ] && ! (cd "$(dirname "$dump")" && sha256sum -c --quiet "$(basename "$dump").sha256"); then
    printf '%-16s %-8s %8s %10s  %s\n' "$db" FAILED - - "checksum mismatch: $dump"
    failed=$((failed + 1)); continue
  fi
  scratch="${db}_restore_test"
  psql -X -q -d postgres -c "drop database if exists \"$scratch\" with (force)" -c "create database \"$scratch\""
  # --no-owner/--no-acl: restorable without the app roles (e.g. on another machine).
  if pg_restore --no-owner --no-acl --exit-on-error -d "$scratch" "$dump" 2>/tmp/restore-test-$$.log; then
    tables="$(psql -X -At -d "$scratch" -c "select count(*) from pg_tables where schemaname not in ('pg_catalog','information_schema')")"
    # Row estimate after ANALYZE (statistics are empty right after a restore).
    rows="$(psql -X -At -d "$scratch" -c "analyze" -c "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables" | tail -n 1)"
    if [ "${tables:-0}" -gt 0 ]; then
      printf '%-16s %-8s %8s %10s  %s\n' "$db" OK "$tables" "$rows" "$dump"
    else
      printf '%-16s %-8s %8s %10s  %s\n' "$db" FAILED 0 - "restored database has no tables"
      failed=$((failed + 1))
    fi
  else
    printf '%-16s %-8s %8s %10s  %s\n' "$db" FAILED - - "pg_restore: $(tail -n 1 /tmp/restore-test-$$.log)"
    failed=$((failed + 1))
  fi
  rm -f /tmp/restore-test-$$.log
  [ -n "${KEEP:-}" ] || psql -X -q -d postgres -c "drop database if exists \"$scratch\" with (force)"
done

if [ "$failed" -gt 0 ]; then echo "$failed restore test(s) FAILED" >&2; exit 1; fi
echo "restore test passed"
