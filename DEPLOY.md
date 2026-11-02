# Deploying tretu.de

Production runs on the shared Hetzner server: PM2 behind nginx, one Postgres server with one database per app
(see [deploy/README.md](deploy/README.md) for the whole ecosystem and [docs/ecosystem/CONTRACT.md](docs/ecosystem/CONTRACT.md)).

| PM2 process | What | Port |
|---|---|---|
| `tretu-web` | Next.js (`next start -H 127.0.0.1 -p 3020`: `next start` ignores `HOSTNAME`, so the bind is explicit), hub + platform API | 3020 (127.0.0.1) |
| `tretu-orchestrator` | game-server jobs and monitoring (`npm run worker:orchestrator`) | – |
| `tretu-ts-rank` | TeamSpeak ranking worker (`npm run worker:ts-rank`) | – |
| `tretu-platform-worker` | platform webhooks, jobs, presence expiry, badge sync (`npm run platform:worker`, see [docs/ecosystem/PLATFORM.md](docs/ecosystem/PLATFORM.md)) and the checks behind [/status](#status-page-tretudestatus) | – |

First go-live of the whole ecosystem: [deploy/GO-LIVE.md](deploy/GO-LIVE.md). The env template is
[deploy/env/tretu-web.env.local.example](deploy/env/tretu-web.env.local.example) (`deploy/scripts/generate-secrets.mjs`
fills it in consistently with every other app).

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
curl -fsS https://tretu.de/api/health       # {"status":"ok",…,"checks":{"db":"ok","migrations":"ok","worker":"ok"}}
```

`/api/health` answers `503` when the database is unreachable or a migration is missing (`checks.migrations:
"pending"`: run `npm run db:migrate`). `checks.worker` is `stale` when platform webhooks/jobs are overdue by more than
10 minutes (the `tretu-platform-worker` is not running); it does not fail the check (a stopped worker also shows up
on [/status](#status-page-tretudestatus) as "Die Prüfungen laufen gerade nicht"). Migration
`0002_badge_grants_steam_teamspeak` (additive) adds the badge-grant columns, `platform_ts_links.link_error` and
`platform_users.steam_id`; migration `0003_status_page` (additive) adds the three `platform_status_*` tables.

**Production safety:** `next start` refuses to start (logs `[startup] …` and exits 1, so PM2 shows it) without an
`AUTH_SECRET` (or `BETTER_AUTH_SECRET`) of at least 32 characters, and without `TRETU_AUTH_ISSUER`,
`TRETU_AUTH_CLIENT_ID` and `TRETU_AUTH_CLIENT_SECRET`: the Tretu-Konto is the only sign-in (see
[Tretu-Konto login](#tretu-konto-login)). Security headers (CSP, HSTS, COOP, …) come from `next.config.ts`; nginx adds per-IP rate limits
for `/api/auth/` and `/api/` (not for the signed `/api/v1/`, which the app limits per calling app). Logs are JSON
lines without secrets (credential/email keys are redacted, platform errors log route patterns, not subs).

**Platform worker restarts:** `pm2 reload` sends SIGTERM; the worker finishes the job in progress, hands the
other claimed jobs back and exits within the 15 s `kill_timeout`. A crashed worker's claimed work is retried once
its lock expires (≤ 2 min). Failing passes (e.g. Postgres restarting) back off up to 60 s instead of exiting.
Without `DATABASE_URL` it exits 78 and PM2 leaves it stopped.

## Status page (tretu.de/status)

Public page `https://tretu.de/status` (German, English via the language switcher, linked in the footer) and the same
data as JSON at `GET /api/status` (public, `Cache-Control: max-age=30`). One row per service with its state
(läuft / gestört / ausgefallen / keine Daten), last response time and uptime bars for the last 24 hours and 90 days.
There is no separate status service: no extra PM2 process, nginx site or certificate.

- **Checks** run in `tretu-platform-worker` (`src/lib/status/`): every 60 s it requests each service's `/api/health`
  in parallel (5 s timeout, user agent `TretuStatus/1.0`). `200` + `"status":"ok"` = **läuft**; an answer that is not
  healthy (`"status":"error"`, a 2xx without health JSON, slower than 3 s) = **gestört**; no answer, no connection or an
  error page such as nginx's `502` = **ausgefallen**.
- **Minecraft server** (row "Minecraft-Server", `TRETU_STATUS_MINECRAFT`, default `mc.tretu.de:25565`): the
  standard Server List Ping (handshake with protocol -1, status request; works with every version since 1.7),
  5 s timeout. An answer = **läuft** with "players online / slots", none = **ausgefallen**.
- **TeamSpeak server** (row "TeamSpeak"): with `TS_QUERY_*` set, one ServerQuery login per minute through the
  client in `src/lib/teamspeak` (`clientlist`, users online; keep the query IP whitelisted as for the rank worker);
  otherwise, with `TRETU_STATUS_TEAMSPEAK=host:port`, a TCP connect (voice is UDP: use a TCP port such as the file
  transfer port 30033). Neither set: no row.
- **Certificates:** once an hour the worker reads the TLS certificate of every HTTPS target and of
  `TRETU_STATUS_CERT_HOSTS` and posts to the Discord webhook 14 and 3 days before it expires (each threshold once per
  certificate; a renewed certificate starts over). Only with `TRETU_STATUS_DISCORD_WEBHOOK_URL` set. Stored in
  `platform_status_certs`.
- **Storage** (migration `0003_status_page`): `platform_status_checks` (one row per check, kept 7 days),
  `platform_status_rollups` (counts per hour and per day in Europe/Berlin, updated with every check, kept 90 days),
  `platform_status_services` (current state per service incl. players / users online, used for alerts),
  `platform_status_certs` (certificate expiry and warnings sent). The worker's 10-minute maintenance pass
  prunes old rows. About 8 600 rows per day for six services.
- **The page reads only the database** (cached 30 s per process) and never calls the services. When the worker stops,
  it keeps showing the last results with "Stand: …" and a note that the checks are not running; `deploy/scripts/smoke.sh`
  fails its "status page" row in that case.
- **Alerts (optional):** with `TRETU_STATUS_DISCORD_WEBHOOK_URL` set, the worker posts a short German message to that
  Discord channel when a service is down or disturbed for 2 consecutive checks ("Saga (saga.tretu.de) ist ausgefallen –
  keine Antwort innerhalb von 5 Sekunden.") and when it recovers ("… läuft wieder (nach 12 Min.)"). Nothing else is
  posted: a single failed check or a service that stays down never repeats the message.
- **Maintenance note (optional):** `TRETU_STATUS_NOTICE="Wartung am Sonntag ab 22 Uhr"` shows a banner on the page (and
  in `/api/status`); remove it and reload to hide it.

| Variable | Default | Purpose |
|---|---|---|
| `TRETU_STATUS_TARGETS_JSON` | the contract's six hosts | JSON array `[{"id":"saga","url":"https://saga.tretu.de/api/health"}, …]`, optional `name`/`host` per entry; `[]` switches checks and list off. Ids `tretu-web`, `auth`, `saga`, `play`, `hollowmere`, `mc-dashboard` get their names ("Website", "Tretu-Konto", …) automatically. Read by the worker and the page: set it in `.env.local` and reload both. |
| `TRETU_STATUS_MINECRAFT` | `mc.tretu.de:25565` | Minecraft server for the Server List Ping (`host[:port]`), `off` = no row |
| `TRETU_STATUS_TEAMSPEAK` | – | `host:port` for a TCP check of TeamSpeak when `TS_QUERY_*` is not set |
| `TRETU_STATUS_CERT_HOSTS` | – | extra hosts (`host[:port]`, comma-separated) whose certificates are watched, e.g. `map.tretu.de,mcp.hollowmere.tretu.de` |
| `TRETU_STATUS_DISCORD_WEBHOOK_URL` | – | Discord webhook (`https://discord.com/api/webhooks/<id>/<token>`) for outage, recovery and certificate messages |
| `TRETU_STATUS_NOTICE` | – | plain-text banner on `/status` |

Changing any of them: edit `.env.local`, then `pm2 reload ecosystem.config.cjs --update-env`. A service that is removed
from the list disappears from the page; its stored history ages out after 90 days.

## Fresh install

1. Create the database and role (as the Postgres superuser):

   ```sql
   CREATE ROLE tretu_web LOGIN PASSWORD '…';
   CREATE DATABASE tretu_web OWNER tretu_web;
   ```

2. Clone and configure:

   ```bash
   git clone https://github.com/robintrepte/tretu.git /srv/tretu && cd /srv/tretu
   cp .env.example .env.local      # fill in DATABASE_URL, AUTH_SECRET, BETTER_AUTH_URL=https://tretu.de, TRETU_AUTH_*, …
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

4. Sign in once with the Tretu-Konto (a Tretu-Konto with the `admin` role, or one whose linked Discord ID is in
   `DASHBOARD_ADMIN_DISCORD_IDS`, becomes admin), then connect Hetzner under `/dashboard/setup`.

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
   - add `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID`, `TRETU_AUTH_CLIENT_SECRET` (required, see
     [Tretu-Konto login](#tretu-konto-login)); `AUTH_DISCORD_CLIENT_*` are no longer used
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
9. **Check** – `curl https://tretu.de/api/health` → `{"status":"ok",…}`; sign in with the Tretu-Konto; the dashboard team
   list shows the same members and roles as before.
10. **Keep the SQLite backup** for a while, then delete it (it contains personal data).

What users notice: **everyone is signed out once** (NextAuth JWT cookies are not valid for Better Auth). After signing
in again with the Tretu-Konto they land on their old account – same user ID, same roles – through the `legacy_ids`
claim (auth's legacy import reads this database) or their Discord ID.

Rollback: `git checkout` the previous release, restore `.env.local`, `npm ci && npm run build`, start the old processes;
the SQLite file was never modified.

## Tretu-Konto login

tretu.de signs people in **only** with the Tretu-Konto ("Mit Tretu-Konto anmelden", OIDC against auth.tretu.de). The
direct Discord login is gone; there is no fallback.

**Deploy order.** auth.tretu.de must be live and its legacy import (and the hand merges) done **before** this version
of tretu.de goes live ([deploy/GO-LIVE.md](deploy/GO-LIVE.md), [auth/DEPLOY.md](auth/DEPLOY.md#legacy-import-once-before-switching-the-apps-to-tretu-login)):
the import is what lets existing members land on their old account.

1. At auth.tretu.de, client `tretu-web` (confidential) with redirect URI `https://tretu.de/api/auth/oauth2/callback/tretu`
   and post-logout redirect URI `https://tretu.de/` (`TRETU_OAUTH_CLIENTS_JSON`, generated by
   `deploy/scripts/generate-secrets.mjs`).
2. `TRETU_AUTH_ISSUER=https://auth.tretu.de`, `TRETU_AUTH_CLIENT_ID=tretu-web`, `TRETU_AUTH_CLIENT_SECRET=…` in
   `.env.local`. **Required:** in production `next start` exits with `[startup] TRETU_AUTH_… must be set` when one is
   missing; in development `/login` shows "Anmeldung nicht konfiguriert" with the missing names.
   `TRETU_ADMIN_FROM_ROLES` is on by default (see "Central Tretu admin" below).
3. `pm2 reload ecosystem.config.cjs --update-env`.

**Finding the existing local user** (first Tretu sign-in, `matchTretuLogin` in `src/lib/auth/sync.ts`), in this order:

1. the user already linked to the `sub` (`auth_accounts` row of provider `tretu`, or `users.tretu_sub`);
2. the user whose id is `legacy_ids["tretu-web"]` (auth's legacy import of this database);
3. the user with the `discord_id` claim's Discord ID (`users.discord_id`);
4. the user with the same email, verified on both sides;
5. otherwise a new user.

Steps 2–4 never take a user that is already linked to another Tretu-Konto; Better Auth's own email linking is off. A new
user whose email another local user already holds gets a placeholder address (`tretu-<sub>@users.tretu.invalid`)
instead of a duplicate. `tretu_sub` is stored on the match. `DASHBOARD_ADMIN_DISCORD_IDS` keeps working through the
`discord_id` claim (the Discord account linked in "Mein Konto").

**Old Discord sign-ins.** The `auth_accounts` rows of provider `discord` from the direct Discord login stay in the
database (nothing destructive in this release; they let a rollback to the previous release sign people in as before)
but are no longer read. Sessions that were started with Discord before the switch stay valid until they expire (30
days); to have everyone sign in with the Tretu-Konto right away, end them at go-live:
`delete from auth_sessions where user_id in (select id from users where tretu_sub is null);`.
Later cleanup, once a rollback is out of the question: `delete from auth_accounts where provider_id = 'discord';`
(`users.discord_id` stays: Discord badge roles, `DASHBOARD_ADMIN_DISCORD_IDS` and step 3 above use it).

## Central Tretu admin

`/dashboard/admin` is the one admin for everything that spans the ecosystem (each app keeps its own admin for
app-specific things): **Übersicht** (Tretu-Konten KPIs, sign-ups/sign-ins, active users per app, credit flow, badges,
service status, links to each app's admin), **Konten** (search over every identifier, detail page with profile, roles,
2FA, sign-in methods and game links, passkeys, sessions, lock/unlock, old app accounts, merge, apps used with deep links
into each app's admin, level/XP, badges, stats, friends, wallet, auth and hub audit), **Altkonten** (unmerged old
accounts with one-click merge preview), **Wallet** (circulation, flow per day, top holders, per-user history, manual
adjustment, reversing a transaction), **Abzeichen** (catalog with counts, holders, grant/revoke, Discord/TeamSpeak sync
state and resync) and **Protokoll** (every admin action, filterable).

**Who gets in.** Only the Tretu `admin` role (auth.tretu.de requires 2FA for it): a Tretu-Konto whose `roles` claim
contains `admin` *and* the local `admin` role. With `TRETU_ADMIN_FROM_ROLES` not `false` (default) the claim grants the
local admin role on every Tretu login and on auth's `user.updated`; the grant is stored as `user_roles.source = 'tretu'`
and removed again when the claim disappears. Roles granted here (team panel, `DASHBOARD_ADMIN_DISCORD_IDS`) are
`source = 'local'` and never removed automatically. `operator` / `manager` keep their game-server permissions only.
Admin rows that existed before migration `0004_central_admin` count as local.

**Locked Tretu-Konten.** auth's `user.updated` with `locked: true` (or a lock done in the hub) ends the user's tretu.de
sessions and refuses new ones until unlocked or `lockedUntil` has passed.

**How it talks to auth.** Every account read and mutation goes to auth.tretu.de's admin API, signed as `tretu-web`
(`TRETU_AUTH_ISSUER` + `TRETU_APP_SECRET`, which auth must know as `TRETU_APPS_JSON["tretu-web"].secret`; auth answers
any other app with `403 forbidden_app`), 5 s timeout; when auth is down or not configured the pages show a friendly
notice and the platform data still works. Reads carry `?actorSub=` and changes `actorSub` in the body: auth only serves
an admin who holds `admin`, is not locked and has **2FA turned on** (`actor_two_factor_required`; the overview checks
this first and links to "Mein Konto"). Every mutation needs a reason (3–500 characters), is confirmed in a dialog,
rate-limited per admin (`TRETU_ADMIN_RATE_LIMIT_*`) and recorded in `platform_admin_audit` (failed attempts too, and
changes auth answered with `changed: false` as `outcome: "noop"`; auth itself records only real changes, as `admin.*`
in the account's activity log). auth's refusals (`self_action`, `last_admin`, `last_sign_in_method`, `no_email`,
`merge_refused`, …) each have their own message. The service panel of the overview reads the same status tables as
[/status](#status-page-tretudestatus). Mutations are Next.js server
actions (same-origin only). Admin pages are rendered per request (`Cache-Control: no-store`) and sent with
`X-Robots-Tag: noindex` (`robots.txt` disallows `/dashboard`).

**Data it writes on tretu.de.** Wallet adjustments are `adjust` bookings of app `tretu-web` with the idempotency key
`admin:<uuid>` (one per opened form, so a double submit books once); a reversal books the opposite amount once per
transaction (key `reverse:<id>`, a spend comes back as `refund`). A manual badge grant behaves like an earned badge;
a revoke removes the badge and its XP (level follows), takes back the Discord role / TeamSpeak group and stops the rules
from awarding it again (`platform_badge_revocations`; a manual grant lifts it); credits stay. Resync re-grants every
mapped badge (forced sync jobs). Migration `0004_central_admin` (additive) adds `platform_admin_audit`,
`platform_badge_revocations`, `user_roles.source` and `users.tretu_roles / tretu_locked_at / tretu_locked_until`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (`tretu_web`) |
| `DATABASE_POOL_MAX` | no | connections per process (default 10) |
| `AUTH_SECRET` / `BETTER_AUTH_SECRET` | yes (32+ chars in production) | signs sessions; `AUTH_SECRET` also encrypts dashboard secrets |
| `BETTER_AUTH_URL` | yes (prod) | public base URL, e.g. `https://tretu.de` (`NEXTAUTH_URL` is read as fallback) |
| `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID`, `TRETU_AUTH_CLIENT_SECRET` | **yes** | Tretu-Konto login, the only sign-in (production does not start without all three) |
| `DASHBOARD_ADMIN_DISCORD_IDS` | no | Discord IDs that get the admin role on login (through the Tretu-Konto's `discord_id` claim) |
| `TRETU_ADMIN_FROM_ROLES` | no | the Tretu `admin` role grants the local admin role and the central admin (default `true`; `false` = only local grants) |
| `TRETU_ADMIN_RATE_LIMIT_PER_MIN`, `TRETU_ADMIN_RATE_LIMIT_BURST` | no | central admin mutations per admin (default 30/min, burst 10) |
| `TRETU_STATUS_*` (targets, Minecraft, TeamSpeak, certificate hosts, Discord webhook, notice) | no | status page, see [Status page](#status-page-tretudestatus) |
| `ORCHESTRATOR_EMBEDDED` | no | run jobs inside Next.js (default `true`; PM2 sets `false`) |
| `SQLITE_DATABASE_PATH` | upgrade only | source file for `npm run db:migrate-sqlite` |
| `AUTH_RATE_LIMIT` | tests only | `off` disables Better Auth's per-IP limits (e2e) |

Platform variables (`TRETU_APPS_JSON`, `TRETU_APP_*`, `WEB_PUSH_*`, Discord/TeamSpeak badge sync, economy) are in
[docs/ecosystem/PLATFORM.md](docs/ecosystem/PLATFORM.md#env-vars).

## Checks and CI

```bash
npm run lint && npm run typecheck
npm test                      # postgres://postgres@localhost:5432/tretu_web_test (TEST_DATABASE_URL)
npm run test:platform         # tretu_platform_test (created automatically)
NODE_OPTIONS=--max-old-space-size=3072 npm run build
npm run test:e2e              # Playwright against next start (needs the build; database tretu_web_test_e2e)
npm run test:deploy           # deploy/scripts (local Postgres with throwaway names, nginx for check-nginx.sh)
npm --prefix auth ci && npm --prefix auth run build
npm run test:e2e:admin-real   # central admin against the REAL auth (see below)
```

**Central admin against the real auth (`npm run test:e2e:admin-real`).** `npm run test:e2e` uses a stand-in for auth's
admin API (`tests/helpers/mock-auth-admin.ts`, kept identical to `auth/app/api/v1/admin/**`); this suite runs the real
thing. `tests/e2e-real/serve.ts` resets the databases `tretu_auth_test_admin_real` and `tretu_web_test_admin_real`
(override with `E2E_REAL_AUTH_DATABASE_URL` / `E2E_REAL_HUB_DATABASE_URL`), migrates both, runs `npm run clients:sync`
in `auth/` with a confidential `tretu-web` client, then starts auth on `http://localhost:3141` (with `TRETU_APPS_JSON`
holding the tretu-web secret, event delivery to the hub, and `npm run worker:events`) and the hub on
`http://127.0.0.1:3142` (Tretu-Konto provider on that auth, `TRETU_ADMIN_FROM_ROLES=true`, `npm run platform:worker`
checking both apps for the status panel). Plain http works because auth accepts an http issuer on loopback hosts; the
two hosts keep the cookies apart. Ports: `E2E_REAL_AUTH_PORT`, `E2E_REAL_HUB_PORT`. The scenario
(`tests/e2e-real/admin-real.spec.ts`): an admin made with `npm run admin -- grant` and TOTP (codes generated in the
test) signs in through auth, searches and opens a normal account, locks it (its auth and hub sessions end, auth's login
shows the lock), unlocks it, ends its sessions, corrects its wallet, grants a badge, previews and merges an imported old
account into it, and finds all of it in the hub's audit log and in auth's activity log; a second admin without 2FA (role
from the CLI, delivered as `user.updated`) gets "Aktiviere 2FA in Mein Konto, um die Verwaltung zu nutzen". Takes about
a minute (TOTP codes are single-use, so the sign-in may wait for the next 30 s step).

`.github/workflows/ci.yml` runs exactly these (`auth/`'s suite and the real hub + auth admin e2e as separate jobs) with a Postgres 16 service on every pull request
and push to `main`. **GitHub Actions must be enabled** for the repository (Settings → Actions → General).

TeamSpeak (`TS_*`), Hetzner/Cloudflare/CurseForge fallbacks and the remaining variables are documented in `.env.example`.

## Smoke test

`npm run smoke` runs `deploy/scripts/smoke.sh` with this checkout's `.env.local`, so the signed platform ping uses
`TRETU_APP_ID` / `TRETU_APP_SECRET` from there (`SMOKE_ENV_FILE` points it at another file). Options pass through:
`npm run smoke -- --only web,auth`.
