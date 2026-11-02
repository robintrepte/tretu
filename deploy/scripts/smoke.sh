#!/usr/bin/env bash
# Smoke test of the whole ecosystem: every /api/health, auth's OIDC discovery + JWKS, the status data behind
# tretu.de/status and a signed platform ping (contract §3). Optionally a signed test webhook to apps.
# Prints a pass/fail table; exit code 1 if anything failed.
#
#   deploy/scripts/smoke.sh                                    # production hosts, ping skipped without a secret
#   deploy/scripts/smoke.sh --env-file /srv/tretu/.env.local   # signs the ping with TRETU_APP_SECRET from there
#   deploy/scripts/smoke.sh --only web,auth                    # while the other apps are not live yet
#   deploy/scripts/smoke.sh --map web=http://127.0.0.1:3020 --map auth=http://127.0.0.1:3021
#   deploy/scripts/smoke.sh --env-file /srv/tretu/.env.local --webhook-test saga --only webhook
#
# Options:
#   --domain <d>       base domain (default tretu.de): web=https://d, auth=https://auth.d, saga, play, hollowmere,
#                      mc=https://mc.d
#   --map name=url     override one base URL (names above)
#   --only a,b         run only these targets;  --skip a,b  leave these out
#   --env-file <file>  read TRETU_APP_ID / TRETU_APP_SECRET for the signed ping (default app tretu-web)
#   --timeout <s>      per request (default 10)
#   --webhook-test <a> POST a signed `platform.ping` event (contract §3/§4, x-tretu-app: platform, signed with the
#                      app's secret from TRETU_APPS_JSON in --env-file) to that app's configured webhook URL; PASS on
#                      2xx (apps answer unknown types with 204). Comma list or `all` (every app with a webhook).
#                      Runs in addition to the other checks; `--only webhook` leaves those out.
# Env: SMOKE_APP_ID, SMOKE_APP_SECRET override the env file (SMOKE_APPS_JSON overrides its TRETU_APPS_JSON). Secrets
# are passed to node via the environment or read from the file by node, never on a command line, never printed.
# Needs curl and node.
set -uo pipefail

domain="tretu.de"
timeout=10
env_file=""
declare -A base=()
only=""
skip=""
webhook_test=""

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) domain="${2:?}"; shift 2 ;;
    --map) base["${2%%=*}"]="${2#*=}"; shift 2 ;;
    --only) only="${2:?}"; shift 2 ;;
    --skip) skip="${2:?}"; shift 2 ;;
    --env-file) env_file="${2:?}"; shift 2 ;;
    --timeout) timeout="${2:?}"; shift 2 ;;
    --webhook-test) webhook_test="${webhook_test:+$webhook_test,}${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
command -v curl >/dev/null || { echo "curl is required" >&2; exit 2; }
command -v node >/dev/null || { echo "node is required" >&2; exit 2; }

: "${base[web]:=https://${domain}}"
: "${base[auth]:=https://auth.${domain}}"
: "${base[saga]:=https://saga.${domain}}"
: "${base[play]:=https://play.${domain}}"
: "${base[hollowmere]:=https://hollowmere.${domain}}"
: "${base[mc]:=https://mc.${domain}}"
for k in "${!base[@]}"; do base[$k]="${base[$k]%/}"; done

app_id="${SMOKE_APP_ID:-}"
app_secret="${SMOKE_APP_SECRET:-}"
if [ -n "$env_file" ]; then
  [ -r "$env_file" ] || { echo "cannot read $env_file" >&2; exit 2; }
  read_env() { sed -n -E "s/^(export[[:space:]]+)?$1=['\"]?([^'\"]*)['\"]?[[:space:]]*\$/\\2/p" "$env_file" | tail -n 1; }
  [ -n "$app_id" ] || app_id="$(read_env TRETU_APP_ID)"
  [ -n "$app_secret" ] || app_secret="$(read_env TRETU_APP_SECRET)"
fi
app_id="${app_id:-tretu-web}"

selected() {
  local target="$1"
  if [ -n "$only" ] && [[ ",$only," != *",$target,"* ]]; then return 1; fi
  if [ -n "$skip" ] && [[ ",$skip," == *",$target,"* ]]; then return 1; fi
  return 0
}

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
rows=()
failures=0

record() { # check url result detail
  rows+=("$1|$2|$3|$4")
  [ "$3" = "PASS" ] || [ "$3" = "SKIP" ] || failures=$((failures + 1))
}

# fetch <url> [curl args…] → sets $code and writes the body to $tmp/body
fetch() {
  local url="$1"; shift
  : >"$tmp/body"   # an empty body when curl can't connect, so json() never reads a missing file
  code="$(curl -sS -o "$tmp/body" -w '%{http_code}' --max-time "$timeout" -H 'accept: application/json' "$@" "$url" 2>"$tmp/err")" || code="000"
}

# json <node expression over `j`> → prints the result (empty on parse errors)
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const r=('"$1"');process.stdout.write(String(r??""))}catch{process.stdout.write("")}})' <"$tmp/body"; }

check_health() {
  local name="$1" url="${base[$1]}/api/health"
  selected "$name" || return 0
  fetch "$url"
  if [ "$code" = "000" ]; then record "health $name" "$url" FAIL "no connection: $(head -c 120 "$tmp/err")"; return; fi
  local status checks
  status="$(json 'j.status')"
  checks="$(json 'Object.entries(j.checks||{}).map(([k,v])=>k+"="+v).join(" ")')"
  if [ "$code" = "200" ] && [ "$status" = "ok" ]; then
    record "health $name" "$url" PASS "$(json 'j.app+" "+j.version') ${checks}"
  else
    record "health $name" "$url" FAIL "HTTP $code status=${status:-?} ${checks}"
  fi
}

for name in web auth saga play hollowmere mc; do check_health "$name"; done

# tretu.de/status: the platform worker's checks must be recent (a stopped worker shows up as stale).
if selected web; then
  url="${base[web]}/api/status"
  fetch "$url"
  services="$(json '(j.services||[]).length')"
  stale="$(json 'j.stale')"
  updated="$(json 'j.updatedAt')"
  if [ "$code" != "200" ]; then
    record "status page" "$url" FAIL "HTTP $code"
  elif [ "${services:-0}" -lt 1 ] 2>/dev/null; then
    record "status page" "$url" FAIL "no services (TRETU_STATUS_TARGETS_JSON empty?)"
  elif [ "$stale" != "false" ]; then
    record "status page" "$url" FAIL "no recent checks (updated ${updated:-never}): is tretu-platform-worker running?"
  else
    record "status page" "$url" PASS "${services} services, updated ${updated}"
  fi
fi

if selected auth; then
  url="${base[auth]}/.well-known/openid-configuration"
  fetch "$url"
  issuer="$(json 'j.issuer')"
  missing="$(json '["authorization_endpoint","token_endpoint","userinfo_endpoint","jwks_uri","end_session_endpoint"].filter(k=>!j[k]).join(",")')"
  pkce="$(json '(j.code_challenge_methods_supported||[]).includes("S256")')"
  jwks="$(json 'j.jwks_uri')"
  if [ "$code" != "200" ]; then
    record "oidc discovery" "$url" FAIL "HTTP $code"
  elif [ "$issuer" != "${base[auth]}" ]; then
    record "oidc discovery" "$url" FAIL "issuer is '${issuer}', expected ${base[auth]}"
  elif [ -n "$missing" ] || [ "$pkce" != "true" ]; then
    record "oidc discovery" "$url" FAIL "missing: ${missing:-} S256=${pkce}"
  else
    record "oidc discovery" "$url" PASS "issuer ok, PKCE S256"
    fetch "$jwks"
    keys="$(json '(j.keys||[]).filter(k=>k.kid&&k.kty&&!k.d).length')"
    if [ "$code" = "200" ] && [ "${keys:-0}" -ge 1 ] 2>/dev/null; then
      record "oidc jwks" "$jwks" PASS "${keys} public key(s)"
    else
      record "oidc jwks" "$jwks" FAIL "HTTP $code keys=${keys:-0}"
    fi
  fi
fi

if selected web; then
  path="/api/v1/badges"
  url="${base[web]}${path}"
  fetch "$url"
  if [ "$code" = "401" ]; then record "platform unsigned" "$url" PASS "401 as expected"; else record "platform unsigned" "$url" FAIL "HTTP $code (expected 401)"; fi
  if [ -z "$app_secret" ]; then
    record "platform signed ping" "$url" SKIP "no secret (--env-file or SMOKE_APP_SECRET)"
  else
    headers="$(SMOKE_SECRET="$app_secret" SMOKE_APP="$app_id" SMOKE_PATH="$path" node -e '
      const { createHash, createHmac } = require("node:crypto");
      const ts = String(Math.floor(Date.now() / 1000));
      const base = [ts, "GET", process.env.SMOKE_PATH, createHash("sha256").update("").digest("hex")].join("\n");
      const sig = "v1=" + createHmac("sha256", process.env.SMOKE_SECRET).update(base).digest("hex");
      process.stdout.write(`x-tretu-app: ${process.env.SMOKE_APP}\nx-tretu-timestamp: ${ts}\nx-tretu-signature: ${sig}\n`);')"
    printf '%s' "$headers" >"$tmp/headers"
    fetch "$url" -H @"$tmp/headers"
    count="$(json '(j.badges||[]).length')"
    if [ "$code" = "200" ] && [ "${count:-0}" -ge 1 ] 2>/dev/null; then
      record "platform signed ping" "$url" PASS "as ${app_id}: ${count} badges"
    elif [ "$code" = "401" ]; then
      record "platform signed ping" "$url" FAIL "401: ${app_id} secret differs from TRETU_APPS_JSON or clock skew > 300 s"
    else
      record "platform signed ping" "$url" FAIL "HTTP $code"
    fi
  fi
fi

# Signed test webhook (contract §3/§4) to apps: node reads TRETU_APPS_JSON (the secrets stay inside node), writes the
# exact body and the signed headers to $tmp and prints "url <webhook>" or "error <message>"; curl sends it.
webhook_node='
const fs = require("node:fs");
const { createHash, createHmac, randomUUID } = require("node:crypto");
function appsJson() {
  if (process.env.SMOKE_APPS_JSON) return process.env.SMOKE_APPS_JSON;
  const file = process.env.SMOKE_ENV_FILE;
  if (!file) return null;
  let value = null;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (!line.startsWith("TRETU_APPS_JSON=")) continue;
    value = line.slice("TRETU_APPS_JSON=".length).trim();
    if (value.length >= 2 && (value[0] === "\x27" || value[0] === "\x22") && value.endsWith(value[0])) value = value.slice(1, -1);
  }
  return value;
}
const out = (s) => process.stdout.write(s + "\n");
const raw = appsJson();
if (!raw) { out("error TRETU_APPS_JSON not found (pass --env-file with the tretu.de env file)"); process.exit(0); }
let apps;
try { apps = JSON.parse(raw); } catch { out("error TRETU_APPS_JSON is not valid JSON"); process.exit(0); }
if (!apps || typeof apps !== "object" || Array.isArray(apps)) { out("error TRETU_APPS_JSON is not an object"); process.exit(0); }
const app = process.env.SMOKE_WEBHOOK_APP;
if (app === "--list") { out(Object.keys(apps).filter((a) => apps[a] && apps[a].webhook).join(",")); process.exit(0); }
const cfg = Object.prototype.hasOwnProperty.call(apps, app) ? apps[app] : null;
if (!cfg) { out("error " + app + " is not in TRETU_APPS_JSON"); process.exit(0); }
if (!cfg.webhook) { out("error no webhook configured for " + app + " in TRETU_APPS_JSON"); process.exit(0); }
if (!cfg.secret) { out("error no secret for " + app + " in TRETU_APPS_JSON"); process.exit(0); }
let url;
try { url = new URL(cfg.webhook); } catch { out("error webhook of " + app + " is not a URL"); process.exit(0); }
const body = JSON.stringify({ id: randomUUID(), type: "platform.ping", app: "platform", sub: null, occurredAt: new Date().toISOString(), data: {} });
const ts = String(Math.floor(Date.now() / 1000));
const base = [ts, "POST", url.pathname + url.search, createHash("sha256").update(body).digest("hex")].join("\n");
const sig = "v1=" + createHmac("sha256", cfg.secret).update(base).digest("hex");
fs.writeFileSync(process.env.SMOKE_TMP + "/wh-body", body);
fs.writeFileSync(process.env.SMOKE_TMP + "/wh-headers", "content-type: application/json\nx-tretu-app: platform\nx-tretu-timestamp: " + ts + "\nx-tretu-signature: " + sig + "\n");
out("url " + url.toString());
'

webhook_check() { # app
  local app="$1" line url
  line="$(SMOKE_ENV_FILE="$env_file" SMOKE_WEBHOOK_APP="$app" SMOKE_TMP="$tmp" node -e "$webhook_node" 2>"$tmp/err")" || line="error node failed: $(head -c 120 "$tmp/err")"
  if [ "${line%% *}" != "url" ]; then record "webhook $app" "-" FAIL "${line#error }"; return; fi
  url="${line#url }"
  fetch "$url" -X POST -H @"$tmp/wh-headers" --data-binary @"$tmp/wh-body"
  case "$code" in
    000) record "webhook $app" "$url" FAIL "no connection: $(head -c 120 "$tmp/err")" ;;
    204) record "webhook $app" "$url" PASS "204, signature accepted" ;;
    2??) record "webhook $app" "$url" PASS "HTTP $code (204 expected for an unknown type, but accepted)" ;;
    401) record "webhook $app" "$url" FAIL "401: the app's TRETU_APP_SECRET differs from its secret in TRETU_APPS_JSON, or clock skew > 300 s" ;;
    404) record "webhook $app" "$url" FAIL "404: webhook off in the app (TRETU_APP_SECRET unset?) or wrong path" ;;
    *) record "webhook $app" "$url" FAIL "HTTP $code" ;;
  esac
}

if [ -n "$webhook_test" ]; then
  list="$webhook_test"
  if [[ ",$webhook_test," == *",all,"* ]]; then
    list="$(SMOKE_ENV_FILE="$env_file" SMOKE_WEBHOOK_APP="--list" SMOKE_TMP="$tmp" node -e "$webhook_node" 2>/dev/null)"
    if [ "${list%% *}" = "error" ]; then record "webhook all" "-" FAIL "${list#error }"; list=""
    elif [ -z "$list" ]; then record "webhook all" "-" FAIL "no app has a webhook in TRETU_APPS_JSON"; fi
  fi
  IFS=',' read -r -a webhook_apps <<<"$list"
  for app in "${webhook_apps[@]}"; do
    [ -n "$app" ] && webhook_check "$app"
  done
fi

printf '%-22s %-6s %-58s %s\n' CHECK RESULT URL DETAIL
for row in "${rows[@]}"; do
  IFS='|' read -r c u r d <<<"$row"
  printf '%-22s %-6s %-58s %s\n' "$c" "$r" "$u" "$d"
done
if [ "$failures" -gt 0 ]; then
  echo "${failures} check(s) FAILED"
  exit 1
fi
echo "all checks passed"
