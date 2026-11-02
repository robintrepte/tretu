import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** auth.tretu.de origin (sign-in and logout redirects), from TRETU_AUTH_ISSUER at build time. */
function authOrigin(): string {
  try {
    return new URL(process.env.TRETU_AUTH_ISSUER || "https://auth.tretu.de").origin;
  } catch {
    return "https://auth.tretu.de";
  }
}

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
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  {
    // Popups opened from tretu.de cannot reach back into it (and vice versa); OAuth uses full redirects.
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // 'unsafe-inline': Next.js inline bootstrap scripts (no nonce setup). 'unsafe-eval': the WebGL shader library of the
      // home page feature-detects `new Function`. Everything else is limited to these hosts.
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.tsviewer.com https://www.tsviewer.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://www.googleapis.com",
      "frame-src 'self' https://embed.twitch.tv https://discord.com https://www.youtube.com https://www.youtube-nocookie.com https://map.tretu.de https://www.tsviewer.com",
      "manifest-src 'self'",
      "media-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      // Sign-in forms post to Better Auth here, which redirects to Discord / auth.tretu.de.
      `form-action 'self' https://discord.com ${authOrigin()}`,
      "frame-ancestors 'self'",
      "worker-src 'self'",
      ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
      {
        // Internal dashboard and central admin: never indexed (pages are dynamic, so never cached either).
        source: "/dashboard/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
