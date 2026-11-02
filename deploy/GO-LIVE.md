# Go-live runbook – the whole Tretu ecosystem

The exact order for taking every Tretu service live on the one Hetzner server (PM2 behind nginx, one Postgres,
no Docker). Names, hosts, ports and databases are those of [docs/ecosystem/CONTRACT.md](../docs/ecosystem/CONTRACT.md) §0.
Every step says how to check it and how to roll it back. Each app's own deploy doc has the details:

| App | Host | Deploy doc |
|---|---|---|
| Hub + platform API | tretu.de | [DEPLOY.md](../DEPLOY.md), [PLATFORM.md](../docs/ecosystem/PLATFORM.md) |
| Tretu-Konto (OIDC) | auth.tretu.de | [auth/DEPLOY.md](../auth/DEPLOY.md) |
| Saga | saga.tretu.de | [adventure.ai DEPLOY.md](https://github.com/robintrepte/adventure.ai/blob/main/DEPLOY.md) |
| Play | play.tretu.de | [play DEPLOY.md](https://github.com/robintrepte/play/blob/main/DEPLOY.md) |
| Hollowmere (Nakama + web + MCP relay) | hollowmere.tretu.de, mcp.hollowmere.tretu.de | [hollowmere HOSTING.md](https://github.com/robintrepte/hollowmere/blob/main/HOSTING.md) |
| Minecraft dashboard + map | mc.tretu.de, map.tretu.de | [tretu-minecraft README.md](https://github.com/robintrepte/tretu-minecraft/blob/main/README.md) |
| Umami, Uptime Kuma | stats.tretu.de, status.tretu.de | [deploy/README.md](README.md) |

Tools used below (all in this repo, all tested in CI): `deploy/scripts/generate-secrets.mjs`,
`create-databases.sh`, `smoke.sh`, `check-nginx.sh`, `pg-backup.sh`, `pg-restore-test.sh`. Run them from the
tretu checkout (`/srv/tretu`). **Every integration stays off until its env is set**, so each app can be switched
on and back off on its own.

Conventions: `$IP` / `$IP6` = the server's addresses; commands as root unless `sudo -u postgres` is shown; each
app runs as its own Unix user or the deploy user that owns `/srv/<repo>`.

---

## 0. One day before

1. Lower the TTL of the existing DNS records to 300 s.
2. Announce a maintenance window (Saga and Play sign everyone out once only if their session secret changes; step 3
   keeps it).
3. Back up what runs today: `pg_dump -Fc` of the existing Saga, Play and Nakama databases and tretu.de's data
   (SQLite file if not yet migrated, see [DEPLOY.md](../DEPLOY.md) "Upgrade from the SQLite version"), plus every
   current `.env`. Keep them off the server.
4. Server: Ubuntu 24.04, Node 22 (`node -v`), `npm i -g pm2`, Postgres 16, nginx, certbot:
   `apt install -y postgresql nginx certbot python3-certbot-nginx rsync curl ufw`.
5. Firewall: `ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 25565/tcp` (+ the TeamSpeak
   ports if TeamSpeak runs here: 9987/udp, 30033/tcp) `&& ufw --force enable`. ServerQuery (10011) and every app
   port stay closed (apps bind to 127.0.0.1).

**Rollback:** nothing changed yet.

## 1. DNS

| Type | Name | Value |
|---|---|---|
| A / AAAA | `tretu.de`, `www` | `$IP` / `$IP6` |
| A / AAAA | `auth`, `saga`, `play`, `hollowmere`, `mcp.hollowmere`, `mc`, `map`, `stats`, `status` | `$IP` / `$IP6` |

Check (every line must end in `$IP`):

```bash
for h in tretu.de www auth saga play hollowmere mcp.hollowmere mc map stats status; do
  [ "$h" = tretu.de ] || h="$h.tretu.de"; printf '%-26s %s\n' "$h" "$(dig +short A "$h" | tail -n 1)"
done
```

**Rollback:** restore the previous records (TTL 300 s makes it quick).

## 2. Base setup: PM2, log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M && pm2 set pm2-logrotate:retain 7 && pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 startup        # run the printed command once
```

nginx logs: 7 days (privacy policy), `/etc/logrotate.d/nginx` as in [deploy/README.md](README.md#nginx-and-certbot).
Check: `logrotate -d /etc/logrotate.d/nginx` shows `rotate 7`.

**Rollback:** `pm2 uninstall pm2-logrotate`.

## 3. Secrets (one consistent set for everything)

```bash
cd /srv/tretu && git pull
# --import keeps the secrets and settings of apps that already run (sessions, API keys, OAuth apps, VAPID keys).
node deploy/scripts/generate-secrets.mjs --out /root/tretu-secrets \
  --import saga=/srv/saga/.env --import play=/srv/play/.env --import tretu-web=/srv/tretu/.env.local
```

- Writes `/root/tretu-secrets/` (mode 700, files 600): `tretu-web/.env.local`, `tretu-auth/.env`, `saga/.env`,
  `play/.env`, `hollowmere/server.env` + `hollowmere/local.yml`, `mc-dashboard/.env`, `umami/.env`,
  `postgres/roles.env` and the state file `tretu-secrets.json`. Nothing secret is printed.
- Templates of all of them: [deploy/env/](env/). Values marked `external` (Discord/Google/Apple OAuth apps, SES, OpenAI,
  Replicate, ElevenLabs, TMDB, TeamSpeak ServerQuery, Discord bot, Umami website ids) are filled in by hand now.
- **tretu-web:** keep the existing `AUTH_SECRET` (imported): it also decrypts the stored Hetzner/Cloudflare tokens.
- Running it again is safe (same files, only missing values are added). `--fresh` would rotate everything.
- Store `/root/tretu-secrets/tretu-secrets.json` in the password manager.

Check: `ls -la /root/tretu-secrets/*/` (all `-rw-------`), `grep -c = /root/tretu-secrets/tretu-auth/.env`.

**Rollback:** delete `/root/tretu-secrets`; no app uses the files before its own step.

## 4. Databases (one role + database per app, least privileges)

```bash
# roles.env is root-only: hand postgres a private copy for the run.
install -m 600 -o postgres /root/tretu-secrets/postgres/roles.env /tmp/tretu-roles.env
sudo -u postgres /srv/tretu/deploy/scripts/create-databases.sh --dry-run --passwords /tmp/tretu-roles.env
sudo -u postgres /srv/tretu/deploy/scripts/create-databases.sh --passwords /tmp/tretu-roles.env
shred -u /tmp/tretu-roles.env
```

- Creates `tretu_web`, `tretu_auth`, `saga`, `play`, `mc_dashboard`, `nakama`, `umami` (owner = same-named role,
  LOGIN only, CONNECT revoked from PUBLIC) and the read-only `tretu_legacy_reader` for auth's legacy import.
- **Existing databases** owned by another role (e.g. Play's old `tretu` role) are reported as `SKIPPED`. Either keep
  that app's existing `DATABASE_URL` (edit the generated env file), or hand the data to the new role inside that
  database: `sudo -u postgres psql -d play -c 'REASSIGN OWNED BY tretu TO play'` and
  `ALTER DATABASE play OWNER TO play`, then run the script again.
- `pg_hba.conf`: `scram-sha-256` for `host all all 127.0.0.1/32` and `::1/128`; `listen_addresses = 'localhost'`.

Check: the table at the end (`created` / `exists`); `psql "postgres://saga:…@localhost/saga" -c 'select 1'` with
the password from `roles.env`.

**Rollback:** `DROP DATABASE <db>; DROP ROLE <role>;` for databases created here (they are empty until the apps migrate).

## 5. Backups (before any app writes)

```bash
install -d -m 700 -o postgres /var/backups/tretu-postgres
install -d -m 755 /etc/tretu && install -m 600 /dev/null /etc/tretu/pg-backup.env
#   BACKUP_REMOTE=u123456@u123456.your-storagebox.de:tretu-postgres/
#   BACKUP_RSYNC_SSH=ssh -p 23 -i /var/lib/postgresql/.ssh/backup_ed25519
#   BACKUP_PING_URL=https://status.tretu.de/api/push/<token>    (after step 8)
cp /srv/tretu/deploy/systemd/tretu-pg-* /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now tretu-pg-backup.timer tretu-pg-restore-test.timer
systemctl start tretu-pg-backup.service && journalctl -u tretu-pg-backup -n 20
```

Nightly `pg_dump -Fc` of every database + roles, 14 days retention, copied off the machine; weekly restore test
into scratch databases (fails on missing, stale or corrupted dumps). Run `systemctl start tretu-pg-backup` by hand
before every migration below.

Check: `sudo -u postgres /srv/tretu/deploy/scripts/pg-restore-test.sh` → `restore test passed`.

**Rollback:** `systemctl disable --now tretu-pg-backup.timer tretu-pg-restore-test.timer`.

## 6. nginx and certificates

```bash
# every repo's site files (tretu, tretu/auth, adventure.ai, play, hollowmere, tretu-minecraft)
/srv/tretu/deploy/scripts/check-nginx.sh /srv/tretu/deploy/nginx/*.conf /srv/tretu/auth/deploy/nginx/*.conf \
  /srv/saga/deploy/nginx/*.conf /srv/play/deploy/nginx/*.conf /srv/hollowmere/deploy/nginx/*.conf /srv/tretu-minecraft/deploy/nginx/*.conf
cp <those files> /etc/nginx/sites-available/ && ln -s /etc/nginx/sites-available/<host>.conf /etc/nginx/sites-enabled/
certbot --nginx -d tretu.de -d www.tretu.de        # then once per host: auth, saga, play, hollowmere,
                                                   # mcp.hollowmere, mc, map, stats, status
nginx -t && systemctl reload nginx && certbot renew --dry-run
```

`check-nginx.sh` runs `nginx -t` on the files with a throwaway certificate. Ubuntu 24.04 ships nginx 1.24, which
does not know the `http2 on;` directive (1.25.1+): a site file that uses it fails here; use
`listen 443 ssl http2;` in that file or install nginx mainline from nginx.org.

**Rollback:** remove the link in `sites-enabled`, `systemctl reload nginx`.

## 7. Deploy order

Each app: install its env file from `/root/tretu-secrets` (`install -m 600 -o <user> … <target>`), then its own
deploy doc (`git pull` → `npm ci` → migrate → `npm run build` → `pm2 start|reload ecosystem.config.cjs --update-env`).
Keep the previous env file as `<file>.before-tretu` for the rollback.

### 7.1 tretu.de (hub + platform API) – first: auth sends its events here

In the generated `.env.local`, leave `TRETU_AUTH_CLIENT_SECRET=` **empty** for now (the Tretu-Konto login turns on in
7.5); the platform (`TRETU_APPS_JSON`, `TRETU_AUTH_ISSUER` for user fetches) is on.

```bash
cd /srv/tretu && npm ci && systemctl start tretu-pg-backup && npm run db:migrate && npm run build
pm2 start ecosystem.config.cjs     # tretu-web, tretu-orchestrator, tretu-ts-rank, tretu-platform-worker
pm2 save
deploy/scripts/smoke.sh --only web --env-file /srv/tretu/.env.local
```

Check: `health web PASS … migrations=ok worker=ok`, `platform signed ping PASS`.
**Rollback:** `git checkout <previous tag>`, restore `.env.local.before-tretu`, `npm ci && npm run build`,
`pm2 reload ecosystem.config.cjs --update-env` (migrations are additive, the old code ignores the new tables).

### 7.2 auth.tretu.de

```bash
cd /srv/tretu/auth && npm ci && npm run db:migrate && npm run build && npm run clients:sync
pm2 start ecosystem.config.cjs && pm2 save      # tretu-auth, tretu-auth-events
npm run admin -- grant <your username> admin   # after registering at https://auth.tretu.de (turn on 2FA)
/srv/tretu/deploy/scripts/smoke.sh --only web,auth --env-file /srv/tretu/.env.local
```

Check: `oidc discovery PASS`, `oidc jwks PASS`; register a test account, `https://tretu.de/u/<name>` exists
(user.created reached the platform). **Rollback:** `pm2 stop tretu-auth tretu-auth-events` (no app uses it yet).

### 7.3 Umami and Uptime Kuma

As in [deploy/README.md](README.md) (env from `/root/tretu-secrets/umami/.env`). Create one Umami website per app
and put the ids into `NEXT_PUBLIC_UMAMI_WEBSITE_ID` of each env file (inlined at build time: rebuild later in 7.5).
Uptime Kuma: the monitors listed in [deploy/README.md](README.md#uptime-kuma-statustretude), plus push monitors for
the backup and restore test (`BACKUP_PING_URL`, `RESTORE_PING_URL` in `/etc/tretu/pg-backup.env`).

**Rollback:** `pm2 stop umami uptime-kuma`; apps without a website id render no tag.

### 7.4 Legacy accounts: dry run, then import

```bash
cd /srv/tretu/auth
npm run import:legacy -- --dry-run      # read-only (tretu_legacy_reader); report in reports/legacy-import-dry-run-*.json
```

Review merges, username and email conflicts; fix what needs fixing in the old apps, run the dry run again until
the report is clean. Then `systemctl start tretu-pg-backup && npm run import:legacy` (idempotent; announces
`user.created` to the platform). Check: the import's summary matches the dry run, and imported users have profiles
on `https://tretu.de/u/<name>`.

**Rollback:** restore the `tretu_auth` dump from the backup taken right before (imports only touch `tretu_auth`).

### 7.5 Switch the apps on, one at a time

Order: **tretu.de login → Saga → Play → Minecraft dashboard → Hollowmere**. For each: backup, install the env file,
deploy per its doc, smoke, sign in with a test Tretu-Konto and with an old local account, then the next one.

| App | Switch on | Check | Rollback |
|---|---|---|---|
| tretu.de | set `TRETU_AUTH_CLIENT_SECRET` (from the generated file), `npm run build`, `pm2 reload ecosystem.config.cjs --update-env` | "Mit Tretu-Konto anmelden" works; Discord login still works | empty `TRETU_AUTH_CLIENT_SECRET`, reload |
| Saga | `/root/tretu-secrets/saga/.env` → `/srv/saga/.env`, deploy ([DEPLOY.md](https://github.com/robintrepte/adventure.ai/blob/main/DEPLOY.md)) | `smoke.sh --only saga`, Tretu login, a turn shows XP on tretu.de | `.env.before-tretu`, `pm2 reload saga --update-env` |
| Play | `play/.env` → `/srv/play/.env`, deploy ([DEPLOY.md](https://github.com/robintrepte/play/blob/main/DEPLOY.md)) | `smoke.sh --only play`, a finished game shows up in the profile | same for `play` |
| Minecraft dashboard | `mc-dashboard/.env` → `/srv/tretu-minecraft/dashboard/.env`, `npm ci --omit=dev && npm run migrate`, reload ([README](https://github.com/robintrepte/tretu-minecraft/blob/main/README.md)) | `smoke.sh --only mc`, Tretu login, "Minecraft verknüpfen" | same for `mc-dashboard` |
| Hollowmere | `hollowmere/server.env` → `server/.env`, `hollowmere/local.yml` → `server/nakama/local.yml`, `nakama.sh check`, reload ([HOSTING.md](https://github.com/robintrepte/hollowmere/blob/main/HOSTING.md) §5, §10) | `smoke.sh --only hollowmere`, Tretu sign-in in the web build | previous `local.yml`, reload |

Then the optional parts in `/srv/tretu/.env.local`: web push (VAPID keys are already set), Discord bot +
`TRETU_BADGE_DISCORD_ROLES_JSON`, `TS_QUERY_*` + `TRETU_BADGE_TS_GROUPS_JSON` → `pm2 reload ecosystem.config.cjs --update-env`.
Rollback: empty the mapping (the worker then removes the granted roles: an empty mapping means "no badge maps";
to switch off without removing, remove `DISCORD_BOT_TOKEN` instead).

## 8. Verification

```bash
/srv/tretu/deploy/scripts/smoke.sh --env-file /srv/tretu/.env.local    # every row PASS
```

- Every Uptime Kuma monitor green, certificate expiry > 60 days.
- With a test Tretu-Konto: sign in to every app, win a game in Play → badge + credits on tretu.de, invite a friend,
  notification + push, link Steam and TeamSpeak in Mein Konto / `/einstellungen#teamspeak`.
- Delete the test account in Mein Konto: it disappears from every app, its profile on tretu.de 404s, and Discord
  roles / TeamSpeak groups granted for badges are removed (worker log `platform.badge_sync.released`, jobs
  `badge.revoke.*` done).
- `systemctl list-timers 'tretu-pg-*'`, `pm2 ls` (no restarts piling up), `pm2 logs --lines 50` (no errors, no secrets).

## 9. Afterwards

- Raise the DNS TTL again.
- `TRETU_LOCAL_LOGIN=false` / `TRETU_DISCORD_FALLBACK=false` / `TRETU_CODE_LOGIN=false` once everyone has linked a
  Tretu-Konto (each app's doc).
- Keep `/root/tretu-secrets` only as long as needed; the password manager holds `tretu-secrets.json`.
- GitHub Actions must be enabled for every repository (Settings → Actions → General) so CI runs on pull requests.
