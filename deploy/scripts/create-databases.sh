#!/usr/bin/env bash
# Creates one Postgres role + database per Tretu app with least privileges (contract §0), idempotently:
#   sudo -u postgres deploy/scripts/create-databases.sh --passwords /root/tretu-secrets/postgres/roles.env
#
# - Roles: LOGIN only (no superuser, createdb, createrole, replication, bypassrls); passwords from roles.env
#   (written by generate-secrets.mjs), set again on every run (scram-sha-256 hashing by the server).
# - Databases: owned by their role, UTF8, CONNECT revoked from PUBLIC; the public schema belongs to the app
#   role and nobody else may create objects in it.
# - tretu_legacy_reader (optional, when its password is in roles.env): read-only role for auth's legacy import
#   (CONNECT + SELECT on saga, play, tretu_web, nakama; default_transaction_read_only).
# - An existing database owned by ANOTHER role is left alone (warning): change its owner deliberately
#   (deploy/GO-LIVE.md, step "Databases").
#
# Options:
#   --passwords <file>  roles.env (required unless --drop)
#   --prefix <p>        prefix every role and database name (tests, staging), e.g. --prefix stg_
#   --only a,b          only these apps (role names), e.g. --only saga,play
#   --dry-run           print the SQL with passwords masked, change nothing
#   --drop              drop the prefixed roles and databases (requires --prefix; for tests)
# Connection: the usual libpq variables (PGHOST, PGPORT, PGUSER, PGDATABASE=postgres); default local socket.
set -euo pipefail

APPS=(tretu_web tretu_auth saga play mc_dashboard nakama)
LEGACY_DBS=(saga play tretu_web nakama)
LEGACY_ROLE=tretu_legacy_reader

passwords=""
prefix=""
only=""
dry_run=false
drop=false

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --passwords) passwords="${2:?--passwords needs a file}"; shift 2 ;;
    --prefix) prefix="${2:?--prefix needs a value}"; shift 2 ;;
    --only) only="${2:?--only needs a list}"; shift 2 ;;
    --dry-run) dry_run=true; shift ;;
    --drop) drop=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -n "$prefix" ] && ! [[ "$prefix" =~ ^[a-z][a-z0-9_]{0,30}$ ]]; then
  echo "--prefix must be lowercase letters, digits and _ (starting with a letter)" >&2; exit 2
fi
if [ -n "$only" ]; then
  IFS=, read -r -a wanted <<<"$only"
  for w in "${wanted[@]}"; do
    [[ " ${APPS[*]} " == *" $w "* ]] || { echo "--only: unknown app $w (one of ${APPS[*]})" >&2; exit 2; }
  done
  APPS=("${wanted[@]}")
fi

export PGDATABASE="${PGDATABASE:-postgres}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 --no-psqlrc)

# Feeds SQL on stdin (never as an argument, so passwords do not show up in `ps`).
run_sql() {
  local db="$1"
  if $dry_run; then
    echo "-- on database $db"
    sed -E "s/PASSWORD '[^']*'/PASSWORD '***'/g"
    return
  fi
  "${PSQL[@]}" -d "$db"
}

query() { "${PSQL[@]}" -At -d "${2:-postgres}" -c "$1"; }

sql_literal() { printf "'%s'" "${1//\'/\'\'}"; }

if $drop; then
  [ -n "$prefix" ] || { echo "--drop only works together with --prefix (it never drops production names)" >&2; exit 2; }
  for app in "${APPS[@]}"; do
    run_sql postgres <<SQL
DROP DATABASE IF EXISTS "${prefix}${app}" WITH (FORCE);
SQL
  done
  for role in "${APPS[@]}" "$LEGACY_ROLE"; do
    run_sql postgres <<SQL
DROP ROLE IF EXISTS "${prefix}${role}";
SQL
  done
  echo "dropped roles and databases with prefix ${prefix}"
  exit 0
fi

[ -n "$passwords" ] || { echo "--passwords <roles.env> is required" >&2; exit 2; }
[ -r "$passwords" ] || { echo "cannot read $passwords" >&2; exit 2; }
if [ "$(stat -c %a "$passwords")" != "600" ] && [ "$(stat -c %a "$passwords")" != "400" ]; then
  echo "warning: $passwords should be mode 600" >&2
fi

password_for() {
  local key
  key="$(echo "$1" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
  # Plain KEY=value lines (generate-secrets.mjs writes hex values, no quotes needed); quotes are stripped.
  sed -n -E "s/^${key}=['\"]?([^'\"]*)['\"]?\$/\\1/p" "$passwords" | tail -n 1
}

server_version="$(query "show server_version_num")"
results=()

ensure_role() {
  local role="$1" password="$2"
  run_sql postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $(sql_literal "$role")) THEN
    CREATE ROLE "$role" LOGIN;
  END IF;
END
\$\$;
ALTER ROLE "$role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT CONNECTION LIMIT 50 PASSWORD $(sql_literal "$password");
SQL
}

for app in "${APPS[@]}"; do
  role="${prefix}${app}"
  db="${prefix}${app}"
  password="$(password_for "$app")"
  if [ -z "$password" ] || [ ${#password} -lt 16 ]; then
    echo "missing or short ${app^^}_DB_PASSWORD in $passwords" >&2; exit 1
  fi
  role_existed="$(query "select count(*) from pg_roles where rolname = $(sql_literal "$role")")"
  ensure_role "$role" "$password"

  owner="$(query "select pg_get_userbyid(datdba) from pg_database where datname = $(sql_literal "$db")")"
  if [ -n "$owner" ] && [ "$owner" != "$role" ]; then
    echo "warning: database $db exists and belongs to $owner, not $role: left unchanged" >&2
    results+=("$db|$role|SKIPPED (owner $owner)")
    continue
  fi
  if [ -z "$owner" ]; then
    run_sql postgres <<SQL
CREATE DATABASE "$db" OWNER "$role" ENCODING 'UTF8' TEMPLATE template0;
SQL
    state="created"
  else
    state="exists"
  fi
  [ "$role_existed" = "1" ] || state="$state, role created"

  run_sql postgres <<SQL
REVOKE ALL ON DATABASE "$db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE "$db" TO "$role";
SQL
  run_sql "$db" <<SQL
ALTER SCHEMA public OWNER TO "$role";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO "$role";
SQL
  results+=("$db|$role|$state")
done

legacy_password="$(password_for "$LEGACY_ROLE")"
if [ -n "$legacy_password" ] && [ -z "$only" ]; then
  reader="${prefix}${LEGACY_ROLE}"
  ensure_role "$reader" "$legacy_password"
  run_sql postgres <<SQL
ALTER ROLE "$reader" SET default_transaction_read_only = on;
SQL
  for name in "${LEGACY_DBS[@]}"; do
    db="${prefix}${name}"
    owner="$(query "select pg_get_userbyid(datdba) from pg_database where datname = $(sql_literal "$db")")"
    [ -n "$owner" ] || continue
    run_sql postgres <<SQL
GRANT CONNECT ON DATABASE "$db" TO "$reader";
SQL
    run_sql "$db" <<SQL
GRANT USAGE ON SCHEMA public TO "$reader";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "$reader";
ALTER DEFAULT PRIVILEGES FOR ROLE "$owner" IN SCHEMA public GRANT SELECT ON TABLES TO "$reader";
SQL
  done
  results+=("$(printf "${prefix}%s " "${LEGACY_DBS[@]}")|$reader|read-only (legacy import)")
fi

$dry_run && { echo "-- dry run: nothing changed"; exit 0; }
printf '%-28s %-28s %s\n' DATABASE ROLE STATE
for r in "${results[@]}"; do
  IFS='|' read -r d ro st <<<"$r"
  printf '%-28s %-28s %s\n' "$d" "$ro" "$st"
done
echo "Postgres $server_version: done. Keep listen_addresses = 'localhost' and scram-sha-256 in pg_hba.conf."
