#!/usr/bin/env bash
# Sourced by pg-backup.sh and pg-restore-test.sh: posts a short German message to the Discord webhook in
# BACKUP_ALERT_WEBHOOK_URL when the script exits with an error. Without the variable it does nothing.
# Never fails the calling script and never prints the webhook URL.

# alert_on_failure <exit code> <job name>
alert_on_failure() {
  local code="$1" job="$2"
  [ "$code" -ne 0 ] || return 0
  [ -n "${BACKUP_ALERT_WEBHOOK_URL:-}" ] || return 0
  local host text
  host="$(hostname 2>/dev/null || echo server)"
  text="${job} auf ${host} ist fehlgeschlagen (Exit-Code ${code}). Details: journalctl -u tretu-pg-*"
  # The message only contains the job name, host name and a number: escape quotes and backslashes for JSON.
  text="$(printf '%s' "$text" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')"
  curl -fsS --max-time 10 -o /dev/null -H 'content-type: application/json' \
    --data "{\"content\":\"${text}\",\"allowed_mentions\":{\"parse\":[]}}" \
    "$BACKUP_ALERT_WEBHOOK_URL" 2>/dev/null || echo "warning: could not post the failure alert" >&2
  return 0
}
