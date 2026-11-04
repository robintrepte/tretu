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
| Tretu City | city.tretu.de | [city.tretu.de DEPLOY.md](https://github.com/robintrepte/city.tretu.de/blob/main/DEPLOY.md) |
| Status page (part of tretu.de) | tretu.de/status | [DEPLOY.md](../DEPLOY.md#status-page-tretudestatus) |

Tools used below (all in this repo, all tested in CI): `deploy/scripts/generate-secrets.mjs`,
`create-databases.sh`, `smoke.sh`, `check-nginx.sh`, `pg-backup.sh`, `pg-restore-test.sh`. Run them from the
tretu checkout (`/srv/tretu`). **Every app signs people in only with the Tretu-Konto** (auth.tretu.de): its
`TRETU_AUTH_*` settings are required (tretu.de does not start without them), and auth.tretu.de plus the legacy import
(7.2, 7.4) must be done **before** any app's Tretu-only version is opened to members (7.5). Optional integrations
(push, badge sync, status alerts, …) stay off until their env is set.

Conventions: `$IP` / `$IP6` = the server's addresses; commands as root unless `sudo -u postgres` is shown; each
app runs as its own Unix user or the deploy user that owns `/srv/<repo>`.
Paths: this runbook writes checkouts as `/srv/<repo>`; on the Tretu server (tfmg) they live under
`/var/www/<domain>` (e.g. `/var/www/saga.tretu.de`), so substitute accordingly. Every Next.js app pins its project
root in `next.config.ts`, so a `package-lock.json` in `/var/www` does not matter. The shared ACME webroot of every
nginx file is `/var/www/letsencrypt` (`certbot certonly --webroot -w /var/www/letsencrypt -d <host>`).

---

## 0. One day before

1. Lower the TTL of the existing DNS records to 300 s.
2. Announce a maintenance window from step 7.1 until 7.5 is through: sign-ins switch to the Tretu-Konto, and
   members must not sign in to an app before the legacy import (7.4) has linked their old accounts. (Saga and Play
   sign everyone out once only if their session secret changes; step 3 keeps it.)
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
| A / AAAA | `auth`, `saga`, `play`, `hollowmere`, `mcp.hollowmere`, `mc`, `map`, `city` | `$IP` / `$IP6` |

There is no analytics or status host: remove old `stats` / `status` records if they exist (the status page is
https://tretu.de/status).

Check (every line must end in `$IP`):

```bash
for h in tretu.de www auth saga play hollowmere mcp.hollowmere mc map city; do
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
  `play/.env`, `hollowmere/server.env` + `hollowmere/local.yml`, `mc-dashboard/.env`, `city/.env`,
  `postgres/roles.env` and the state file `tretu-secrets.json`. Nothing secret is printed.
- Templates of all of them: [deploy/env/](env/). Values marked `external` (auth's Discord/Google/Apple OAuth apps, SES,
  OpenAI, Replicate, ElevenLabs, TMDB, TeamSpeak ServerQuery, Discord bots, status Discord webhook) are filled in by
  hand now. The apps have no Discord/Google OAuth apps of their own any more: those sign-ins live in auth.tretu.de.
- Settings of the removed app logins (`TRETU_DISCORD_FALLBACK`, `TRETU_LOCAL_LOGIN`, `TRETU_CODE_LOGIN`,
  `TRETU_SKIP_INVITE_FOR_TRETU`, the apps' `AUTH_DISCORD_*` / `DISCORD_CLIENT_*` / `GOOGLE_CLIENT_*`) are dropped from
  imported env files; the generated file names them in a comment at the end.
- **tretu-web:** keep the existing `AUTH_SECRET` (imported): it also decrypts the stored Hetzner/Cloudflare tokens.
- Running it again is safe (same files, only missing values are added). `--fresh` would rotate everything.
- Store `/root/tretu-secrets/tretu-secrets.json` in the password manager.

Check: `ls -la /root/tretu-secrets/*/` (all `-rw-------`), `grep -c = /root/tretu-secrets/tretu-auth/.env`, and every
app has its Tretu-Konto settings (no output = good):

```bash
cd /root/tretu-secrets
for f in tretu-web/.env.local saga/.env play/.env mc-dashboard/.env city/.env; do
  for k in TRETU_AUTH_ISSUER TRETU_AUTH_CLIENT_ID TRETU_AUTH_CLIENT_SECRET; do grep -q "^$k=." "$f" || echo "MISSING $k in $f"; done
done
grep -q '"TRETU_AUTH_ISSUER=https://auth\.' hollowmere/local.yml || echo "MISSING TRETU_AUTH_ISSUER in hollowmere/local.yml"
grep -E '^(TRETU_DISCORD_FALLBACK|TRETU_LOCAL_LOGIN|TRETU_CODE_LOGIN|TRETU_SKIP_INVITE_FOR_TRETU)=' */.env* && echo "REMOVED SETTING LEFT"
```

**Rollback:** delete `/root/tretu-secrets`; no app uses the files before its own step.

## 4. Databases (one role + database per app, least privileges)

```bash
# roles.env is root-only: hand postgres a private copy for the run.
install -m 600 -o postgres /root/tretu-secrets/postgres/roles.env /tmp/tretu-roles.env
sudo -u postgres /srv/tretu/deploy/scripts/create-databases.sh --dry-run --passwords /tmp/tretu-roles.env
sudo -u postgres /srv/tretu/deploy/scripts/create-databases.sh --passwords /tmp/tretu-roles.env
shred -u /tmp/tretu-roles.env
```

- Creates `tretu_web`, `tretu_auth`, `saga`, `play`, `mc_dashboard`, `city`, `nakama` (owner = same-named role,
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
#   BACKUP_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/<id>/<token>   (a failed run posts there)
cp /srv/tretu/deploy/systemd/tretu-pg-* /etc/systemd/system/ && systemctl daemon-reload
systemctl enable --now tretu-pg-backup.timer tretu-pg-restore-test.timer
systemctl start tretu-pg-backup.service && journalctl -u tretu-pg-backup -n 20
```

Nightly `pg_dump -Fc` of every database + roles, 14 days retention, copied off the machine; weekly restore test
into scratch databases (fails on missing, stale or corrupted dumps). With `BACKUP_ALERT_WEBHOOK_URL` set, a failed
backup or restore test posts a short message to that Discord channel. Run `systemctl start tretu-pg-backup` by hand
before every migration below.

Check: `sudo -u postgres /srv/tretu/deploy/scripts/pg-restore-test.sh` → `restore test passed`.

**Rollback:** `systemctl disable --now tretu-pg-backup.timer tretu-pg-restore-test.timer`.

## 6. nginx and certificates

```bash
# every repo's site files (tretu, tretu/auth, adventure.ai, play, hollowmere, tretu-minecraft, city.tretu.de)
/srv/tretu/deploy/scripts/check-nginx.sh /srv/tretu/deploy/nginx/*.conf /srv/tretu/auth/deploy/nginx/*.conf \
  /srv/saga/deploy/nginx/*.conf /srv/play/deploy/nginx/*.conf /srv/hollowmere/deploy/nginx/*.conf /srv/tretu-minecraft/deploy/nginx/*.conf \
  /srv/city/deploy/nginx/*.conf
cp <those files> /etc/nginx/sites-available/ && ln -s /etc/nginx/sites-available/<host>.conf /etc/nginx/sites-enabled/
certbot --nginx -d tretu.de -d www.tretu.de        # then once per host: auth, saga, play, hollowmere,
                                                   # mcp.hollowmere, mc, map, city
nginx -t && systemctl reload nginx && certbot renew --dry-run
```

`check-nginx.sh` runs `nginx -t` on the files with a throwaway certificate. The site files enable HTTP/2 with
`http2 on;` and therefore need **nginx 1.25.1 or newer** on the server (the Tretu server has it; Ubuntu 24.04's own
package is 1.24, so there install nginx from nginx.org). On an older nginx, `check-nginx.sh` checks the files with the
equivalent `listen … ssl http2` instead and says so.

**Rollback:** remove the link in `sites-enabled`, `systemctl reload nginx`.

## 7. Deploy order

Each app: install its env file from `/root/tretu-secrets` (`install -m 600 -o <user> … <target>`), then its own
deploy doc (`git pull` → `npm ci` → migrate → `npm run build` → `pm2 start|reload ecosystem.config.cjs --update-env`).
Keep the previous env file as `<file>.before-tretu` for the rollback.

Before installing an app's env file (here and in 7.5), check its Tretu-Konto settings on the target path (no output =
good):

```bash
for f in /srv/tretu/.env.local /srv/saga/.env /srv/play/.env /srv/tretu-minecraft/dashboard/.env /srv/city/.env; do
  [ -f "$f" ] || continue
  for k in TRETU_AUTH_ISSUER TRETU_AUTH_CLIENT_ID TRETU_AUTH_CLIENT_SECRET; do grep -q "^$k=." "$f" || echo "MISSING $k in $f"; done
done
```

### 7.1 tretu.de (hub + platform API) – first: auth sends its events here, the import reads its database

The generated `.env.local` has all three `TRETU_AUTH_*` (required: `next start` exits without them). tretu.de's
sign-in ("Mit Tretu-Konto anmelden", the only one) works as soon as auth runs (7.2), but stays **closed to members
until the import (7.4) is done** (maintenance window, step 0): the import is what brings members back to their old
tretu.de account. Only the operator signs in before that, with a fresh test account.

```bash
cd /srv/tretu && npm ci && systemctl start tretu-pg-backup && npm run db:migrate && npm run build
pm2 start ecosystem.config.cjs     # tretu-web, tretu-orchestrator, tretu-ts-rank, tretu-platform-worker
pm2 save
deploy/scripts/smoke.sh --only web --env-file /srv/tretu/.env.local   # or, in /srv/tretu: npm run smoke -- --only web
```

Check: `health web PASS … migrations=ok worker=ok`, `platform signed ping PASS`, `status page PASS` (the worker's
first status checks run right after its start; services not deployed yet show as "Ausgefallen" on /status until
their step).
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

### 7.3 Status page and alerts

Nothing to install: `tretu-platform-worker` (started in 7.1) checks every service's `/api/health` once a minute and
https://tretu.de/status shows the result. The generated `.env.local` already lists the seven services in
`TRETU_STATUS_TARGETS_JSON`, the Minecraft server (`TRETU_STATUS_MINECRAFT`) and the extra certificate hosts; the
TeamSpeak row appears with `TS_QUERY_*` (or `TRETU_STATUS_TEAMSPEAK`). The webhook also gets certificate warnings
(14 and 3 days before expiry). Optionally create a Discord webhook (channel settings → Integrations → Webhooks) and set
`TRETU_STATUS_DISCORD_WEBHOOK_URL` in `/srv/tretu/.env.local`, and the same URL as `BACKUP_ALERT_WEBHOOK_URL` in
`/etc/tretu/pg-backup.env`; then `pm2 reload ecosystem.config.cjs --update-env`.

Check: https://tretu.de/status lists every service with "Stand: <time>" from the last minute; `curl -s
https://tretu.de/api/status | head -c 300`. To try the webhook without touching a live app, add a temporary entry
`{"id":"alarmtest","url":"https://tretu.de/gibt-es-nicht"}` to `TRETU_STATUS_TARGETS_JSON` and reload: after two
minutes one "alarmtest … ist ausgefallen" message arrives (and nothing more); remove the entry and reload again.

Planned work on one service (e.g. Hollowmere not live yet, a server move): give its entry `"maintenance":"<note>"`
(optionally `"until":"2026-11-05T18:00:00+01:00"`) or `"excludeFromOverall":true`, then reload. It shows "Wartung",
does not turn the overall status red and sends no Discord alerts until `until` (DEPLOY.md, "Status page"). The
Minecraft and TeamSpeak rows take the same options as JSON: `TRETU_STATUS_MINECRAFT='{"address":"mc.tretu.de:25565","maintenance":true}'`.

**Rollback:** empty `TRETU_STATUS_DISCORD_WEBHOOK_URL` (no messages); `TRETU_STATUS_TARGETS_JSON=[]` and `TRETU_STATUS_MINECRAFT=off`
stop the checks.

### 7.4 Legacy accounts: dry run, then import

```bash
cd /srv/tretu/auth
npm run import:legacy -- --dry-run      # read-only (tretu_legacy_reader); report in reports/legacy-import-dry-run-*.json
```

Review merges, username and email conflicts; fix what needs fixing in the old apps, run the dry run again until
the report is clean. Then `systemctl start tretu-pg-backup && npm run import:legacy` (idempotent; announces
`user.created` to the platform). Check: the import's summary matches the dry run, and imported users have profiles
on `https://tretu.de/u/<name>`.

Old admins: the summary lists "Accounts with roles in the old apps" with the target Tretu username and user ID per
entry plus the command to run (also in the report JSON, `legacyRoles[].grant`), e.g.
`saga:3  robin  admin → robin [<id>]` / `npm run admin -- grant robin admin`. Run it after the real import for
everyone who should be a Tretu admin (they must turn on 2FA); `admin grant` accepts a username, email or user ID.

Users cannot connect old accounts themselves. Review the report, then merge the remaining old accounts by hand:

```bash
npm run admin -- legacy                       # imported accounts no merge touched yet, with possible matches
npm run admin -- merge <from> <into>          # dry run: both accounts, what moves, what is dropped
npm run admin -- merge <from> <into> --yes    # merge; the platform moves wallet and stats (user.deleted mergedInto)
```

**Rollback:** restore the `tretu_auth` dump from the backup taken right before (imports only touch `tretu_auth`).

### 7.5 Switch the apps on, one at a time

Only after 7.2 and 7.4 are complete. Order: **tretu.de login → Saga → Play → Minecraft dashboard → Hollowmere → Tretu City**. For
each: backup, check `TRETU_AUTH_*` (7, above), install the env file, deploy its Tretu-only version per its doc, smoke,
sign in with a test Tretu-Konto and with an old local account (it must land on the old account through the
`legacy_ids` claim), then the next one.

Platform webhooks: every app in `TRETU_APPS_JSON` gets its events queued from the start; until its `webhook` is set
there they wait ("parked", up to 7 days). Once the app is live, make sure its `webhook` is in `TRETU_APPS_JSON` in
`/srv/tretu/.env.local`, `pm2 reload ecosystem.config.cjs --update-env`, then
`npm run smoke -- --webhook-test <app> --only webhook` (in `/srv/tretu`) must PASS (`204`); the waiting events are then
delivered. `npm run platform:outbox -- status` shows the backlog per app, `-- retry --app <app>` re-sends failed ones.

| App | Switch on | Check | Rollback |
|---|---|---|---|
| tretu.de | already deployed in 7.1: open it to members (end of the maintenance window) | "Mit Tretu-Konto anmelden" is the only button; an old member lands on their old account (same roles); `select count(*) from users where tretu_sub is not null` grows | previous release + `.env.local.before-tretu` (7.1 rollback); the old Discord accounts are still in the database |
| Saga | `/root/tretu-secrets/saga/.env` → `/srv/saga/.env`, deploy ([DEPLOY.md](https://github.com/robintrepte/adventure.ai/blob/main/DEPLOY.md)) | `smoke.sh --only saga`, Tretu login, a turn shows XP on tretu.de | `.env.before-tretu`, `pm2 reload saga --update-env` |
| Play | `play/.env` → `/srv/play/.env`, deploy ([DEPLOY.md](https://github.com/robintrepte/play/blob/main/DEPLOY.md)) | `smoke.sh --only play`, a finished game shows up in the profile | same for `play.tretu.de` (PM2 name and port: `PLAY_PM2_NAME`/`PLAY_PORT`, default `play.tretu.de` on 3041 = nginx upstream) |
| Minecraft dashboard | `mc-dashboard/.env` → `/srv/tretu-minecraft/dashboard/.env`, `npm ci --omit=dev && npm run migrate`, reload ([README](https://github.com/robintrepte/tretu-minecraft/blob/main/README.md)) | `smoke.sh --only mc`, Tretu login, "Minecraft verknüpfen" | same for `mc-dashboard` |
| Hollowmere | `hollowmere/server.env` → `server/.env`, `hollowmere/local.yml` → `server/nakama/local.yml`, `nakama.sh check`, reload ([HOSTING.md](https://github.com/robintrepte/hollowmere/blob/main/HOSTING.md) §5, §10) | `smoke.sh --only hollowmere`, Tretu sign-in in the web build | previous `local.yml`, reload |
| Tretu City | checkout in `/srv/city`, `city/.env` → `/srv/city/.env`, `npm ci && npm run build`, `pm2 start ecosystem.config.cjs` (`city.tretu.de` on 127.0.0.1:3060), nginx `deploy/nginx/city.tretu.de.conf` ([DEPLOY.md](https://github.com/robintrepte/city.tretu.de/blob/main/DEPLOY.md)) | `smoke.sh --only city`, Tretu login (new app: no old accounts), `--webhook-test city` | `pm2 stop city.tretu.de` (a new app, nothing to restore) |

Then the optional parts in `/srv/tretu/.env.local`: web push (VAPID keys are already set), Discord bot +
`TRETU_BADGE_DISCORD_ROLES_JSON`, `TS_QUERY_*` + `TRETU_BADGE_TS_GROUPS_JSON` → `pm2 reload ecosystem.config.cjs --update-env`.
Rollback: empty the mapping (the worker then removes the granted roles: an empty mapping means "no badge maps";
to switch off without removing, remove `DISCORD_BOT_TOKEN` instead).

### 7.6 Tretu City on an ecosystem that is already live

City (city.tretu.de) came after the go-live. On a running server, add it in this order (steps 1–6 for one host):

1. DNS: `city` → `$IP` / `$IP6` (step 1).
2. Secrets: run step 3 again with the same `--out` (and the same `--import`s): only City's values are added
   (`city/.env`, the `city` client in `tretu-auth/.env`, `CITY_DB_PASSWORD` in `postgres/roles.env`, City's secret
   and webhook in `TRETU_APPS_JSON`, City in `TRETU_STATUS_TARGETS_JSON`). Install the new `tretu-auth/.env` and
   reload auth (`pm2 reload ecosystem.config.cjs --update-env` in `/srv/tretu/auth`: clients are synced at boot), then
   the new `tretu-web/.env.local` (the same in `/srv/tretu`) so the platform accepts City's signed calls and /status
   lists City.
3. Database: step 4 with `--only city`. Do this before the next nightly backup: `pg-backup.sh` includes `city`.
4. Checkout `/srv/city`, certificate and nginx (step 6 for `city`), then the Tretu City row of 7.5.

Check: `smoke.sh --only city`, `https://city.tretu.de/api/health` answers `"app":"city"`, sign-in with a Tretu-Konto,
then `npm run smoke -- --webhook-test city --only webhook` (in `/srv/tretu`) PASSes, and time played in City shows up in
the profile stats on tretu.de.
**Rollback:** `pm2 stop city.tretu.de`, remove its nginx link; the extra client and database do no harm.

## 8. Verification

```bash
/srv/tretu/deploy/scripts/smoke.sh --env-file /srv/tretu/.env.local    # every row PASS
cd /srv/tretu && npm run smoke -- --webhook-test all --only webhook && npm run platform:outbox -- status
```

- https://tretu.de/status: every service "Läuft", "Stand" from the last minute; `certbot certificates`: every
  certificate valid for more than 60 days.
- With a test Tretu-Konto: sign in to every app, win a game in Play → badge + credits on tretu.de, invite a friend,
  notification + push, link Steam and TeamSpeak in Mein Konto / `/einstellungen#teamspeak`.
- Delete the test account in Mein Konto: it disappears from every app, its profile on tretu.de 404s, and Discord
  roles / TeamSpeak groups granted for badges are removed (worker log `platform.badge_sync.released`, jobs
  `badge.revoke.*` done).
- Webhook backlog (`platform:outbox -- status` or "Webhook-Zustellung" in the admin overview): no `PARKED`, `FAILED`
  or `EXPIRED` rows; otherwise fix the app's `webhook` and `npm run platform:outbox -- retry`.
- `systemctl list-timers 'tretu-pg-*'`, `pm2 ls` (no restarts piling up), `pm2 logs --lines 50` (no errors, no secrets).

## 9. Afterwards

- Raise the DNS TTL again.
- Later, once a rollback is out of the question: clean up the data of the removed app logins (kept by this release,
  nothing was dropped). tretu.de: `delete from auth_accounts where provider_id = 'discord';`
  ([DEPLOY.md](../DEPLOY.md#tretu-konto-login)); the other apps: their DEPLOY docs.
- Keep `/root/tretu-secrets` only as long as needed; the password manager holds `tretu-secrets.json`.
- GitHub Actions must be enabled for every repository (Settings → Actions → General) so CI runs on pull requests.
