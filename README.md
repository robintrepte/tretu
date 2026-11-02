# Tretu Gaming Community

[![Website](https://img.shields.io/badge/website-tretu.de-ed6f1a?style=for-the-badge)](https://tretu.de)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)](LICENSE)

Source code for the official **Tretu** gaming community website. Teamspeak, Discord, livestreams, videos, Minecraft map and rankings. Live at **[tretu.de](https://tretu.de)**.

---

## Features

- **Home** — Hero with WebGL shader background, quick links to Teamspeak & Discord
- **Teamspeak** — Server viewer and info
- **Discord** — Invite and community link
- **Livestream** — Twitch embed and stream info
- **Videos** — YouTube content
- **Minecraft Map** — Embedded map (map.tretu.de)
- **Ranking & Stats** — Native TeamSpeak time ranking (monthly + all-time leaderboard)
- **Legal home** — Impressum, Datenschutz and AGB for every Tretu service (German, English translation)
- **Languages** — German and English (next-intl, `NEXT_LOCALE` cookie, switcher in the footer)
- **Accounts** — Better Auth: "Mit Tretu-Konto anmelden" (auth.tretu.de, OIDC) is the only sign-in; existing members are
  matched through the `legacy_ids` claim, their Discord ID or a verified email
- **Theme** — Light / dark / system with next-themes
- **SEO & PWA** — Metadata, Open Graph, Twitter cards, JSON-LD, manifest, sitemap, robots.txt
- **Security** — CSP, HSTS, X-Frame-Options, COOP and other security headers, rate limits, redacted logs
- **Internal Dashboard** — Hetzner game server control plane with RBAC, action queue, backups, and activity feed

---

## Tech Stack

| Area        | Stack |
|------------|--------|
| Framework  | [Next.js 16](https://nextjs.org) (App Router) |
| Language   | TypeScript |
| Styling    | [Tailwind CSS v4](https://tailwindcss.com), [shadcn](https://ui.shadcn.com) |
| Fonts      | [Jost](https://fonts.google.com/specimen/Jost) (next/font) |
| Icons      | [lucide-react](https://lucide.dev) |
| Data       | Drizzle ORM, PostgreSQL (postgres.js) |
| Auth       | Better Auth (Tretu-Konto via OIDC only) + role-based access |
| i18n       | next-intl (no URL prefixes) |
| Validation | Zod |
| Infra      | Hetzner Cloud API + SSH orchestration worker |

---

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx          # Root layout, metadata, theme, JSON-LD
│   ├── page.tsx            # Home
│   ├── teamspeak/          # Teamspeak page
│   ├── discord/            # Discord page
│   ├── live/               # Livestream page
│   ├── videos/             # Videos page
│   ├── map/                # Minecraft map page
│   ├── ranking/            # Ranking page
│   ├── impressum/          # Impressum
│   ├── datenschutz/        # Datenschutz (privacy)
│   ├── (internal)/dashboard/ # Internal dashboard pages
│   └── api/internal/dashboard/ # Internal dashboard APIs
│   ├── manifest.ts         # PWA manifest
│   └── globals.css         # Global styles, theme variables
├── components/             # React components (header, footer, etc.)
├── db/                     # Drizzle schema + DB entrypoint
├── lib/                    # SEO/auth/permissions/orchestrator/helpers
└── scripts/                # Worker entrypoints (orchestrator)
```

Site identity and default SEO are in `src/lib/seo.ts` (canonical URL: **https://tretu.de**).

---

## Environment Setup

1. Copy `.env.example` to `.env.local`.
2. Fill required values:
   - `DATABASE_URL` (Postgres, database `tretu_web`)
   - `AUTH_SECRET`, `BETTER_AUTH_URL`
   - `TRETU_AUTH_ISSUER`, `TRETU_AUTH_CLIENT_ID`, `TRETU_AUTH_CLIENT_SECRET`: "Mit Tretu-Konto anmelden" is the only
     sign-in (see [DEPLOY.md](DEPLOY.md#tretu-konto-login)). Without them, `/login` shows "Anmeldung nicht konfiguriert"
     in development and production refuses to start. Locally, run auth.tretu.de from [`auth/`](auth/) (port 3021) with
     a `tretu-web` client for `http://localhost:3020`.
   - `DASHBOARD_ADMIN_DISCORD_IDS` (your Discord user id → admin role on login, via the Discord account linked to your
     Tretu-Konto)
3. Keep `.env.local` private and never commit it.

Hetzner, Cloudflare and CurseForge are connected in the dashboard itself (`/dashboard/setup`), not via env.

---

## Local Development

```bash
npm install
npm run db:migrate          # creates/updates the schema in DATABASE_URL
# Import legacy ranks (place mysqldump at data/ranksystem-full.sql)
npm run db:migrate-ts-ranks
npm run dev
```

Open `http://localhost:3020`.

### Checks

```bash
npm run lint
npm run typecheck
npm test            # uses postgres://postgres@localhost:5432/tretu_web_test (override with TEST_DATABASE_URL)
npm run test:platform
npm run build
npm run test:e2e    # browser tests (Playwright) against the build
npm run test:deploy # deploy/scripts (secrets generator, databases, smoke test, backups)
npm run test:e2e:admin-real  # central admin against the real auth.tretu.de (needs both builds, see DEPLOY.md)
```

CI (`.github/workflows/ci.yml`) runs all of it, plus `auth/`'s suite, on pull requests and pushes to `main`; GitHub
Actions must be enabled for the repository.

Schema changes: edit `src/db/schema.ts`, then `npm run db:generate` (new file in `drizzle/`) and `npm run db:migrate`.

### Translations

UI texts live in `messages/de.json` and `messages/en.json`. Every `messages/<namespace>/<locale>.json` is merged under the
key `<namespace>` (e.g. `messages/platform/de.json` → `t("platform.…")`); missing English keys fall back to German.

### Deployment

See [DEPLOY.md](DEPLOY.md) (including the one-time upgrade from SQLite) and [deploy/README.md](deploy/README.md) for the
server setup of the whole ecosystem ([docs/ecosystem](docs/ecosystem/README.md)); the first go-live of everything is
[deploy/GO-LIVE.md](deploy/GO-LIVE.md).

### TeamSpeak ranking worker

Run on a host that can reach TeamSpeak ServerQuery (usually **the same machine** as the TS server, `TS_QUERY_HOST=127.0.0.1`). Many servers block remote Query (`query_allow_foreign_ips=0`); from your PC use an SSH tunnel or run the worker on the host.

```bash
npm run ts:query-probe    # test raw Query reachability
npm run worker:ts-rank
```

Configure `TS_QUERY_*` and `TS_VIRTUALSERVER_PORT` in `.env.local`. Rank tiers and user times are stored in Postgres; import once from `data/ranksystem-full.sql` via `npm run db:migrate-ts-ranks`.

Rank time counts **active** presence only: TeamSpeak `client_idle_time` must stay within `TS_RANK_IDLE_GRACE_SEC` (default 5 minutes). Channels whose name contains a token from `TS_RANK_AFK_CHANNEL_MATCH` (default `afk`) earn no time. The `/ranking` usage chart counts **all connected** clients.

**Legacy ranks.tretu.de:** After verifying the new `/ranking` page, disable the old Apache vhosts and remove the compromised PHP install on `s.tretu.de` (see ops notes in project history).

---

## Game-Server Dashboard

`/dashboard` manages game servers on Hetzner Cloud. Each server is one Docker container on its own VM; worlds live on a
Hetzner volume, so the VM only exists (and costs money) while people play.

**Games:** Minecraft Java (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge, Modrinth & CurseForge modpacks, extra Modrinth
mods/plugins). Valheim, Satisfactory, Palworld, Terraria (TShock) and Counter-Strike 2 are prepared but shown as
"Bald verfügbar" until their Docker setup has been verified on a real server — flip `available` in
`src/lib/games/catalog.ts` to enable one. The Docker runtime per game lives in `src/lib/games/runtime.ts`.

### First-time setup

1. Set `DASHBOARD_ADMIN_DISCORD_IDS` (or give your Tretu-Konto the `admin` role) and sign in once with the Tretu-Konto.
2. Open **Einrichtung** (`/dashboard/setup`) and paste a Hetzner Cloud API token (read & write). The dashboard
   generates its own SSH key and registers it in the Hetzner project.
3. Optional: Cloudflare API token ("Edit zone DNS" template) + domain → every server gets `<name>.<domain>`, updated
   automatically on each start. Optional: CurseForge API key for CurseForge modpacks.
4. Assign roles to other members under **Team**.

Tokens and the SSH key are stored AES-GCM encrypted in Postgres (key: `DASHBOARD_SECRET_KEY`, falls back to `AUTH_SECRET` —
changing it makes stored secrets unreadable, simply reconnect then).

### What a start does

Hetzner volume (once) → firewall (SSH + game ports) → VM with the volume → Docker install & volume mount →
Cloudflare A record → env file + `run.sh` on the volume → `docker run`. **Ausschalten** stops the game, takes a backup,
unmounts and deletes the VM. With **Auto-Aus** enabled the worker does this automatically after N minutes without players.

Backups are `tar.gz` files on the volume (`/srv/game/backups`, retention per server) and can be downloaded, restored or
deleted from the UI. The UI also provides live logs, a console (Minecraft RCON, CS2 RCON), a file manager (upload
mods/worlds, edit configs) and a per-server job log.

### Roles

- `admin` — everything incl. setup and role management
- `operator` — create/configure/delete servers, console, files
- `manager` — start, turn off, restart, backups
- `user` — no dashboard access

The **central Tretu admin** (`/dashboard/admin`: Tretu-Konten, wallet, badges, cross-app stats, audit log) needs the
Tretu `admin` role of the Tretu-Konto, not just the local admin role; operator and manager never get it. See
[DEPLOY.md](DEPLOY.md#central-tretu-admin).

### Orchestrator worker

The job worker and the status monitor run inside the Next.js server process by default (`src/instrumentation.ts`).
A DB lease ensures only one process works at a time. To run it separately instead:

```bash
ORCHESTRATOR_EMBEDDED=false   # for the Next.js process
npm run worker:orchestrator
```

New tables/columns are created automatically on startup (`src/db/ensure-dashboard-schema.ts`); `npm run db:push` works
as before.

---

## Tretu-Konto (`auth/`)

`auth/` is a separate, self-contained Next.js app: **auth.tretu.de**, the OpenID Connect provider behind the
Tretu account (PM2 `tretu-auth`, port 3021, database `tretu_auth`). It has its own `package.json`, tests and
deploy files and will move to its own repository (`git subtree split --prefix auth`). See
[auth/README.md](auth/README.md) and [auth/DEPLOY.md](auth/DEPLOY.md).

---

## License

MIT — see [LICENSE](LICENSE).
