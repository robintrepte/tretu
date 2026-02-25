# Tretu Gaming Community

**Live site:** [tretu.de](https://tretu.de)

A modern, accessible website for the **Tretu** gaming community — Teamspeak, Discord, livestreams, videos, Minecraft map and rankings. Built with Next.js, TypeScript, and Tailwind CSS.

---

## Features

- **Home** — Hero with WebGL shader background, quick links to Teamspeak & Discord
- **Teamspeak** — Server viewer and info
- **Discord** — Invite and community link
- **Livestream** — Twitch embed and stream info
- **Videos** — YouTube content
- **Minecraft Map** — Embedded map (map.tretu.de)
- **Ranking & Stats** — Embedded ranking (ranks.tretu.de)
- **Impressum & Datenschutz** — Legal pages (German)
- **Theme** — Light / dark / system with next-themes
- **SEO & PWA** — Metadata, Open Graph, Twitter cards, JSON-LD, manifest, sitemap, robots.txt
- **Security** — CSP, HSTS, X-Frame-Options and other security headers

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

---

## Getting Started

### Prerequisites

- **Node.js** 20+
- **npm** (or yarn / pnpm / bun)

### Install & run

```bash
# Install dependencies
npm install

# Development (port 3020)
npm run dev
```

Open [http://localhost:3020](http://localhost:3020).

### Scripts

| Command        | Description |
|----------------|-------------|
| `npm run dev`  | Start dev server on port 3020 |
| `npm run build`| Production build |
| `npm run start`| Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Drizzle: generate migrations |
| `npm run db:push`     | Drizzle: push schema to DB |

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
│   ├── manifest.ts         # PWA manifest
│   └── globals.css         # Global styles, theme variables
├── components/             # React components (header, footer, etc.)
└── lib/                    # SEO config, metadata helpers, DB
```

Site identity and default SEO (title, description, OG image, locale) are centralized in `src/lib/seo.ts`. The canonical URL is **https://tretu.de**.

---

## Deployment

The app is built for [tretu.de](https://tretu.de). It runs as a standard Next.js app:

- **Build:** `npm run build`
- **Start:** `npm run start`

You can deploy to Vercel, Node hosting, or any platform that supports Next.js. No environment variables are required for the public site; adjust `src/lib/seo.ts` if you use a different domain.

---

## License

MIT — see [LICENSE](LICENSE).
