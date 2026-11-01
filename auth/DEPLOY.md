# Deploying auth.tretu.de

Hetzner server, PM2 behind nginx, one Postgres server (database `tretu_auth`). No Docker.

| | |
|---|---|
| Host | `auth.tretu.de` |
| PM2 processes | `tretu-auth` (Next.js, port **3021**), `tretu-auth-events` (event outbox worker) |
| Database | `tretu_auth` |
| nginx | `deploy/nginx/auth.tretu.de.conf` |
| Health | `GET https://auth.tretu.de/api/health` |

## First install

```bash
# 1. Database
sudo -u postgres createdb tretu_auth            # owner/role as for the other apps

# 2. Code (until this folder has its own repository it lives in tretu/auth)
git clone https://github.com/robintrepte/tretu.git /srv/tretu   # or reuse the existing checkout
cd /srv/tretu/auth
cp .env.example .env && $EDITOR .env             # see "Environment" below; chmod 600 .env

# 3. Install, migrate, sync the OIDC clients, build
npm ci
npm run db:migrate
npm run clients:sync
npm run build

# 4. Processes
pm2 start ecosystem.config.cjs && pm2 save

# 5. nginx + TLS
sudo cp deploy/nginx/auth.tretu.de.conf /etc/nginx/sites-available/
sudo ln -s ../sites-available/auth.tretu.de.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d auth.tretu.de && sudo nginx -t && sudo systemctl reload nginx

# 6. Check
curl -s https://auth.tretu.de/api/health
curl -s https://auth.tretu.de/.well-known/openid-configuration | head -c 300
```

## Every deploy

```bash
cd /srv/tretu/auth
git pull
npm ci
npm run db:migrate
npm run build
pm2 reload ecosystem.config.cjs --update-env
```

`npm start` (PM2 `tretu-auth`) syncs `TRETU_OAUTH_CLIENTS_JSON` into the database at boot; run
`npm run clients:sync` by hand after changing it without a restart. Clients removed from the variable are
disabled, never deleted.

## Environment

All variables are documented in `.env.example`. Production minimum:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://tretu_auth:…@localhost:5432/tretu_auth` |
| `TRETU_AUTH_ISSUER` | `https://auth.tretu.de` (no trailing slash) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 48` — also encrypts the ID-token signing keys in the `jwks` table, so changing it invalidates them (a new key is created; apps re-fetch the JWKS) and signs everyone out |
| `TRETU_OAUTH_CLIENTS_JSON` | the five clients of contract §2, see README |
| `SES_REGION`, `EMAIL_FROM`, AWS credentials | `eu-central-1`, `Tretu-Konto <konto@tretu.de>` (verified SES identity) |
| `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | redirect URIs at the providers: `https://auth.tretu.de/api/auth/callback/discord` and `…/callback/google` |
| `APPLE_CLIENT_ID/SECRET` | optional; return URL `https://auth.tretu.de/api/auth/callback/apple` |
| `TRETU_APPS_JSON` | the same value as on tretu.de (every app's secret) |
| `TRETU_PLATFORM_URL`, `TRETU_APP_SECRET` | `https://tretu.de`, the secret of app `auth` in `TRETU_APPS_JSON` |
| `TURNSTILE_SITE_KEY/SECRET_KEY` | optional bot check on registration |
| `NEXT_PUBLIC_UMAMI_SRC/WEBSITE_ID` | optional, set **before** `npm run build` |

Without `TRETU_PLATFORM_URL`/`TRETU_APP_SECRET` the event worker idles and events stay in `event_outbox`;
once set, it delivers the backlog in order.

## Roles

Global roles (`roles` claim) are granted on the server:

```bash
npm run admin -- grant robin admin      # admins must turn on 2FA before any app accepts their sign-in
npm run admin -- roles robin
npm run admin -- revoke robin admin
```

## Legacy import (once, before switching the apps to Tretu login)

Read-only connections to the old databases (a read-only Postgres role is recommended):

```bash
export LEGACY_SAGA_DATABASE_URL=postgres://…/saga
export LEGACY_PLAY_DATABASE_URL=postgres://…/play
export LEGACY_TRETU_DATABASE_URL=postgres://…/tretu_web     # after tretu moved to Postgres
export LEGACY_NAKAMA_DATABASE_URL=postgres://…/nakama

npm run import:legacy -- --dry-run      # report on stdout + reports/legacy-import-dry-run-*.json
npm run import:legacy                   # writes; safe to re-run (already imported accounts are skipped)
```

Check the dry-run report (merges, username and email conflicts) before the real run. Imported accounts are
announced to the platform with `user.created` (`--no-events` to skip). Users can claim accounts that were not
merged for `LEGACY_CLAIM_DAYS` (90) days under "Mein Konto → Alte Konten verbinden".

## Backups and keys

- Back up the `tretu_auth` database with the other databases. The `jwks` table holds the signing keys
  (private keys encrypted with `BETTER_AUTH_SECRET`): keep the secret in the password manager.
- The `event_outbox` keeps delivered events for 30 days, undelivered ones are given up after 72 hours.
