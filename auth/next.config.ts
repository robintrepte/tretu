import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin("./i18n/request.ts")

const https = (process.env.TRETU_AUTH_ISSUER ?? "").startsWith("https://")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=(), payment=()" },
  ...(https ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
]

const nextConfig: NextConfig = {
  // This folder is self-contained (it will move to its own repository): never resolve against the parent.
  turbopack: { root: import.meta.dirname },
  outputFileTracingRoot: import.meta.dirname,
  agentRules: false,
  poweredByHeader: false,
  reactCompiler: true,
  typedRoutes: true,
  serverExternalPackages: ["sharp"],
  async rewrites() {
    return [
      // OIDC discovery lives at the issuer root (contract §2); Better Auth serves everything else under /api/auth.
      { source: "/.well-known/openid-configuration", destination: "/api/well-known/openid-configuration" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/well-known/oauth-authorization-server" },
    ]
  },
  async redirects() {
    return [
      { source: "/impressum", destination: `${process.env.TRETU_LEGAL_URL ?? "https://tretu.de"}/impressum`, permanent: true },
      { source: "/datenschutz", destination: `${process.env.TRETU_LEGAL_URL ?? "https://tretu.de"}/datenschutz`, permanent: true },
      { source: "/agb", destination: `${process.env.TRETU_LEGAL_URL ?? "https://tretu.de"}/agb`, permanent: true },
      { source: "/register", destination: "/registrieren", permanent: true },
      { source: "/account", destination: "/konto", permanent: true },
    ]
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ]
  },
}

export default withNextIntl(nextConfig)
