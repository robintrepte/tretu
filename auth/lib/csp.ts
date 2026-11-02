/** The Content Security Policy for every page (built per request with a fresh nonce in proxy.ts). */
export function buildCsp(input: { nonce: string; dev: boolean; https: boolean; turnstile: boolean }): string {
  const turnstile = input.turnstile ? " https://challenges.cloudflare.com" : ""
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${turnstile}${input.dev ? " 'unsafe-eval'" : ""}`,
    // React and next/font write a few inline style attributes, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.discordapp.com https://*.googleusercontent.com https://avatars.steamstatic.com https://*.steamstatic.com",
    "font-src 'self'",
    `connect-src 'self'${turnstile}${input.dev ? " ws:" : ""}`,
    `frame-src ${input.turnstile ? "https://challenges.cloudflare.com" : "'none'"}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(input.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}
