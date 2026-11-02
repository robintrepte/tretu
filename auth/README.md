# Tretu-Konto · auth.tretu.de

The central identity provider of the Tretu gaming community: one account for tretu.de, Saga, Play,
Hollowmere and the Minecraft dashboard. It is an OpenID Connect provider (contract §2 of the Tretu ecosystem
contract), the place where people sign in and manage their account ("Mein Konto"), and it tells the platform
about account changes (contract §4).

Self-contained Next.js app: it lives in `tretu/auth` for now and can move to its own repository with
`git subtree split --prefix auth`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Better Auth 1.7 with
`@better-auth/oauth-provider`, `@better-auth/passkey`, two-factor, magic link, username, JWT ·
Drizzle ORM + Postgres · next-intl (German first, English; cookie `NEXT_LOCALE`, no URL prefix) ·
Amazon SES v2 · Vitest, openid-client, Playwright.

## What it does

- **OIDC provider** — issuer `TRETU_AUTH_ISSUER`, discovery at `<issuer>/.well-known/openid-configuration`,
  authorization code + PKCE (S256), refresh tokens (`offline_access`), userinfo, RP-initiated logout,
  RS256 ID tokens. Scopes `openid profile email offline_access tretu`; claims `sub`, `preferred_username`,
  `name`, `picture`, `email`, `email_verified`, `locale`, and with `tretu`: `roles`, `discord_id`,
  `minecraft_uuid`, `minecraft_name`, `steam_id`, `teamspeak_uid`. First-party clients skip the consent screen.
- **Sign-in** — email/username + password (email verification, reset, breached-password check via Have I
  Been Pwned k-anonymity, failing open), passkeys (RP ID `tretu.de`, so they work on every subdomain),
  Discord / Google / Apple and Steam (OpenID 2.0, `STEAM_LOGIN=true`; each only when configured), magic links,
  TOTP 2FA with backup codes (required for admins, asked after every sign-in except passkeys), optional Cloudflare
  Turnstile on registration. Rate limits on every auth endpoint.
- **Mein Konto** (`/konto`) — profile (username shared across Tretu, display name, avatar), security
  (password, passkeys, 2FA, sessions, sign out everywhere, activity log), connected accounts (Discord, Google,
  Apple; Steam connected right there; Minecraft and TeamSpeak linked by those services), language (→ `locale` claim), privacy (JSON data export, account deletion),
  app overview.
- **Admin API** for the other services, signed per contract §3 (`TRETU_APPS_JSON`).
- **Central admin API** (`/api/v1/admin/**`) for the account admin on tretu.de: search, account details, stats, roles,
  sign out everywhere, lock/unlock, 2FA reset, removing links, confirming an email, merging accounts. Only app
  `tretu-web` may call it; every change names the acting admin and a reason and is recorded in both activity logs.
- **Account lock** — a locked Tretu-Konto cannot sign in by any method (password, passkey, magic link, Discord, Google,
  Apple, Steam, email links, two-factor, an app sign-in with an existing session); locking signs it out everywhere.
- **Events** `user.created` / `user.updated` / `user.deleted` to the platform through an outbox table.
- **Legacy import** of Saga, Play, tretu.de and Hollowmere (Nakama) accounts. There is no self-service claim:
  old accounts the import could not join are merged by an admin (`npm run admin -- legacy` / `merge`).

## Endpoints

| | Path (relative to the issuer) |
|---|---|
| Discovery | `/.well-known/openid-configuration` (also `/.well-known/oauth-authorization-server`) |
| Authorization | `/api/auth/oauth2/authorize` |
| Token | `/api/auth/oauth2/token` (client_secret_basic **or** client_secret_post; `none` + PKCE for public clients) |
| Userinfo | `/api/auth/oauth2/userinfo` |
| JWKS | `/api/auth/jwks` |
| End session | `/api/auth/oauth2/end-session` (`id_token_hint`, `post_logout_redirect_uri`, `state`) |
| Revocation / introspection | `/api/auth/oauth2/revoke`, `/api/auth/oauth2/introspect` |
| Health | `/api/health` |
| Account page | `/konto` |
| Admin API (signed) | `POST/DELETE /api/v1/links` (`minecraft`, `steam`, `teamspeak`), `GET /api/v1/users/{sub}`, `GET /api/v1/users?username=` |
| Central admin API (signed, `tretu-web` only) | see [Central admin API](#central-admin-api) |
| Steam (OpenID 2.0) | `POST /api/auth/sign-in/steam`, `POST /api/auth/steam/link`, `GET /api/auth/steam/callback` (return_to) |

Clients must use discovery, not these paths.

## OIDC clients

Clients are configuration: `TRETU_OAUTH_CLIENTS_JSON` maps each `client_id` to its settings and is written to
the database at boot and by `npm run clients:sync` (removed clients are disabled):

```json
{
  "tretu-web":    { "type": "confidential", "secret": "…", "name": "tretu.de",  "redirectUris": ["https://tretu.de/api/auth/oauth2/callback/tretu"] },
  "saga":         { "type": "confidential", "secret": "…", "name": "Saga",      "redirectUris": ["https://saga.tretu.de/api/auth/oauth2/callback/tretu"] },
  "play":         { "type": "confidential", "secret": "…", "name": "Play",      "redirectUris": ["https://play.tretu.de/api/auth/oauth2/callback/tretu"] },
  "mc-dashboard": { "type": "confidential", "secret": "…", "name": "Minecraft", "redirectUris": ["https://mc.tretu.de/auth/callback"] },
  "hollowmere":   { "type": "public",                      "name": "Hollowmere","redirectUris": ["https://hollowmere.tretu.de/auth/callback", "http://127.0.0.1/callback"] }
}
```

- `secret`: 16+ characters (use `openssl rand -base64 32`), only for confidential clients; stored as SHA-256.
- Loopback redirect URIs (`http://127.0.0.1/...`, `http://localhost/...`) accept **any port** (RFC 8252 §7.3);
  everything else must match exactly, and plain http is only allowed on loopback hosts.
- `postLogoutRedirectUris` (optional): where RP-initiated logout may return; defaults to the origin root of
  each redirect URI (e.g. `https://saga.tretu.de/`).
- `firstParty` (default `true`): skip the consent screen. For local development add `http://localhost:<port>/…`
  redirect URIs in the development env only.

Apps on Better Auth use `genericOAuth` with `providerId: "tretu"`,
`discoveryUrl: "${TRETU_AUTH_ISSUER}/.well-known/openid-configuration"`, `pkce: true` and the scopes above.
Emails ending in `@users.tretu.invalid` are placeholders of imported accounts without an email
(`email_verified` is always `false` for them).

## Development

```bash
cp .env.example .env.local      # DATABASE_URL defaults to postgres://postgres@localhost:5432/tretu_auth
npm install
npm run db:migrate
npm run dev                     # http://localhost:3021 — emails are printed to the console
```

Useful: `npm run admin -- grant <username|email> admin`, `npm run admin -- lock|unlock <username|email>`,
`npm run admin -- legacy`, `npm run admin -- merge <from> <into> [--yes]`, `npm run clients:sync`, `npm run worker:events`.

## Checks

```bash
npm run lint
npm run typecheck
npm test                        # unit tests (signing vectors §3, claims, Steam OpenID checks, redirects, legacy matching, …)
npm run build
npm run test:integration        # the built app on :3121 against tretu_auth_test, with mocked Discord/Google/Apple and a Steam stub
npm run test:e2e                # Playwright on :3131 against tretu_auth_test_e2e (needs a build): passkeys, Steam, Mein Konto
npm run secrets                 # prints fresh BETTER_AUTH_SECRET and OIDC client secrets (stores nothing)
```

Integration and e2e tests reset their own databases (`tretu_auth_test*`) on the local Postgres; they never
touch `tretu_auth`.

## Design notes

- **Cookies**: over HTTPS every cookie is host-only `__Host-tretu.*` (Secure, Path=/, SameSite=Lax).
- **CSP**: nonce-based `script-src` with `strict-dynamic`; only Turnstile and Umami are allowed when configured.
- **Passwords**: native Better Auth scrypt. Imported Saga/Nakama bcrypt hashes are stored as `bcrypt:<hash>`,
  several old passwords of one person as `multi:<…>`; after the first successful sign-in the password is
  re-hashed natively (`lib/passwords.ts`).
- **Two-factor accounts**: Better Auth's two-factor plugin only challenges password sign-ins. For Discord, Google,
  Apple, Steam, magic links and email confirmation links the tretu plugin does the same with the plugin's own
  mechanism (`lib/two-factor-challenge.ts`): the new session is deleted before anything can use it, a signed
  10-minute `two_factor` challenge cookie is set and the browser goes to `/2fa?next=…` (for app sign-ins `next` is
  the authorization endpoint again). Passkeys (user verification) count as two factors.
- **Steam** (`lib/steam/`): `checkid_setup` to Steam with realm/return_to on the issuer; the answer is accepted only
  after a strict field check (namespace, `op_endpoint`, `claimed_id` = `identity` =
  `https://steamcommunity.com/openid/id/<17 digits>`, exact `return_to`, signed field list, fresh nonce, no repeated
  parameters), `check_authentication` with Steam (`is_valid:true`) and an unused `response_nonce` (table
  `openid_nonce`). A signed `steam_state` cookie binds the one-time state to the browser. The Steam ID is an
  `account` row (provider `steam`), like other providers; Steam sign-ups get a placeholder email and a unique
  username from the persona name. The admin API's `steam` links use the same rows.
- **TOTP replay protection** (`lib/totp-replay.ts`): a code's 30 s time step is accepted once per user
  (`two_factor.last_totp_counter`, claimed with one conditional UPDATE in a before hook on
  `/two-factor/verify-totp`, the only TOTP check: sign-in, turning 2FA on, signed-in checks). The same code twice,
  an older code after a newer one and concurrent submissions are refused (`TOTP_CODE_REUSED`).
- **Accounts without a real email** (Steam sign-ups, imported accounts with a placeholder address) give and confirm an
  email address when they set a first password; password sign-in keeps requiring a confirmed email for everyone.
- **Redirect parameters** (`next`, `callbackURL`, `errorCallbackURL`, `newUserCallbackURL`, `redirectTo`) must stay
  on this site (`lib/redirects.ts`): relative paths or the issuer origin, never whitespace, backslashes or `//`.
- **Unlinking** a provider (incl. Steam) is allowed while another way to sign in remains: password, another provider
  or a passkey.
- **Usernames** are unique across Tretu (`[A-Za-z0-9_-]{3,24}`, case-insensitive), changeable every 30 days.
- **Events** are written to `event_outbox` in the same database and delivered by the `tretu-auth-events`
  worker (and right away by the web process); deliveries are signed as app `auth`. `user.deleted` carries
  `{ "mergedInto": "<sub>" }` when an account was merged into another one (`npm run admin -- merge`).
- **Legacy import** merges only on the same Discord ID, the same Google/Apple/Steam ID (Nakama's `steam_id`), or the
  same email verified on both sides; imported Steam IDs can sign in with Steam. The older account keeps a contested username; the other one gets `name_2` and a free rename
  after its first sign-in (`/weiter` and "Mein Konto").

## Central admin API

The account admin of the ecosystem lives on tretu.de (`src/app/(internal)/dashboard/…`); auth.tretu.de serves it
this API. Requests are signed per contract §3 **by app `tretu-web`** (any other app: `403 forbidden_app`). Every
change carries `actorSub` (the admin doing it) and `reason` (3–500 characters); the actor must hold `admin` right now,
not be locked and have 2FA on (`403 actor_not_admin` / `actor_two_factor_required`). Reads accept an optional
`?actorSub=` that is checked the same way. Code: `app/api/v1/admin/**`, `lib/admin/*` (shared with `npm run admin`).

| Request | Answer |
|---|---|
| `GET /api/v1/admin/users?q=&limit=50&cursor=` | `{ items: [user], nextCursor }` — `q` matches username, display name, email (substring), sub, any provider account id (Discord ID, SteamID64, …), Minecraft UUID (with or without dashes) or name, TeamSpeak UID or nickname; exact matches first, then newest; `limit` 1–100 |
| `GET /api/v1/admin/users/{sub}` | `user` plus `emailVerified`, `locale`, `lockedReason`, `lockedUntil`, `lockedAt`, `providers`, `passkeys`, `sessions`, `legacyLinks`, `audit` (newest 50) |
| `GET /api/v1/admin/stats` | `{ users: { total, verified, withTwoFactor, locked, admins }, signUpsPerDay, signInsPerDay, providers }` (90 Europe/Berlin days) |
| `GET /api/v1/admin/legacy` | `{ items }` — the data of `npm run admin -- legacy` |
| `POST /api/v1/admin/users/{sub}/roles` `{ add?, remove? }` | an admin cannot remove their own `admin`; never from the last usable admin |
| `POST /api/v1/admin/users/{sub}/sessions/revoke` | sessions, app access/refresh tokens, pending codes and 2FA challenges |
| `POST /api/v1/admin/users/{sub}/lock` `{ until? }` / `…/unlock` | not yourself, not the last usable admin |
| `POST /api/v1/admin/users/{sub}/two-factor/reset` | removes TOTP and backup codes, signs out everywhere |
| `POST /api/v1/admin/users/{sub}/links/remove` `{ provider }` | `discord`, `google`, `apple`, `steam` (never the last way to sign in) or `minecraft`, `teamspeak` |
| `POST /api/v1/admin/users/{sub}/email/verify` | `409 no_email` for accounts without an address |
| `POST /api/v1/admin/merge` `{ from, into, dryRun }` | `{ dryRun: true, plan }` or `{ dryRun: false, merged: true, plan, user }` |

`user` = `{ sub, username, name, email (null without a real address), picture, createdAt, lastSignInAt, roles,
twoFactor, locked, links }`. User actions answer `{ ok: true, changed, user, … }`; a request that changes nothing
answers `changed: false` and is not recorded. Errors: `{ error, message? }` with 400 `invalid_request`,
401 `unauthorized`, 403 (`forbidden_app`, `actor_not_admin`, `actor_two_factor_required`, `self_action`),
404 `not_found`, 409 (`last_admin`, `last_sign_in_method`, `no_email`, `merge_refused`).

Every change is recorded as `admin.<action>` in the account's activity log (with the admin and the reason; "Mein
Konto" shows it as "… vom Tretu-Team" without either) and as `admin.performed` in the admin's own log. Roles, lock,
unlock and link changes emit `user.updated`; merges emit `user.updated` + `user.deleted { mergedInto }`.

**Account lock.** `locked`, `locked_reason`, `locked_until`, `locked_at` on `user`. Every new session of a locked
account is refused (`databaseHooks.session.create` in `lib/auth.ts`): JSON sign-ins answer `403 { code:
"ACCOUNT_LOCKED", lockedUntil }`, page loads (provider callbacks, email links) go to `/login?error=ACCOUNT_LOCKED`,
and the OIDC authorize/continue/consent endpoints refuse a session that survived a lock. Locking deletes sessions,
app tokens and authorization codes not yet exchanged. A lock with `lockedUntil` ends by itself: the event worker
lifts it (activity `lock.expired`, `user.updated { locked: false }`), and a sign-in after the date lifts it on the
spot. The user shape (`GET /api/v1/users/{sub}`, events) carries `locked`.

See [DEPLOY.md](DEPLOY.md) for production.
