# Tretu platform (tretu.de)

Server side of the ecosystem contract (`docs/ecosystem/CONTRACT.md` §4 receiving + webhooks, all of §5):
shared events, XP/levels/badges, the Tretu-Credits wallet, friends, presence, invites, notifications,
web push and Discord/TeamSpeak badge sync. Everything is **off unless configured**: without
`DATABASE_URL` the pages show "Gerade nicht verfügbar" and the API answers `503`; without
`TRETU_APPS_JSON` every signed call is `401`; Discord, TeamSpeak and push each need their own env.

Code: `src/lib/platform/**` (logic), `src/app/api/v1/**` (API), `src/app/(platform)/**` (pages),
`src/db/platform-schema.ts` (tables), `messages/platform/{de,en}.json` (UI texts),
`scripts/platform-*.ts`, `tests/platform/*.spec.ts`, `public/platform-sw.js`.

## API

All `/api/v1/*` routes except `/api/v1/me/**` are **signed** (contract §3: `x-tretu-app`,
`x-tretu-timestamp`, `x-tretu-signature`; ±300 s window, constant-time compare, secrets from
`TRETU_APPS_JSON`). Errors: `{"error":"<code>","message"?}`. Per-app rate limit (in-process token
bucket): `TRETU_PLATFORM_RATE_LIMIT_PER_MIN` (default 1200) with burst `TRETU_PLATFORM_RATE_LIMIT_BURST`
(300) → `429 {"error":"rate_limited"}` + `Retry-After`. Bodies over 1 MB → `413`.

| Method | Path | Notes |
|---|---|---|
| POST | `/events` | one envelope or `{events:[…]}` (≤100) → `202 {accepted,duplicates}` |
| GET | `/users/{sub}` | profile, level, badges, stats, `profileUrl`; `?locale=en` |
| GET | `/badges` | catalog; `?locale=en` |
| GET | `/wallet/{sub}` | creates wallet + welcome bonus on first access |
| GET/POST | `/wallet/{sub}/transactions` | history (`limit`, `before`) / booking (`402 insufficient_funds`) |
| POST | `/wallet/{sub}/daily` | daily top-up, once per Europe/Berlin day |
| GET | `/users/{sub}/friends` | friends (+presence), incoming, outgoing |
| POST | `/friends/requests`, `/friends/requests/{id}/accept`, `/…/decline`, `/friends/remove` | |
| PUT/DELETE | `/presence/{sub}` | `204`; expires 120 s after the last PUT; one entry per (sub, app) |
| GET | `/presence?subs=a,b` | best entry per sub ("playing" beats "online", then newest) |
| POST | `/invites` | `403 not_friends` unless friends; creates an `invite` notification |
| POST | `/notifications` | → `{id}` |
| GET | `/users/{sub}/notifications`, `/…/count` · POST `/…/read` | |

Browser routes for the pages (session via `getPlatformUser()`, same-origin check, 60 req/min per user):
`GET /me`, `GET|POST /me/friends`, `POST /me/friends/requests/{id}/accept|decline`, `POST /me/friends/remove`,
`POST /me/invites`, `GET /me/notifications`, `POST /me/notifications/read`, `GET|POST|DELETE /me/push`,
`GET|PUT /me/settings`, `GET /me/wallet`, `POST /me/wallet/daily`, `GET|POST|DELETE /me/teamspeak`.

Pages: `/u/[username]` (also accepts a sub), `/freunde`, `/benachrichtigungen`, `/wallet`, `/abzeichen`,
`/einstellungen`. German default, English via the `NEXT_LOCALE` cookie.

## Processing rules (events)

- Validation (zod): envelope per contract; `app` must equal `x-tretu-app` (`400 app_mismatch`); known types
  have strict `data`; `stat.increment`/`achievement.unlocked` keys must start with `<app>.`
  (**mc-dashboard may also use `minecraft.`**, the contract's own stat key); `user.*` only from `auth`.
  Unknown types are stored and award nothing. One invalid event rejects the whole request (nothing stored).
- Idempotency: `platform_events.id` is the primary key; duplicates are counted and ignored. Each event is
  stored **and** processed in one transaction (with deadlock retry), so a failure rolls back and the
  sender's retry works.
- `sub: null` → stored (`status=stored`), no awards. Erased subs → stored anonymised (`ignored`).
- Per user, processing is serialised by locking `platform_user_progress` (`FOR UPDATE`).
- `game.finished` → `<app>.games.played`, `<app>.<game>.played`, on win `<app>.games.won`, `<app>.<game>.won`.
- First event from an app (not `auth`/`tretu-web`) → `tretu.apps.used` +1. `tretu.friends` = current friend count.
- `achievement.unlocked` → stored once per key, `<prefix>.achievements` +1, XP.
- XP (app XP capped per user, app and Europe/Berlin day; badge XP uncapped): game played 10, win +15,
  `completed` +40, achievement 25; stats: `saga.turns` 2/turn, `saga.worlds.created` 10,
  `saga.characters.created` 10, `hollowmere.creatures.befriended` 15, `hollowmere.days.played` 10,
  `minecraft.playtime.minutes` 1 XP per 5 min (computed on the running total, no rounding loss).
- Level curve: level L → L+1 costs 100·L XP; total for level L = 50·L·(L−1) (L2 100, L5 1000, L10 4500).
  A higher level emits `level.up {level}` and a `level` notification.
- Badges (`src/lib/platform/badges.ts`) are re-evaluated after every change and awarded exactly once
  (primary key sub+badge): one-time XP + credits (wallet key `badge:<key>:<sub>`), a `badge` notification,
  `badge.earned {badge,title,xp,credits}`, Discord/TS sync jobs.
- `user.created/updated` (from auth) upsert the directory (`platform_users`); older `occurredAt` than the
  last applied one is ignored; a username taken by a stale row moves to the new owner. `user.updated` is
  forwarded to all subscribed apps (except auth). A new Discord link queues the Discord sync.
- `user.deleted` erases everything of that sub (directory, stats, progress, badges, achievements, apps,
  counters, friendships + requests, presence, notifications incl. those the user caused, settings, push
  devices, TS link, sync state, jobs, queued webhooks), anonymises stored events, and anonymises the
  wallet (account → `erased:<uuid>`, transactions lose sub/reason/ref/key) so the ledger still balances.
  A tombstone (`platform_deleted_users`, only the sub) stops late events from recreating data. Then
  `user.deleted` is forwarded. Discord roles / TS groups already granted are not revoked.
- Unknown subs: events create a stub directory row and queue a `user.fetch` job; API calls for an unknown
  sub fetch it inline from `GET ${TRETU_AUTH_ISSUER}/api/v1/users/{sub}` (signed as `tretu-web` with
  `TRETU_APP_SECRET`, falling back to `TRETU_APPS_JSON["tretu-web"].secret`, 5 s timeout). Read-only
  routes answer `404 user_not_found` instead of creating stubs.

## Economy (`src/lib/platform/economy.ts`, integer env overrides)

| Setting | Default | Env | Notes |
|---|---|---|---|
| Welcome bonus | 500 TC | `TRETU_ECONOMY_WELCOME_BONUS` | Saga `CREDITS_STARTING`; booked when the wallet is created; creation day counts as topped up |
| Daily top-up | to 300 TC | `TRETU_ECONOMY_DAILY_TOPUP` | Saga `CREDITS_DAILY_TOPUP`: once per Europe/Berlin day across all apps, tops **up to** the value, higher balances unchanged (day consumed, granted 0); 0 = off |
| Game-win reward | 5 TC | `TRETU_ECONOMY_GAME_WIN_REWARD` | per `game.finished` win |
| Game-win daily cap | 25 TC | `TRETU_ECONOMY_GAME_WIN_DAILY_CAP` | per user and Berlin day, all apps |
| XP cap per app/day | 500 | `TRETU_XP_DAILY_CAP_PER_APP` | badge XP not capped |
| XP game played/won/completed/achievement | 10/15/40/25 | `TRETU_XP_GAME_PLAYED`, `…_WON`, `…_COMPLETED`, `TRETU_XP_ACHIEVEMENT` | |
| Early-supporter cutoff | 2027-03-31 | `TRETU_EARLY_SUPPORTER_UNTIL` | ISO date or datetime |

Wallet: double-entry ledger. Every transaction has two entries summing to 0 (user account and a system
counter-account: `system:welcome`, `system:daily`, `system:rewards`, `system:purchases`, `system:spend`
(spend + refund), `system:grants`, `system:migration`, `system:adjust`), so all balances sum to 0.
Each entry stores `balanceAfter`. The user account row is locked before the idempotency and balance
checks (concurrent spends cannot overdraw; tested with 50 in parallel) and a CHECK keeps user balances
≥ 0. Idempotency keys are unique **per calling app**; the same key for another sub → `409
idempotency_conflict`; a duplicate returns the original `transactionId` and its `balanceAfter`.
Sign rules: `spend` must be negative, `adjust` may be negative, all other kinds positive. Internal kinds:
`welcome`, `daily`, `reward`. Every booking emits `wallet.changed {balance,delta,kind}`.

## Badges

| Key | Title (de / en) | Rule | Icon | XP | TC |
|---|---|---|---|---|---|
| `play.first-win` | Erster Sieg / First Victory | `play.games.won` ≥ 1 | Trophy | 50 | 20 |
| `play.regular` | Stammgast / Regular | `play.games.played` ≥ 50 | Gamepad2 | 100 | 25 |
| `saga.worldbuilder` | Weltenbauer / Worldbuilder | `saga.worlds.created` ≥ 1 | Globe | 50 | 10 |
| `saga.storyteller` | Geschichtenerzähler / Storyteller | `saga.turns` ≥ 100 | ScrollText | 75 | 20 |
| `saga.master-storyteller` | Meistererzähler / Master Storyteller | `saga.turns` ≥ 1000 | Feather | 200 | 50 |
| `saga.campaign-finisher` | Kampagne vollendet / Campaign Finisher | `saga.campaign.played` ≥ 1 | BookCheck | 100 | 30 |
| `saga.campaign-veteran` | Sagenheld / Hero of Legends | `saga.campaign.played` ≥ 5 | Swords | 250 | 60 |
| `hollowmere.first-win` | Erster Kampfsieg / First Battle Won | `hollowmere.games.won` ≥ 1 | Shield | 50 | 20 |
| `hollowmere.befriender-1` | Erste Freundschaft / First Companion | `hollowmere.creatures.befriended` ≥ 1 | HeartHandshake | 25 | 10 |
| `hollowmere.befriender-10` | Kreaturenfreund / Creature Friend | `hollowmere.creatures.befriended` ≥ 10 | PawPrint | 100 | 25 |
| `hollowmere.befriender-50` | Hüter von Hollowmere / Warden of Hollowmere | `hollowmere.creatures.befriended` ≥ 50 | Sparkles | 250 | 50 |
| `minecraft.playtime-1h` | Erste Schicht / First Shift | `minecraft.playtime.minutes` ≥ 60 | Pickaxe | 25 | 10 |
| `minecraft.playtime-10h` | Baumeister / Master Builder | `minecraft.playtime.minutes` ≥ 600 | Hammer | 100 | 25 |
| `minecraft.playtime-100h` | Blockveteran / Block Veteran | `minecraft.playtime.minutes` ≥ 6000 | Mountain | 300 | 75 |
| `wins-10` | Siegesserie / Winning Streak | sum of `*.games.won` ≥ 10 | Medal | 100 | 25 |
| `wins-50` | Champion / Champion | sum of `*.games.won` ≥ 50 | Crown | 250 | 50 |
| `wins-250` | Legende / Legend | sum of `*.games.won` ≥ 250 | Gem | 500 | 100 |
| `allrounder` | Allrounder / All-Rounder | `tretu.apps.used` ≥ 3 | Shapes | 150 | 50 |
| `friends-1` | Neue Freunde / New Friends | `tretu.friends` ≥ 1 | UserPlus | 25 | 10 |
| `friends-10` | Gesellig / Sociable | `tretu.friends` ≥ 10 | Users | 100 | 25 |
| `friends-25` | Netzwerker / Networker | `tretu.friends` ≥ 25 | Network | 200 | 50 |
| `early-supporter` | Früher Unterstützer / Early Supporter | account created ≤ `TRETU_EARLY_SUPPORTER_UNTIL` | Rocket | 100 | 100 |

## Webhooks, jobs and the worker

Platform events (`user.updated`, `user.deleted`, `badge.earned`, `level.up`, `wallet.changed`,
`friend.added`, `notification.created`) are written to `platform_outbox` in the same transaction as the
change, one row per app with a `webhook` in `TRETU_APPS_JSON` (same event id for all apps). The worker
POSTs the envelope (`app:"platform"`) signed with `x-tretu-app: platform` and the **receiving** app's
secret, 5 s timeout. Non-2xx/timeouts retry after 30 s, 1, 2, 4 … min (capped at 2 h) until 24 h after
creation, then `failed`. Rows are claimed with `FOR UPDATE SKIP LOCKED`, so several workers are safe.

`platform_jobs` (same backoff; push gives up after 1 h): `push.send`, `badge.sync.discord`,
`badge.sync.teamspeak`, `user.fetch`.

Worker: `scripts/platform-worker.ts` (`npm run platform:worker`, `-- --once` for a single pass). Loop: webhooks
+ jobs (every 2 s when idle), presence expiry (30 s), every 10 min badge-sync reconciliation (earned,
mapped, not yet synced; "skipped" ones retried after a day) and housekeeping (delivered webhooks/done jobs
after 7 days, failed after 30 days, notifications after 180 days). PM2 entry for `ecosystem.config.cjs`:

```js
{
  name: "tretu-platform-worker",
  script: "node",
  args: "--import tsx --import ./src/lib/env/load-local-env.ts ./scripts/platform-worker.ts",
  cwd: __dirname,
  env: { NODE_ENV: "production" },
  max_memory_restart: "300M",
}
```

### Discord + TeamSpeak badge sync

- Discord: `PUT /guilds/{DISCORD_GUILD_ID}/members/{discord_id}/roles/{role}` with `Bot ${DISCORD_BOT_TOKEN}`
  (the bot needs *Manage Roles* and a role above the badge roles). `discord_id` comes from the directory
  (`links.discord` of the auth user). Not a member / no link → `skipped`.
- TeamSpeak reuses `src/lib/teamspeak` (ServerQuery client, `TS_QUERY_*` config of the rank worker, identity =
  TS unique identifier → `client_database_id`). Since auth has no TeamSpeak link, users link their TS
  identity on `/einstellungen`: they put a code (`TRT-XXXXX`, 15 min) into their TS nickname and click
  *Prüfen*; the online client with that code is stored (uid + database id). Groups are added with
  `servergroupaddclient`; "already member" counts as done.
- State per (sub, badge, target) in `platform_badge_sync` (idempotent).

## Web push

`npm run platform:vapid-keys` prints a key pair. With `WEB_PUSH_*` set, /benachrichtigungen offers
"Auf diesem Gerät aktivieren" (registers `/platform-sw.js`, stores the subscription). Each notification in
a category with *Anzeigen* + *Push* enabled queues a push to all devices; 404/410 devices are removed.
Categories (settings per user): social (friend requests), invite, achievement (badge, level), wallet, app
(everything else). Muted categories are stored as already read.

## Data model (Postgres, all tables `platform_*`)

users (directory: sub, username, name, picture, locale, roles, links, discord_id, auth_created_at,
source_updated_at, fetched_at) · deleted_users (tombstones) · profile_settings (visibility
public/friends/private, default public) · events · user_stats (sub, key, value) · user_progress (xp,
level) · daily_counters (sub, Berlin day, counter) · user_apps · user_badges · user_achievements ·
badge_sync · ts_links · outbox · jobs · wallet_accounts · wallet_transactions (unique app +
idempotency_key) · wallet_entries (amount, balance_after) · wallet_daily (sub, day) · friend_requests ·
friendships (sub_a < sub_b) · presence (sub, app, expires_at) · notifications · notification_settings ·
push_subscriptions.

## Env vars

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes (platform on) | Postgres (production: the tretu.de database) |
| `PLATFORM_DB_POOL_MAX` | no (10) | pool size of the platform client |
| `TRETU_APPS_JSON` | yes (API on) | app secrets + webhook URLs (contract §3) |
| `TRETU_PLATFORM_URL` | no (`https://tretu.de`) | base for `profileUrl` and push links |
| `TRETU_AUTH_ISSUER`, `TRETU_APP_SECRET` | for user fetches | auth admin API (signed as `tretu-web`); also "Mein Konto" link |
| `TRETU_PLATFORM_RATE_LIMIT_PER_MIN`, `…_BURST` | no | per-app rate limit |
| `TRETU_ECONOMY_*`, `TRETU_XP_*`, `TRETU_EARLY_SUPPORTER_UNTIL` | no | economy table above |
| `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `TRETU_BADGE_DISCORD_ROLES_JSON` | for Discord sync | `{"wins-10":"<role id>",…}` |
| `TRETU_BADGE_TS_GROUPS_JSON` (+ `TS_QUERY_*`) | for TS sync | `{"wins-10":31,…}` |
| `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT` | for push | VAPID |
| `TRETU_PLATFORM_DEV_SUB`, `TRETU_PLATFORM_DEV_NAME` | dev only | impersonate a user in `next dev` (ignored in production) |

## Development and tests

```bash
DATABASE_URL=postgres://postgres@localhost:5432/tretu_platform npm run platform:db:push -- --force
DATABASE_URL=… TRETU_PLATFORM_DEV_SUB=00000000-0000-4000-8000-000000000001 npm run platform:seed-dev
DATABASE_URL=… TRETU_PLATFORM_DEV_SUB=00000000-0000-4000-8000-000000000001 npm run dev   # /u/robin, /freunde …
npm run test:platform   # uses tretu_platform_test (created + schema applied automatically;
                        # override with TRETU_PLATFORM_TEST_DATABASE_URL)
```

Migrations are not committed here: the integrator generates one migration for the merged schema.
