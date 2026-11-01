# Deploying tretu.de

Production runs on the shared Hetzner server: PM2 behind nginx, one Postgres server with one database per app
(see [deploy/README.md](deploy/README.md) for the whole ecosystem and [docs/ecosystem/CONTRACT.md](docs/ecosystem/CONTRACT.md)).

| PM2 process | What | Port |
|---|---|---|
| `tretu-web` | Next.js (`next start`), hub + platform API | 3020 (127.0.0.1) |
| `tretu-orchestrator` | game-server jobs and monitoring (`npm run worker:orchestrator`) | – |
| `tretu-ts-rank` | TeamSpeak ranking worker (`npm run worker:ts-rank`) | – |
| `tretu-platform-worker` | platform webhooks, jobs, presence expiry, badge sync (`npm run platform:worker`, see [docs/ecosystem/PLATFORM.md](docs/ecosystem/PLATFORM.md)) | – |

The identity provider auth.tretu.de lives in [`auth/`](auth/) with its own PM2 processes (`tretu-auth`, `tretu-auth-events`) and its own [DEPLOY.md](auth/DEPLOY.md).

Requirements: Node 22, Postgres 16+, nginx, certbot, PM2 (`npm i -g pm2`).

## Regular deploy

```bash
cd /srv/tretu            # wherever the checkout lives
git pull
npm ci
npm run db:migrate       # applies pending migrations from drizzle/
npm run build
pm2 reload ecosystem.config.cjs --update-env
curl -fsS https://tretu.de/api/health
```

## Fresh install

1. Create the database and role (as the Postgres superuser):

   ```sql
   CREATE ROLE tretu_web LOGIN PASSWORD '…';
   CREATE DATABASE tretu_web OWNER tretu_web;
   ```

2. Clone and configure:

   ```bash
   git clone https://github.com/robintrepte/tretu.git /srv/tretu && cd /srv/tretu
   cp .env.example .env.local      # fill in DATABASE_URL, AUTH_SECRET, BETTER_AUTH_URL=https://tretu.de, Discord, …
   chmod 600 .env.local
   npm ci
   npm run db:migrate
   npm run build
   ```

3. Processes and web server:

   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save && pm2 startup         # start on boot (run the printed command)
   sudo cp deploy/nginx/tretu.de.conf /etc/nginx/sites-available/
   sudo ln -s /etc/nginx/sites-available/tretu.de.conf /etc/nginx/sites-enabled/
   sudo certbot --nginx -d tretu.de -d www.tretu.de
   sudo nginx -t && sudo systemctl reload nginx
   ```

4. Log in once with Discord (an ID from `DASHBOARD_ADMIN_DISCORD_IDS` becomes admin), then connect Hetzner under
   `/dashboard/setup`.

## Upgrade from the SQLite version (one-time, step by step)

This release replaces SQLite with Postgres and NextAuth with Better Auth. Plan ~15 minutes of downtime.

1. **Prepare Postgres** – create role and database `tretu_web` as in “Fresh install”, step 1.
2. **Stop everything that writes to SQLite** – `pm2 stop all` for the tretu processes (old names may differ, e.g.
   `pm2 ls`); a running orchestrator or rank worker would otherwise keep writing.
3. **Back up the SQLite file** – `cp local.sqlite ~/tretu-backup-$(date +%F).sqlite` (path = old `SQLITE_DATABASE_PATH`).
4. **Update the code** – `git pull && npm ci`.
5. **Update `.env.local`**
   - add `DATABASE_URL=postgres://tretu_web:…@localhost:5432/tretu_web`
   - rename `NEXTAUTH_URL` to `BETTER_AUTH_URL=https://tretu.de` (the old name still works as a fallback)
   - keep `AUTH_SECRET` unchanged (it also decrypts the stored Hetzner/Cloudflare tokens)
   - keep `SQLITE_DATABASE_PATH` until step 6 is done, then remove it; `AUTH_TRUST_HOST` is no longer used
   - Discord redirect URL stays `https://tretu.de/api/auth/callback/discord` – nothing to change at Discord.
6. **Copy the data** – this applies the migrations, copies every table with its IDs, resets the sequences, links every
   Discord user to a Better Auth account row and prints a row-count table:

   ```bash
   npm run db:migrate-sqlite -- --sqlite ./local.sqlite --dry-run   # optional rehearsal (rolls back)
   npm run db:migrate-sqlite -- --sqlite ./local.sqlite
   ```

   It must end with `Verification passed.` (exit code 0). The script is idempotent: if anything goes wrong, fix it and run
   it again.
7. **Build and start** – `npm run build`, then remove the old PM2 entries (`pm2 delete <old names>`), and
   `pm2 start ecosystem.config.cjs && pm2 save`. The orchestrator now runs as `tretu-orchestrator`
   (`ORCHESTRATOR_EMBEDDED=false` is set for `tretu-web` by the PM2 file).
8. **nginx** – install `deploy/nginx/tretu.de.conf` (or compare it with the existing vhost: 4 GB upload limit and
   unbuffered streaming for the dashboard), `sudo nginx -t && sudo systemctl reload nginx`.
9. **Check** – `curl https://tretu.de/api/health` → `{"status":"ok",…}`; log in with Discord; the dashboard team list shows
   the same members and roles as before.
10. **Keep the SQLite backup** for a while, then delete it (it contains personal data).

What users notice: **everyone is signed out once** (NextAuth JWT cookies are not valid for Better Auth). After signing
in again with Discord they land on their old account – same user ID, same roles – because step 6 linked their Discord ID.

Rollback: `git checkout` the previous release, restore `.env.local`, `npm ci && npm run build`, start the old processes;
the SQLite file was never modified.

## Enabling the Tretu-Konto login (later, once auth.tretu.de is live)

1. At auth.tretu.de register client `tretu-web` (confidential) with redirect URI
   `https://tretu.de/api/auth/oauth2/callback/tretu` and post-logout redirect URI `https://tretu.de/`.
2. Set `TRETU_AUTH_ISSUER=https://auth.tretu.de`, `TRETU_AUTH_CLIENT_ID=tretu-web`, `TRETU_AUTH_CLIENT_SECRET=…`;
   optionally `TRETU_DISCORD_FALLBACK=false` (hide direct Discord login) and `TRETU_ADMIN_FROM_ROLES=true`.
3. `pm2 reload ecosystem.config.cjs --update-env`. Existing users are matched by the `discord_id` claim.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (`tretu_web`) |
| `DATABASE_POOL_MAX` | no | connections per process (default 10) |
| `AUTH_SECRET` / `BETTER_AUTH_SECRET` | yes | signs sessions; `AUTH_SECRET` also encrypts dashboard secrets |
| `BETTER_AUTH_URL` | yes (prod) | public base URL, e.g. `https://tretu.de` (`NEXTAUTH_URL` is read as fallback) |
| `AUTH_DISCORD_CLIENT_ID`, `AUTH_DISCORD_CLIENT_SECRET` | yes | Discord login |
| `DASHBOARD_ADMIN_DISCORD_IDS` | no | Discord IDs that get the admin role on login |
| `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID`, `TRETU_AUTH_CLIENT_SECRET` | no | Tretu-Konto login (all three) |
| `TRETU_DISCORD_FALLBACK` | no | keep direct Discord login when Tretu-Konto is on (default `true`) |
| `TRETU_ADMIN_FROM_ROLES` | no | admin role from the `roles` claim (default `false`) |
| `NEXT_PUBLIC_UMAMI_SRC`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | no | Umami tag (build time; both required) |
| `ORCHESTRATOR_EMBEDDED` | no | run jobs inside Next.js (default `true`; PM2 sets `false`) |
| `SQLITE_DATABASE_PATH` | upgrade only | source file for `npm run db:migrate-sqlite` |

TeamSpeak (`TS_*`), Hetzner/Cloudflare/CurseForge fallbacks and the remaining variables are documented in `.env.example`.
