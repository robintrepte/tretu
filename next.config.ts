import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Origin of the self-hosted Umami script (only when analytics is configured). */
function umamiOrigin(): string | null {
  const src = process.env.NEXT_PUBLIC_UMAMI_SRC;
  if (!src || !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID) return null;
  try {
    return new URL(src).origin;
  } catch {
    return null;
  }
}
const umami = umamiOrigin();

/** Security headers applied to all routes. */
const securityHeaders = [
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.tsviewer.com https://www.tsviewer.com${umami ? ` ${umami}` : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      `connect-src 'self' https://www.googleapis.com${umami ? ` ${umami}` : ""}`,
      "frame-src 'self' https://embed.twitch.tv https://discord.com https://www.youtube.com https://map.tretu.de https://www.tsviewer.com",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "worker-src 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  /** Native addon + legacy assets; do not bundle (Turbopack cannot place them in ESM chunks). */
  serverExternalPackages: ["ssh2"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.youtube.com", pathname: "/**" },
      { protocol: "https", hostname: "i.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "i1.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "i2.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "i3.ytimg.com", pathname: "/**" },
      { protocol: "https", hostname: "i4.ytimg.com", pathname: "/**" },
    ],
  },
  // Tree-shake lucide-react so only used icons are bundled
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async redirects() {
    // Former per-app legal routes and English aliases all point to the one legal home.
    return [
      { source: "/imprint", destination: "/impressum", permanent: true },
      { source: "/legal-notice", destination: "/impressum", permanent: true },
      { source: "/privacy", destination: "/datenschutz", permanent: true },
      { source: "/privacy-policy", destination: "/datenschutz", permanent: true },
      { source: "/datenschutzerklaerung", destination: "/datenschutz", permanent: true },
      { source: "/terms", destination: "/agb", permanent: true },
      { source: "/nutzungsbedingungen", destination: "/agb", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
