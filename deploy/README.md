# Tretu ecosystem – server setup

Everything runs on one Hetzner server: **PM2** processes behind **nginx** (TLS by certbot), one **Postgres** server with one
database and role per app. No Docker for hosting. The binding names, ports and endpoints are in
[docs/ecosystem/CONTRACT.md](../docs/ecosystem/CONTRACT.md); each app's own `DEPLOY.md` has its deploy steps.

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
sudo -u postgres psql
```

```sql
-- repeat for: tretu_web, tretu_auth, saga, play, mc_dashboard, nakama, umami
CREATE ROLE tretu_web LOGIN PASSWORD 'generate-a-long-random-password';
CREATE DATABASE tretu_web OWNER tretu_web;
REVOKE ALL ON DATABASE tretu_web FROM PUBLIC;
```

- Each app gets only its own `DATABASE_URL`, e.g. `postgres://tretu_web:…@localhost:5432/tretu_web`.
- Keep Postgres on localhost (`listen_addresses = 'localhost'`, the default) and use `scram-sha-256` in `pg_hba.conf`.
- Backups: a nightly `pg_dump -Fc` per database (cron or systemd timer) to a different machine or Hetzner Storage Box;
  keep e.g. 14 days. Test a restore with `pg_restore -d <db>_restore`.

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

Optional: a TCP monitor for `tretu.de:25565` (Minecraft) and the TeamSpeak port, a notification channel (e.g. Discord
webhook or email) and a public status page at `/status/tretu` showing all monitors. Certificate expiry alerts are built in.
