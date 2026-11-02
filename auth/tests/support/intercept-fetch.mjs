/**
 * TEST ONLY — loaded into the app under test with `NODE_OPTIONS=--import <this file>` by the integration test
 * harness (tests/integration/global-setup.ts), never by `npm start` or PM2. It routes the server's fetches to the
 * identity providers to the local mock (tests/support/provider-mock.ts), so the real provider code runs against
 * a fake Discord/Google/Apple/Steam Web API. Without TRETU_TEST_PROVIDER_MOCK it does nothing.
 */
const target = process.env.TRETU_TEST_PROVIDER_MOCK
const HOSTS = new Set(["discord.com", "oauth2.googleapis.com", "www.googleapis.com", "openidconnect.googleapis.com", "appleid.apple.com", "api.steampowered.com"])

if (target) {
  const original = globalThis.fetch
  globalThis.fetch = async function interceptedFetch(input, init) {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    let url
    try {
      url = new URL(href)
    } catch {
      return original(input, init)
    }
    if (url.protocol !== "https:" || !HOSTS.has(url.host)) return original(input, init)
    const rewritten = `${target}/${url.host}${url.pathname}${url.search}`
    if (typeof input === "object" && !(input instanceof URL)) return original(new Request(rewritten, input), init)
    return original(rewritten, init)
  }
}
