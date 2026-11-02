#!/usr/bin/env bash
# `npm run smoke [-- <smoke.sh options>]`: runs deploy/scripts/smoke.sh with this checkout's .env.local, so the
# signed platform ping uses TRETU_APP_ID / TRETU_APP_SECRET from there. Extra options are passed through,
# e.g. `npm run smoke -- --only web,auth` or `npm run smoke -- --webhook-test saga` (a signed test webhook with the
# app's secret from TRETU_APPS_JSON). Without .env.local the signed ping is skipped (smoke.sh says so).
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
env_file="${SMOKE_ENV_FILE:-$root/.env.local}"
if [[ -f "$env_file" ]]; then
  exec bash "$root/deploy/scripts/smoke.sh" --env-file "$env_file" "$@"
fi
echo "npm run smoke: $env_file not found, running without the signed platform ping" >&2
exec bash "$root/deploy/scripts/smoke.sh" "$@"
