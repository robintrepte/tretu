#!/usr/bin/env bash
# Syntax-checks nginx site files with `nginx -t` without root and without real certificates:
# the certbot paths are replaced by a throwaway self-signed certificate in a temporary prefix.
#   deploy/scripts/check-nginx.sh                      # every deploy/nginx/*.conf of this repo
#   deploy/scripts/check-nginx.sh ../play/deploy/nginx/play.tretu.de.conf …
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
files=("$@")
if [ ${#files[@]} -eq 0 ]; then
  files=("$here"/../nginx/*.conf)
fi
command -v nginx >/dev/null || { echo "nginx is not installed" >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl is not installed" >&2; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/sites" "$tmp/logs" "$tmp/tmp"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=localhost" \
  -keyout "$tmp/key.pem" -out "$tmp/cert.pem" >/dev/null 2>&1
openssl dhparam -dsaparam -out "$tmp/dh.pem" 2048 >/dev/null 2>&1
: > "$tmp/options-ssl.conf"
# nginx -t opens the listen sockets: hosts without IPv6 (some CI containers) cannot check `listen [::]:…`.
strip_v6=()
if [ ! -s /proc/net/if_inet6 ]; then strip_v6=(-e '/listen[[:space:]]+\[::\]/d'); fi
# It also binds them: without root, ports 80/443 are moved to 18080/18443 (the syntax check is the same).
remap=()
if [ "$(id -u)" != "0" ]; then
  remap=(-e 's/(listen[[:space:]]+(\[::\]:)?)80([[:space:];])/\118080\3/' -e 's/(listen[[:space:]]+(\[::\]:)?)443([[:space:];])/\118443\3/')
fi

# The site files use `http2 on;` (nginx 1.25.1+, like the server). An older nginx here (Ubuntu 24.04 ships 1.24) does
# not know that directive: for the check only, it becomes the equivalent `listen … ssl http2` parameter.
legacy_http2=()
version="$(nginx -v 2>&1 | sed -E 's#.*nginx/([0-9.]+).*#\1#')"
if [ "$(printf '%s\n' 1.25.1 "$version" | sort -V | head -n1)" != "1.25.1" ]; then
  echo "note: nginx $version has no 'http2 on;' — checking with 'listen … ssl http2' instead (the server needs 1.25.1+)" >&2
  legacy_http2=(-e '/^[[:space:]]*http2[[:space:]]+on;/d' -e 's/(listen[[:space:]]+[^;]*[[:space:]]ssl)([[:space:];])/\1 http2\2/')
fi

for f in "${files[@]}"; do
  name="$(basename "$f")"
  sed -E \
    -e "s#/etc/letsencrypt/live/[^ ;]+/fullchain.pem#$tmp/cert.pem#g" \
    -e "s#/etc/letsencrypt/live/[^ ;]+/privkey.pem#$tmp/key.pem#g" \
    -e "s#/etc/letsencrypt/options-ssl-nginx.conf#$tmp/options-ssl.conf#g" \
    -e "s#/etc/letsencrypt/ssl-dhparams.pem#$tmp/dh.pem#g" \
    -e "s#/var/log/nginx/#$tmp/logs/#g" \
    "${strip_v6[@]}" "${remap[@]}" "${legacy_http2[@]}" \
    "$f" > "$tmp/sites/$name"
done

cat > "$tmp/nginx.conf" <<CONF
pid $tmp/nginx.pid;
error_log $tmp/logs/error.log;
events {}
http {
  client_body_temp_path $tmp/tmp/body;
  proxy_temp_path $tmp/tmp/proxy;
  fastcgi_temp_path $tmp/tmp/fastcgi;
  uwsgi_temp_path $tmp/tmp/uwsgi;
  scgi_temp_path $tmp/tmp/scgi;
  access_log $tmp/logs/access.log;
  map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
  include $tmp/sites/*.conf;
}
CONF

if nginx -t -q -p "$tmp" -c "$tmp/nginx.conf" 2>"$tmp/out"; then
  echo "nginx -t: OK (${#files[@]} file(s))"
else
  grep -v "could not open error log\|\[warn\].*conflicting server name\|\[warn\].*protocol options redefined" "$tmp/out" | sed "s#$tmp/sites/##g" >&2
  exit 1
fi
