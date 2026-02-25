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

Site identity and default SEO are in `src/lib/seo.ts` (canonical URL: **https://tretu.de**).

---

## License

MIT — see [LICENSE](LICENSE).
