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
- **Impressum & Datenschutz** — Legal pages (German)
- **Theme** — Light / dark / system with next-themes
- **SEO & PWA** — Metadata, Open Graph, Twitter cards, JSON-LD, manifest, sitemap, robots.txt
- **Security** — CSP, HSTS, X-Frame-Options and other security headers
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
| Data       | Drizzle ORM, SQLite (better-sqlite3) |
| Auth       | NextAuth (Discord OAuth) + role-based access |
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
2. Fill required secrets:
   - `AUTH_SECRET`
   - `AUTH_DISCORD_CLIENT_ID`
   - `AUTH_DISCORD_CLIENT_SECRET`
   - `HETZNER_API_TOKEN`
   - `HETZNER_SSH_PRIVATE_KEY_PATH`
3. Keep `.env.local` private and never commit it.

---

## Local Development

```bash
npm install
npm run db:generate
npm run db:push
# Import legacy ranks (place mysqldump at data/ranksystem-full.sql)
npm run db:migrate-ts-ranks
npm run dev
```

Open `http://localhost:3020`.

### TeamSpeak ranking worker

Run on a host that can reach TeamSpeak ServerQuery (usually **the same machine** as the TS server, `TS_QUERY_HOST=127.0.0.1`). Many servers block remote Query (`query_allow_foreign_ips=0`); from your PC use an SSH tunnel or run the worker on the host.

```bash
npm run ts:query-probe    # test raw Query reachability
npm run worker:ts-rank
```

Configure `TS_QUERY_*` and `TS_VIRTUALSERVER_PORT` in `.env.local`. Rank tiers and user times are stored in SQLite; import once from `data/ranksystem-full.sql` via `npm run db:migrate-ts-ranks`.

Rank time counts **active** presence only: TeamSpeak `client_idle_time` must stay within `TS_RANK_IDLE_GRACE_SEC` (default 5 minutes). Channels whose name contains a token from `TS_RANK_AFK_CHANNEL_MATCH` (default `afk`) earn no time. The `/ranking` usage chart counts **all connected** clients.

**Legacy ranks.tretu.de:** After verifying the new `/ranking` page, disable the old Apache vhosts and remove the compromised PHP install on `s.tretu.de` (see ops notes in project history).

---

## Internal Dashboard

- Dashboard UI: `/dashboard`
- Activity view: `/dashboard/activity`
- Internal API namespace: `/api/internal/dashboard/*`
- Auth flow: `/api/auth/signin` (Discord)

### Roles

- `admin` — full access including role management
- `operator` — full game lifecycle + infra actions
- `manager` — dashboard access + start/stop/restart + backups
- `user` — no dashboard access

Role assignments are stored in DB (`users`, `roles`, `user_roles`).

---

## Orchestrator Worker

Run the long-lived action processor in a separate process:

```bash
npm run worker:orchestrator
```

The worker executes queued dashboard actions (provision/start/stop/restart/backup/deleteHost), handles retries, and records attempts/status.

---

## License

MIT — see [LICENSE](LICENSE).
