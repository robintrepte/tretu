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
npm run secrets                                  # fresh BETTER_AUTH_SECRET + one secret per OIDC client (prints only)

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

Migrations are additive. `0001_steam_login` adds `account.display_name` and the `openid_nonce` table, and moves
Steam IDs linked earlier through the admin API from `external_link` into `account` (provider `steam`), so they can
sign in with Steam.

`npm start` (PM2 `tretu-auth`) syncs `TRETU_OAUTH_CLIENTS_JSON` into the database at boot; run
`npm run clients:sync` by hand after changing it without a restart. Clients removed from the variable are
disabled, never deleted.

## Environment

All variables are documented in `.env.example`. The app refuses to start in production with an http issuer
(other than localhost), a short `BETTER_AUTH_SECRET` or a test-only variable (`STEAM_OPENID_ENDPOINT`). Production
minimum:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://tretu_auth:…@localhost:5432/tretu_auth` |
| `TRETU_AUTH_ISSUER` | `https://auth.tretu.de` (no trailing slash) |
| `BETTER_AUTH_SECRET` | from `npm run secrets` (or `openssl rand -base64 48`) — also encrypts the ID-token signing keys in the `jwks` table, so changing it invalidates them (a new key is created; apps re-fetch the JWKS) and signs everyone out |
| `TRETU_OAUTH_CLIENTS_JSON` | the five clients of contract §2, see README |
| `SES_REGION`, `EMAIL_FROM`, AWS credentials | `eu-central-1`, `Tretu-Konto <konto@tretu.de>` (verified SES identity) |
| `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET` | redirect URIs at the providers: `https://auth.tretu.de/api/auth/callback/discord` and `…/callback/google` |
| `APPLE_CLIENT_ID/SECRET` | optional; return URL `https://auth.tretu.de/api/auth/callback/apple` (Apple posts the answer there, `form_post`; the ID token is verified against `https://appleid.apple.com/auth/keys`) |
| `STEAM_LOGIN` | `true` turns on "Mit Steam anmelden" and "Steam verknüpfen". Steam OpenID needs no registration: return URL `https://auth.tretu.de/api/auth/steam/callback`, realm `https://auth.tretu.de/` (both from the issuer) |
| `STEAM_WEB_API_KEY` | optional (https://steamcommunity.com/dev/apikey, domain `auth.tretu.de`): persona name and avatar of new Steam accounts; without it they are called "Steam-Spieler" |
| `TRETU_MC_LINK_URL`, `TRETU_TS_LINK_URL` | optional; where "Verknüpfen" in Mein Konto sends people for Minecraft / TeamSpeak (defaults `https://mc.tretu.de/verknuepfen`, `https://tretu.de/einstellungen#teamspeak`) |
| `TRETU_APPS_JSON` | the same value as on tretu.de (every app's secret; `tretu-web` is needed for its TeamSpeak links) |
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

## Sign-in methods and two-factor accounts

- Discord, Google, Apple and Steam are each off until configured (see the table). The login page, the registration
  page and "Verknüpfte Konten" only show configured ones.
- Accounts with 2FA (all admins must have it) are asked for their code after **every** sign-in except a passkey:
  password, Discord, Google, Apple, Steam, magic link and email confirmation links. Until the code is entered there
  is no session at all (no app gets a code, `/konto` and the API are closed). "Diesem Gerät 30 Tage vertrauen"
  applies to all of them.
- The activity log records `2fa.challenge`, `2fa.failed`, `2fa.backup_code_used`, Steam/TeamSpeak/Minecraft
  `link.added` / `link.removed` and every sign-in with its method.

## Checks and CI

```bash
npm ci
npm run lint && npm run typecheck && npm test
NODE_OPTIONS=--max-old-space-size=3072 npm run build
npm run test:integration     # needs Postgres (postgres://postgres@localhost:5432, creates tretu_auth_test)
npm run test:e2e             # Playwright/Chromium, creates tretu_auth_test_e2e
```

The repository's GitHub Actions workflow runs exactly these commands with a `postgres:16` service container.
**GitHub Actions must be enabled for the repository** (it was disabled / out of minutes when this was written).
The tests use local ports 3121–3124 (integration: app, platform stub, provider mock, Steam stub) and 3131 + 3197
(e2e: app, Steam stub). Discord/Google/Apple are mocked by routing the test server's fetches with a preload
(`tests/support/intercept-fetch.mjs`) that only the test harness loads; Steam uses a local OpenID stub through
`STEAM_OPENID_ENDPOINT`, which the app refuses outside of a localhost http issuer.
