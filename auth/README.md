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
  `minecraft_uuid`, `minecraft_name`, `steam_id`. First-party clients skip the consent screen.
- **Sign-in** — email/username + password (email verification, reset, breached-password check via Have I
  Been Pwned k-anonymity, failing open), passkeys (RP ID `tretu.de`, so they work on every subdomain),
  Discord / Google / Apple (each only when configured), magic links, TOTP 2FA with backup codes (required for
  admins), optional Cloudflare Turnstile on registration. Rate limits on every auth endpoint.
- **Mein Konto** (`/konto`) — profile (username shared across Tretu, display name, avatar), security
  (password, passkeys, 2FA, sessions, sign out everywhere, activity log), connected accounts (Discord, Google,
  Apple; Minecraft/Steam links), language (→ `locale` claim), privacy (JSON data export, account deletion),
  "Alte Konten verbinden" (claim old accounts), app overview.
- **Admin API** for the other services, signed per contract §3 (`TRETU_APPS_JSON`).
- **Events** `user.created` / `user.updated` / `user.deleted` to the platform through an outbox table.
- **Legacy import** of Saga, Play, tretu.de and Hollowmere (Nakama) accounts.

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
| Admin API (signed) | `POST/DELETE /api/v1/links`, `GET /api/v1/users/{sub}`, `GET /api/v1/users?username=` |

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

Useful: `npm run admin -- grant <username|email> admin`, `npm run clients:sync`, `npm run worker:events`.

## Checks

```bash
npm run lint
npm run typecheck
npm test                        # unit tests (signing vectors §3, claims, legacy matching, passwords, …)
npm run build
npm run test:integration        # starts the built app on :3121 against tretu_auth_test (+ fixture DBs)
npm run test:e2e                # Playwright on :3131 against tretu_auth_test_e2e (needs a build)
```

Integration and e2e tests reset their own databases (`tretu_auth_test*`) on the local Postgres; they never
touch `tretu_auth`.

## Design notes

- **Cookies**: over HTTPS every cookie is host-only `__Host-tretu.*` (Secure, Path=/, SameSite=Lax).
- **CSP**: nonce-based `script-src` with `strict-dynamic`; only Turnstile and Umami are allowed when configured.
- **Passwords**: native Better Auth scrypt. Imported Saga/Nakama bcrypt hashes are stored as `bcrypt:<hash>`,
  several old passwords of one person as `multi:<…>`; after the first successful sign-in the password is
  re-hashed natively (`lib/passwords.ts`).
- **Two-factor accounts** sign in with password + code or a passkey; Discord/Google/Apple and email links are
  refused for them (Better Auth's 2FA check does not cover those).
- **Usernames** are unique across Tretu (`[A-Za-z0-9_-]{3,24}`, case-insensitive), changeable every 30 days.
- **Events** are written to `event_outbox` in the same database and delivered by the `tretu-auth-events`
  worker (and right away by the web process); deliveries are signed as app `auth`. `user.deleted` carries
  `{ "mergedInto": "<sub>" }` when an imported account was merged into another one through the claim flow.
- **Legacy import** merges only on the same Discord ID, the same Google/Apple ID, or the same email verified on
  both sides. The older account keeps a contested username; the other one gets `name_2` and a free rename
  after its first sign-in (`/weiter` and "Mein Konto").

See [DEPLOY.md](DEPLOY.md) for production.
