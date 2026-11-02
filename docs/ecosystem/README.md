# Tretu ecosystem

One Tretu account, one platform, many apps. This folder documents how they fit together.

- **[CONTRACT.md](CONTRACT.md)** – the binding contract every app implements: hosts, PM2 names and ports, OIDC claims,
  signed server-to-server requests (with test vectors), events, platform API and UX conventions.
- **[../../deploy/GO-LIVE.md](../../deploy/GO-LIVE.md)** – the ordered go-live runbook (DNS, certificates, databases, secrets,
  deploy order, legacy import, switching each app on, verification, rollback per step).
- **[../../deploy/README.md](../../deploy/README.md)** – server setup for all apps: Postgres per app, nginx/certbot, PM2,
  Umami, Uptime Kuma.

## Who does what

| Part | Where | Role |
|---|---|---|
| **tretu.de** (this repo) | `src/` | Community hub, internal game-server dashboard, **platform API** (`/api/v1`: profiles, badges, wallet, friends, presence, notifications) and the **one legal home** (`/impressum`, `/datenschutz`, `/agb`) for every service |
| **auth.tretu.de** | `auth/` in this repo | OpenID Connect provider: the Tretu-Konto, account page `/konto`, admin API for account links |
| **Saga, Play, Hollowmere, Minecraft dashboard** | own repos | sign in with the Tretu-Konto, report events, use the wallet, link their footer to tretu.de's legal pages |

## Flows in one picture

```
 browser ──login──▶ app ──OIDC (code+PKCE)──▶ auth.tretu.de ──claims (sub, discord_id, roles, locale…)──▶ app
 app ──signed POST /api/v1/events──▶ tretu.de platform ──badges/XP/wallet──▶ signed webhooks ──▶ apps
 auth.tretu.de ──user.created/updated/deleted──▶ platform ──▶ apps (delete/anonymise on user.deleted)
```

## Conventions

- Every integration is off until its env vars are set (`TRETU_*`); without them each app behaves as before.
- German first, English second; language in the `NEXT_LOCALE` cookie.
- `GET /api/health` on every app; PM2 + nginx + one Postgres DB per app; no Docker for hosting.
