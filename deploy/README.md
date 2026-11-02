# Tretu ecosystem – server setup

Everything runs on one Hetzner server: **PM2** processes behind **nginx** (TLS by certbot), one **Postgres** server with one
database and role per app. No Docker for hosting. The binding names, ports and endpoints are in
[docs/ecosystem/CONTRACT.md](../docs/ecosystem/CONTRACT.md); each app's own `DEPLOY.md` has its deploy steps.

**Taking everything live for the first time: follow [GO-LIVE.md](GO-LIVE.md)** (ordered runbook with checks and
rollbacks). Tools in this folder:

| Path | What |
|---|---|
| `env/*.example` | env templates for every app and service (tretu-web, tretu-auth, saga, play, Hollowmere `server/.env` + Nakama `local.yml`, mc-dashboard, umami, Postgres roles), rendered by `generate-secrets.mjs --templates deploy/env` |
| `scripts/generate-secrets.mjs` | one consistent set of secrets → filled env files (mode 600), `--import` keeps running apps' values |
| `scripts/create-databases.sh` | one least-privileged role + database per app, idempotent |
| `scripts/smoke.sh` | every `/api/health`, OIDC discovery + JWKS, Umami, Uptime Kuma, signed platform ping → pass/fail table |
| `scripts/check-nginx.sh` | `nginx -t` for site files without root or real certificates |
| `scripts/pg-backup.sh`, `scripts/pg-restore-test.sh`, `systemd/tretu-pg-*` | nightly dumps, weekly restore test |

`npm run test:deploy` tests all scripts (Postgres ones against the local server with throwaway names).

## Hosts, processes, ports

| Service | Host | Repo / path | PM2 name | Port | Postgres DB |
|---|---|---|---|---|---|
| Hub + platform API | tretu.de | tretu (root app) | tretu-web | 3020 | tretu_web |
| Identity provider | auth.tretu.de | tretu/auth | tretu-auth | 3021 | tretu_auth |
| Saga | saga.tretu.de | adventure.ai | saga | 3038 | saga |
| Play | play.tretu.de | play | play | 3030 | play |
| Hollowmere web + Nakama | hollowmere.tretu.de | hollowmere | hollowmere-nakama | 7350 (console 7351, localhost) | nakama |
| Minecraft dashboard | mc.tretu.de | tretu-minecraft/dashboard | mc-dashboard | 8130 | mc_dashboard |
| Analytics (Umami) | stats.tretu.de | 3rd party, below | umami | 3050 | umami |
| Status (Uptime Kuma) | status.tretu.de | 3rd party, below | uptime-kuma | 3001 | – |

tretu.de additionally runs the workers `tretu-orchestrator` and `tretu-ts-rank` (see [DEPLOY.md](../DEPLOY.md)).
All apps bind to `127.0.0.1`; only nginx (80/443), the game ports (Minecraft 25565, TeamSpeak) and SSH are public.

Every app answers `GET /api/health` with `200 {"status":"ok","app":…,"version":…,"time":…,"checks":{"db":"ok"}}`
or `503` – that is what Uptime Kuma watches.

## Postgres: one database and role per app

```bash
sudo apt install postgresql          # Ubuntu 24.04 ships 16
node deploy/scripts/generate-secrets.mjs --out /root/tretu-secrets      # passwords in postgres/roles.env
install -m 600 -o postgres /root/tretu-secrets/postgres/roles.env /tmp/tretu-roles.env
sudo -u postgres deploy/scripts/create-databases.sh --passwords /tmp/tretu-roles.env && shred -u /tmp/tretu-roles.env
```

- Roles `tretu_web`, `tretu_auth`, `saga`, `play`, `mc_dashboard`, `nakama`, `umami`: LOGIN only (no superuser,
  createdb, createrole, replication), each owns its database and its `public` schema, `CONNECT` is revoked from
  PUBLIC, so no app can open another app's database. `tretu_legacy_reader` can only read saga, play, tretu_web and
  nakama (auth's one-time legacy import). Running the script again only re-applies passwords and grants; databases
  owned by another role are left alone (see [GO-LIVE.md](GO-LIVE.md) step 4).
- Each app gets only its own `DATABASE_URL`, e.g. `postgres://tretu_web:…@localhost:5432/tretu_web`.
- Keep Postgres on localhost (`listen_addresses = 'localhost'`, the default) and use `scram-sha-256` in `pg_hba.conf`.

### Backups (every database) and restore test

```bash
install -d -m 700 -o postgres /var/backups/tretu-postgres
install -d -m 755 /etc/tretu && install -m 600 /dev/null /etc/tretu/pg-backup.env   # optional settings, see below
sudo cp deploy/systemd/tretu-pg-* /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now tretu-pg-backup.timer tretu-pg-restore-test.timer
```

| What | When | Details |
|---|---|---|
| `pg_dump -Fc` of tretu_web, tretu_auth, saga, play, mc_dashboard, nakama, umami + `pg_dumpall --globals-only` | daily 03:17 (`tretu-pg-backup.timer`) | `/var/backups/tretu-postgres/<db>/<db>-<UTC time>.dump` + `.sha256`, mode 600, verified with `pg_restore --list`, kept 14 days (`RETENTION_DAYS`) |
| copy off the machine | after each backup | `BACKUP_REMOTE` + `BACKUP_RSYNC_SSH` (rsync over SSH, e.g. Hetzner Storage Box port 23) |
| restore test | Sundays 05:41 (`tretu-pg-restore-test.timer`) | newest dump of each database → `<db>_restore_test`, counts tables/rows, drops it; fails on missing, older than 26 h, or checksum mismatch |
| alerting | | `BACKUP_PING_URL` / `RESTORE_PING_URL` = Uptime Kuma push monitors (heartbeat 25 h / 8 d): a run that fails or never happens turns them red |

Restore one database (e.g. after a bad migration):

```bash
pm2 stop saga                                                           # stop the app that writes to it
sudo -u postgres pg_restore --clean --if-exists -d saga /var/backups/tretu-postgres/saga/saga-<time>.dump
pm2 start saga
```

On a new server: restore `globals/globals-<time>.sql` with `psql -f` first (roles), then each dump with
`createdb -O <role> <db> && pg_restore -d <db> <dump>`. Besides Postgres, keep the env files / `tretu-secrets.json`
(password manager) and the app data outside Postgres (Saga `STORAGE_DIR`, Minecraft worlds, see each app's doc).

## nginx and certbot

```bash
sudo apt install nginx certbot python3-certbot-nginx
sudo cp deploy/nginx/*.conf /etc/nginx/sites-available/      # from each repo
sudo ln -s /etc/nginx/sites-available/<host>.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d tretu.de -d www.tretu.de             # one call per host
sudo nginx -t && sudo systemctl reload nginx
```

certbot installs a systemd timer that renews certificates automatically; check with `sudo certbot renew --dry-run`.

**Log retention:** the privacy policy promises at most 7 days of access logs. Set nginx's logrotate accordingly in
`/etc/logrotate.d/nginx`:

```
/var/log/nginx/*.log {
    daily
    rotate 7
    missingok
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        [ -s /run/nginx.pid ] && kill -USR1 `cat /run/nginx.pid`
    endscript
}
```

## PM2 and pm2-logrotate

```bash
sudo npm i -g pm2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 7          # 7 days, matching the privacy policy
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 startup                              # run the printed command once
pm2 save                                 # after starting all apps
```

Each repo starts its processes with `pm2 start ecosystem.config.cjs` and deploys with
`pm2 reload ecosystem.config.cjs --update-env`.

## Umami (stats.tretu.de) – self-hosted, cookie-free

Umami sets no cookies and stores no IP addresses, so no consent banner is needed (see the privacy policy, section 17).

```bash
sudo -u postgres psql -c "CREATE ROLE umami LOGIN PASSWORD '…'" -c "CREATE DATABASE umami OWNER umami"
git clone https://github.com/umami-software/umami.git /srv/umami && cd /srv/umami
git checkout <latest release tag>
cat > .env <<'ENV'
DATABASE_URL=postgresql://umami:…@localhost:5432/umami
APP_SECRET=<long random string>
DISABLE_TELEMETRY=1
PORT=3050
HOSTNAME=127.0.0.1
ENV
npm install -g pnpm && pnpm install && pnpm build
pm2 start pnpm --name umami -- start
pm2 save
```

Then install `deploy/nginx/stats.tretu.de.conf`, run certbot, log in (default `admin` / `umami` – **change the password
immediately**), add one website per app (tretu.de, saga.tretu.de, play.tretu.de, hollowmere.tretu.de, mc.tretu.de) and put
its ID into that app's env:

```
NEXT_PUBLIC_UMAMI_SRC=https://stats.tretu.de/script.js
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<website id>
```

`NEXT_PUBLIC_*` values are inlined at build time: rebuild the app after setting them. Update Umami with
`git pull && pnpm install && pnpm build && pm2 reload umami`.

## Uptime Kuma (status.tretu.de)

```bash
git clone https://github.com/louislam/uptime-kuma.git /srv/uptime-kuma && cd /srv/uptime-kuma
git checkout <latest 2.x release tag>
npm run setup
pm2 start server/server.js --name uptime-kuma -- --port=3001 --host=127.0.0.1
pm2 save
```

Install `deploy/nginx/status.tretu.de.conf`, run certbot, open https://status.tretu.de and create the admin account.
Add one **HTTP(s) – Json Query** monitor per app (interval 60 s, retries 2), expression `status`, expected value `ok`:

| Monitor | URL |
|---|---|
| tretu.de | https://tretu.de/api/health |
| Tretu-Konto | https://auth.tretu.de/api/health |
| Saga | https://saga.tretu.de/api/health |
| Play | https://play.tretu.de/api/health |
| Hollowmere | https://hollowmere.tretu.de/api/health |
| Minecraft dashboard | https://mc.tretu.de/api/health |
| Umami | https://stats.tretu.de/api/heartbeat (plain HTTP monitor) |
| tretu.de platform worker | https://tretu.de/api/health, Json Query `checks.worker != "stale"`, expected `true` |
| Backups | Push monitors for `BACKUP_PING_URL` (heartbeat 25 h) and `RESTORE_PING_URL` (8 days) |

Optional: a TCP monitor for `tretu.de:25565` (Minecraft) and the TeamSpeak port, a notification channel (e.g. Discord
webhook or email) and a public status page at `/status/tretu` showing all monitors. Certificate expiry alerts are built in.

## Smoke test

```bash
deploy/scripts/smoke.sh --env-file /srv/tretu/.env.local     # signed ping as tretu-web; --only/--skip/--map, see --help
```

## CI

`.github/workflows/ci.yml` runs both apps' full check suites (Postgres 16 service) on pull requests and pushes to
`main`. GitHub Actions must be enabled for the repository (Settings → Actions → General).
