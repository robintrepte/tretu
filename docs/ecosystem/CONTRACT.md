# Tretu Ecosystem Contract (v1)

The single source of truth every Tretu app implements against. Repos stay separate: **no shared
packages**. Each app has its own small client (e.g. `lib/tretu/`) that implements this contract.
A copy of this file is committed to `tretu/docs/ecosystem/CONTRACT.md`.

Hard rule for every app: **every integration is OFF unless its env vars are set.** With no `TRETU_*`
env, the app must behave exactly as it does today (old logins keep working). This makes merging to
`main` safe before auth.tretu.de / the platform are deployed.

## 0. Hosts, processes, ports (production, Hetzner, PM2 behind nginx, no Docker)

| Service | Host | Repo / path | PM2 name | Port | Postgres DB |
|---|---|---|---|---|---|
| Hub + platform API | tretu.de | tretu (root app) | tretu-web | 3020 | tretu_web |
| Identity provider | auth.tretu.de | tretu/auth | tretu-auth | 3021 | tretu_auth |
| Saga | saga.tretu.de | adventure.ai | saga | 3038 | saga |
| Play | play.tretu.de | play | play | 3030 | play |
| Hollowmere web + Nakama | hollowmere.tretu.de | hollowmere | hollowmere-nakama | 7350 (console 7351, localhost) | nakama |
| Minecraft dashboard | mc.tretu.de | tretu-minecraft/dashboard | mc-dashboard | 8130 | mc_dashboard |

One Postgres server on the same machine, one database per app. Every repo ships:
- `ecosystem.config.cjs` (PM2) using the names/ports above,
- `deploy/nginx/<host>.conf` (TLS via certbot, `proxy_pass http://127.0.0.1:<port>`, websocket upgrade headers where needed),
- a `DEPLOY.md` (or section) with the same steps: `git pull` → `npm ci` → migrate → `npm run build` → `pm2 reload ecosystem.config.cjs --update-env`.
- `GET /api/health` → `200 {"status":"ok","app":"<id>","version":"<pkg version>","time":"<ISO>","checks":{"db":"ok"}}`, `503` with `"status":"error"` if a check fails. No auth, no secrets in output.

Status page: `https://tretu.de/status` (and `GET https://tretu.de/api/status`), served by tretu-web. The
`tretu-platform-worker` polls every service's `/api/health` once a minute (5 s timeout): `200` + `"status":"ok"`
= running, any other answer = disturbed, no answer = down. There is no separate analytics or status service.

Local dev/test Postgres (already running in the build container): `postgres://postgres@localhost:5432/<db>` (trust auth), databases: tretu_auth, tretu_web, tretu_platform, saga, play, mc_dashboard, nakama. Do NOT start another Postgres. Use a DB named `<db>_test` for destructive tests if you need one (create it yourself).

## 1. Common env vars

| Var | Example | Used by |
|---|---|---|
| `TRETU_AUTH_ISSUER` | `https://auth.tretu.de` | all OIDC clients |
| `TRETU_AUTH_CLIENT_ID` | `saga` | all OIDC clients |
| `TRETU_AUTH_CLIENT_SECRET` | random | confidential clients (not Hollowmere) |
| `TRETU_PLATFORM_URL` | `https://tretu.de` | apps calling the platform API |
| `TRETU_APP_ID` | `saga` | apps signing requests |
| `TRETU_APP_SECRET` | random, 32+ bytes | apps signing requests / verifying webhooks |
| `TRETU_LEGAL_URL` | `https://tretu.de` (default) | footer links |

App IDs: `tretu-web`, `auth`, `saga`, `play`, `hollowmere`, `mc-dashboard`.

## 2. Identity: auth.tretu.de (OIDC provider)

- Issuer: exactly `https://auth.tretu.de` (env `TRETU_AUTH_ISSUER`, no trailing slash). Discovery at `${issuer}/.well-known/openid-configuration`, JWKS linked from discovery. Clients MUST use discovery, not hard-coded endpoint paths.
- Flow: authorization code + PKCE (S256) + state (+ nonce). Refresh tokens with `offline_access`. RP-initiated logout via `end_session_endpoint`.
- Scopes: `openid profile email offline_access tretu`.
- Claims (ID token and userinfo):
  - `sub` – permanent Tretu ID (UUID string). Apps store it as `tretu_sub` / `tretuSub` (unique).
  - `preferred_username`, `name`, `picture`, `email`, `email_verified`, `locale` (`"de"` | `"en"`)
  - with scope `tretu`: `roles` (string[], global only, e.g. `["admin"]`), `discord_id`, `minecraft_uuid`, `minecraft_name`, `steam_id` (64-bit SteamID as a decimal string), `teamspeak_uid` (TeamSpeak unique identifier) (each string or absent)
- Registered clients and redirect URIs:

| client_id | type | redirect URIs |
|---|---|---|
| tretu-web | confidential | `https://tretu.de/api/auth/oauth2/callback/tretu` |
| saga | confidential | `https://saga.tretu.de/api/auth/oauth2/callback/tretu` |
| play | confidential | `https://play.tretu.de/api/auth/oauth2/callback/tretu` |
| mc-dashboard | confidential | `https://mc.tretu.de/auth/callback` |
| hollowmere | public (PKCE only) | `https://hollowmere.tretu.de/auth/callback`, `http://127.0.0.1/callback` (loopback: any port allowed, RFC 8252 §7.3) |

  (Local dev: each client may additionally allow `http://localhost:<its port>/...` equivalents — configured by env in auth, never hard-coded in prod.)
- Better Auth apps use the `genericOAuth` plugin with `providerId: "tretu"`, `discoveryUrl: ${TRETU_AUTH_ISSUER}/.well-known/openid-configuration`, `pkce: true`, scopes above → callback path `/api/auth/oauth2/callback/tretu`.
- On login, a client finds the local user by `tretu_sub`; else matches an existing user by `discord_id` claim (only if the local user has that Discord ID), else by **verified** email (`email_verified === true` and the local email is also verified/OAuth-sourced); else creates a new local user. Then stores `tretu_sub`. Never merge on unverified email.
- On login, apply `locale` claim as the user's UI language (e.g. set `NEXT_LOCALE` cookie) unless the user chose a language locally afterwards.
- Account page ("Mein Konto"): `https://auth.tretu.de/konto`. Apps link there from their user menu.

### Auth admin API (server-to-server, signed per §3)
- `POST ${issuer}/api/v1/links` `{ "sub", "provider": "minecraft"|"steam"|"teamspeak", "providerAccountId", "displayName" }` → `200 {"ok":true}` (replaces that sub's existing link of the provider); `409` if that providerAccountId is linked to another sub.
- `DELETE ${issuer}/api/v1/links` `{ "sub", "provider" }` → `200` (`404` = nothing linked, treated as done by callers).
- `GET ${issuer}/api/v1/users/{sub}` → `{ sub, username, name, picture, locale, roles, locked, links:{discord?,minecraft?,minecraftName?,steam?,teamspeak?}, createdAt }`.
  `locked` (boolean): the Tretu-Konto is locked by an admin (see "Account lock" below).
- **TeamSpeak** links are proven on tretu.de only (nickname code on `https://tretu.de/einstellungen#teamspeak`): tretu.de
  (app `tretu-web`) registers them with `provider:"teamspeak"`, `providerAccountId` = the TeamSpeak unique identifier,
  `displayName` = nickname, and deletes them on unlink. Mein Konto shows the link and links to `/einstellungen#teamspeak`;
  unlinking in Mein Konto emits `user.updated` without `links.teamspeak`, and tretu.de then unlinks locally.
- `GET ${issuer}/api/v1/users?username=<name>` → same shape or `404`.
Auth emits events to the platform (§4): `user.created`, `user.updated` (profile, locale, roles, links or lock changed), `user.deleted`, each with `data` = the user shape above (deleted: `{}`).

### Account lock
- An admin can lock a Tretu-Konto (optionally until a date). While locked, auth refuses every sign-in (all methods,
  also an app sign-in with an existing session), issues no OIDC codes, and has revoked all its sessions and refresh
  tokens. Auth emits `user.updated` with `locked: true` on lock and `locked: false` on unlock or when the lock ends.
- Apps on `user.updated` with `locked: true`: end that user's local sessions and refuse new ones until a
  `user.updated` with `locked: false` arrives.

### Central admin API (server-to-server, signed per §3, caller MUST be app `tretu-web`)
The ecosystem's account admin lives on tretu.de; these endpoints exist only for it (any other app: `403 forbidden_app`).
Every mutation body carries `actorSub` (the admin doing it) and `reason` (3–500 chars); auth checks that the actor
holds `admin` now, is not locked and has 2FA on (`403 actor_not_admin` / `actor_two_factor_required`), and records the
action in the activity log of the target (`admin.<action>`) and of the actor (`admin.performed`). GETs accept an
optional `?actorSub=` checked the same way.
- `GET ${issuer}/api/v1/admin/users?q=&limit=50&cursor=` → `{ items:[user], nextCursor }`, `user` =
  `{ sub, username, name, email|null, picture, createdAt, lastSignInAt|null, roles, twoFactor, locked, links }`
  (`links` as in the user shape, plus `teamspeakName` when known). `q` matches username, name, email, sub, provider
  account ids (Discord, Steam, …), Minecraft UUID/name, TeamSpeak UID/nickname; exact matches first, then newest.
- `GET ${issuer}/api/v1/admin/users/{sub}` → `user` + `emailVerified, locale, lockedReason, lockedUntil, lockedAt,
  providers:[{provider ("password"|"discord"|"google"|"apple"|"steam"), accountId|null, displayName, createdAt}],
  passkeys:[{id,name,createdAt,lastUsedAt}], sessions:[{id,createdAt,expiresAt,ipAddress,userAgent,client}],
  legacyLinks:[{app,legacyUserId,legacyUsername,importedAt,method}], audit:[{id,event,success,ipAddress,userAgent,meta,createdAt}] (50)`
- `GET ${issuer}/api/v1/admin/stats` → `{ users:{total,verified,withTwoFactor,locked,admins}, signUpsPerDay:[{day,count}],
  signInsPerDay:[{day,count}], providers:{password,discord,google,apple,steam,passkey} }` (90 Europe/Berlin days, oldest
  first; sign-ins = accounts that signed in that day)
- `GET ${issuer}/api/v1/admin/legacy` → `{ items }` (the data of `npm run admin -- legacy`)
- `POST …/admin/users/{sub}/roles` `{ actorSub, reason, add?, remove? }`, `…/sessions/revoke`, `…/lock` `{ …, until? }`,
  `…/unlock`, `…/two-factor/reset`, `…/links/remove` `{ …, provider: discord|google|apple|steam|minecraft|teamspeak }`,
  `…/email/verify` → `200 { ok:true, changed, user, … }` (`changed:false` = nothing to do, not recorded)
- `POST ${issuer}/api/v1/admin/merge` `{ actorSub, reason, from, into, dryRun }` → `{ ok, dryRun:true, plan }` or
  `{ ok, dryRun:false, merged:true, plan, user }`
- Guards: no self-demotion or self-lock (`403 self_action`), never demote or lock the last usable admin (`409 last_admin`),
  never remove the last sign-in method (`409 last_sign_in_method`). Errors: 400 `invalid_request`, 401 `unauthorized`,
  404 `not_found`, 409 `no_email` / `merge_refused`.
- Signing GETs with a query: sign the query exactly as sent; auth accepts it encoded like `URLSearchParams` (space `+`)
  or like `encodeURIComponent` (space `%20`).

## 3. Signed server-to-server requests (platform API, auth admin API, webhooks)

Headers:
- `x-tretu-app`: sender app id
- `x-tretu-timestamp`: unix seconds (string)
- `x-tretu-signature`: `v1=` + lowercase hex `HMAC_SHA256(secret, base)`

`base = timestamp + "\n" + METHOD + "\n" + pathWithQuery + "\n" + sha256hex(rawBody)`
- `METHOD` uppercase; `pathWithQuery` = URL path + `?query` exactly as sent (no host); `rawBody` = exact bytes sent (empty string for GET/DELETE without body).
- `secret` = the sender app's `TRETU_APP_SECRET` (the platform/auth know every app's secret). For webhooks **from** the platform **to** an app, `x-tretu-app: platform` and the secret is the **receiving** app's secret.
- Receivers reject if `|now - timestamp| > 300` s, unknown app, or bad signature (constant-time compare) → `401 {"error":"unauthorized"}`.

Test vector (every implementation must have a unit test reproducing it):
```
secret    = test-secret-123
timestamp = 1767225600
method    = POST
path      = /api/v1/events
body      = {"id":"0b9f1c2e-1111-4a5b-8c9d-123456789abc","type":"stat.increment","app":"saga","sub":"user-sub-1","occurredAt":"2026-01-01T00:00:00.000Z","data":{"key":"saga.turns","by":1}}
sha256(body) = 4602011a4e61b23f5671fd07a722d0dbfa8ceefa4556218afc5d4aee7292062b
signature = v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d

GET /api/v1/wallet/user-sub-1 (empty body, sha256 = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)
signature = v1=2b0726b5f46af3137ecc0e51e27183533e357d620e2ab128fd7165610bc9ca6f
```

Platform config (on tretu.de and auth.tretu.de): `TRETU_APPS_JSON` = `{"saga":{"secret":"…","webhook":"https://saga.tretu.de/api/tretu/webhook"},"play":{…},"hollowmere":{"secret":"…"},"mc-dashboard":{…},"auth":{"secret":"…"},"tretu-web":{"secret":"…"}}`. `webhook` optional.

Clients: timeout 5 s, never block a user-facing request on the platform for longer; failures are logged and swallowed (events) or surfaced as a friendly error (wallet spend). Events SHOULD be sent fire-and-forget with a small in-process retry (or an outbox table if the app already has a job runner).

## 4. Events

Envelope (JSON):
```json
{ "id": "<uuid v4, unique, idempotency key>", "type": "game.finished", "app": "play",
  "sub": "<tretu sub or null>", "occurredAt": "<ISO 8601>", "data": { } }
```
`POST ${TRETU_PLATFORM_URL}/api/v1/events` — body is one envelope or `{"events":[…]}` (max 100) → `202 {"accepted":n,"duplicates":m}`. Same `id` twice = duplicate, ignored. Events with `sub: null` are stored but award nothing. `app` must equal `x-tretu-app`.

Event types apps send:
| type | data | notes |
|---|---|---|
| `game.finished` | `{ "game": string, "result": "win"\|"loss"\|"draw"\|"completed", "mode"?: "solo"\|"multiplayer"\|"bot", "durationSec"?: number, "opponents"?: string[] }` | platform auto-increments stats `<app>.games.played`, `<app>.<game>.played`, and on win `<app>.games.won`, `<app>.<game>.won` |
| `stat.increment` | `{ "key": "<app>.<name>", "by": positive int }` | key must start with sender app id + "." |
| `achievement.unlocked` | `{ "key": "<app>.<name>", "title"?: string }` | app-specific achievement; may map to a badge |
| `user.created` / `user.updated` / `user.deleted` | user shape (§2) | **auth only** |

Stat keys the apps emit (baseline; apps may add more, prefixed with their id):
- play: `game.finished` per finished game, `game` = Play's game id (e.g. `chess`, `maumau`, `solitaire`, …).
- saga: `stat.increment` `saga.turns` (player turns), `saga.worlds.created`, `saga.characters.created`; `game.finished` `{game:"campaign", result:"completed"}` when a campaign ends.
- hollowmere: `stat.increment` `hollowmere.creatures.befriended`, `hollowmere.days.played`; `game.finished` `{game:"battle", result:…}`.
- mc-dashboard: `stat.increment` `minecraft.playtime.minutes` (only for players linked to a Tretu-Konto).
- platform itself: `tretu.friends`, `tretu.apps.used`.

Webhooks the platform sends to apps (to `TRETU_APPS_JSON[app].webhook`, convention path `/api/tretu/webhook`, signed §3, retries with backoff up to 24 h, same envelope with `app:"platform"`):
`user.updated`, `user.deleted` (apps must delete or anonymise that user's data), `badge.earned` `{badge,title,xp,credits}`, `level.up` `{level}`, `wallet.changed` `{balance,delta,kind}`, `friend.added` `{friendSub}`, `notification.created` `{id,title,url}`. Apps answer `2xx` quickly; unknown types are ignored with `204`.

## 5. Platform API (tretu.de/api/v1, all signed §3, JSON, `sub` = Tretu ID)

Errors: `{"error":"<code>","message"?:string}` with 400/401/404/409/402.

Profiles & badges
- `GET /users/{sub}` → `{ sub, username, name, picture, level, xp, xpLevelStart, xpNextLevel, badges:[{key,title,description,icon,earnedAt}], stats:{[key]:number}, profileUrl }` (`profileUrl` = `https://tretu.de/u/<username>`)
- `GET /badges` → `{ badges:[{key,title,description,icon,xp,credits}] }`

Wallet (Tretu-Credits, integer, currency `"TC"`)
- `GET /wallet/{sub}` → `{ sub, balance, currency:"TC" }` (creates the wallet on first access and books the one-time welcome bonus).
- `GET /wallet/{sub}/transactions?limit=50&before=<id>` → `{ items:[{id,amount,kind,reason,app,ref,balanceAfter,createdAt}] }`
- `POST /wallet/{sub}/transactions` `{ "idempotencyKey": string, "amount": int (≠0), "kind": "spend"|"purchase"|"reward"|"refund"|"grant"|"migration"|"adjust", "reason": string, "ref"?: string }`
  → `200 { transactionId, balance, duplicate }`; `402 {"error":"insufficient_funds","balance"}` if the balance would go negative. `amount < 0` only for `spend`/`adjust`. Same idempotencyKey = returns the original result (`duplicate:true`).
- `POST /wallet/{sub}/daily` → `{ granted: int, balance }` — the daily top-up, at most once per Europe/Berlin calendar day across all apps (granted 0 if already claimed).
Economy defaults (configurable on tretu.de): welcome bonus and daily top-up = Saga's current `CREDITS_STARTING` / `CREDITS_DAILY_TOPUP` values and semantics; badge rewards one-time; game rewards capped per day.

Friends, presence, invites
- `GET /users/{sub}/friends` → `{ friends:[{sub,username,name,picture,since,presence|null}], incoming:[{id,from:{sub,username,name,picture},createdAt}], outgoing:[{id,to:{…},createdAt}] }`
- `POST /friends/requests` `{ "from": sub, "to": sub-or-username }` → `{ id, status:"pending"|"accepted" }` (auto-accepts if the reverse request exists)
- `POST /friends/requests/{id}/accept` `{ "sub" }`, `POST /friends/requests/{id}/decline` `{ "sub" }`
- `POST /friends/remove` `{ "sub", "friendSub" }`
- `PUT /presence/{sub}` `{ "status":"online"|"playing", "activity"?: string, "joinUrl"?: string }` → `204` (expires 120 s after the last PUT; apps send every 60 s while the user is active)
- `DELETE /presence/{sub}` → `204`
- `GET /presence?subs=a,b,c` → `{ presence:{ [sub]:{app,status,activity,joinUrl,updatedAt} } }`
- `POST /invites` `{ "from", "to", "title", "joinUrl" }` → creates an `invite` notification for `to` → `{ notificationId }` (403 unless they are friends)

Notifications
- `POST /notifications` `{ "sub", "type": string, "title", "body"?, "url"?, "icon"? }` → `{ id }`
- `GET /users/{sub}/notifications?unread=true&limit=20` → `{ items:[{id,app,type,title,body,url,icon,readAt,createdAt}], unreadCount }`
- `GET /users/{sub}/notifications/count` → `{ unreadCount }`
- `POST /users/{sub}/notifications/read` `{ "ids"?: string[], "all"?: boolean }` → `{ unreadCount }`
- Notification centre UI: `https://tretu.de/benachrichtigungen`. Web push is owned by tretu.de.

## 6. Shared UX conventions (no shared code)
- Legal: every app's footer links to `${TRETU_LEGAL_URL}/impressum`, `/datenschutz`, `/agb`. Old per-app legal routes 308-redirect there.
- Language: German default, English second. Locale cookie `NEXT_LOCALE` (`de`|`en`) in Next.js apps.
- User menu in each app (own styling) shows: profile link (`https://tretu.de/u/<username>`), "Mein Konto" (`https://auth.tretu.de/konto`), notifications unread count linking to the centre, Tretu-Credits balance where relevant, logout (local + RP-initiated logout).
- Analytics: no analytics or tracking scripts in any app. Play's own visitor statistics (cookieless daily totals,
  admin "Traffic" page) are the only usage statistics; any new one needs the privacy policy updated first.

## 7. Clarifications from the first implementation (binding)

- **Callback path in Better Auth apps.** Better Auth 1.7 handles generic OAuth providers at
  `/api/auth/callback/<id>`. The registered redirect URI stays the contract path
  `/api/auth/oauth2/callback/tretu`; each Better Auth app forwards it internally.
- **Post-logout redirects.** auth.tretu.de allows each client's origin root (e.g. `https://saga.tretu.de/`)
  unless `postLogoutRedirectUris` is set in `TRETU_OAUTH_CLIENTS_JSON`.
- **Client authentication.** The token endpoint accepts `client_secret_basic` and `client_secret_post`.
- **CORS.** Token, userinfo, revocation and JWKS endpoints send CORS headers for the https origins of
  public clients (Hollowmere's web build), never with credentials. Override with `TRETU_CORS_ORIGINS`.
- **Wallet amounts.** `spend` must be negative; `adjust` may be either sign; every other kind is positive.
  Idempotency keys are unique per calling app; reusing one for a different sub returns
  `409 idempotency_conflict`. History may also show the platform's own kinds `welcome`, `daily`, `reward`.
- **Stat prefixes.** `mc-dashboard` may also send keys starting with `minecraft.`.
- **Merged accounts.** `user.deleted` from auth may carry `{"mergedInto":"<sub>"}` when a legacy account was
  joined into another Tretu-Konto; the platform moves that wallet balance and those stats to `mergedInto`
  before erasing the old sub. Apps treat it like any other deletion.
- **Unknown subs.** Read-only platform routes answer `404 user_not_found` when auth cannot confirm a sub.
- **Hollowmere** sends events only for players signed in with a Tretu-Konto; its `/api/health` is served by the
  `hollowmere-mcp` process (PM2, port 8787), proxied by nginx.
- **Steam** (round 2): sign-in and link/unlink in auth (Steam OpenID 2.0, provider id `steam`); `links.steam` / `steam_id`
  carry the 64-bit SteamID. tretu.de shows a linked-Steam link (`https://steamcommunity.com/profiles/<id>`) on the public
  profile, only where the profile itself may be seen.
- **Account deletion** removes the Discord roles and TeamSpeak server groups the platform granted for badges (merges:
  they move to the surviving account when it has the same Discord / TeamSpeak identity).
