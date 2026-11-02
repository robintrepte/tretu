/** The Content Security Policy for every page (built per request with a fresh nonce in proxy.ts). */
export function buildCsp(input: { nonce: string; dev: boolean; https: boolean; turnstile: boolean; umamiSrc?: string }): string {
  const umamiOrigin = input.umamiSrc ? safeOrigin(input.umamiSrc) : null
  const turnstile = input.turnstile ? " https://challenges.cloudflare.com" : ""
  const umami = umamiOrigin ? ` ${umamiOrigin}` : ""
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${input.nonce}' 'strict-dynamic'${turnstile}${umami}${input.dev ? " 'unsafe-eval'" : ""}`,
    // React and next/font write a few inline style attributes, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.discordapp.com https://*.googleusercontent.com https://avatars.steamstatic.com https://*.steamstatic.com",
    "font-src 'self'",
    `connect-src 'self'${turnstile}${umami}${input.dev ? " ws:" : ""}`,
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

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null
  } catch {
    return null
  }
}
