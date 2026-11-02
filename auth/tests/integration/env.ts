import { pathToFileURL } from "node:url"
import { MOCK_CLIENTS } from "../support/provider-mock"

/** Shared settings of the integration tests (the app runs as a child process with this environment). */
export const PORT = 3121
export const PLATFORM_PORT = 3122
/** Discord/Google/Apple/Steam Web API mock (tests/support/provider-mock.ts) and the Steam OpenID stub. */
export const PROVIDER_MOCK_PORT = 3123
export const STEAM_STUB_PORT = 3124
export const PROVIDER_MOCK = `http://127.0.0.1:${PROVIDER_MOCK_PORT}`
export const STEAM_STUB = `http://127.0.0.1:${STEAM_STUB_PORT}`
export const STEAM_ENDPOINT = `${STEAM_STUB}/openid/login`
const PRELOAD = pathToFileURL(new URL("../support/intercept-fetch.mjs", import.meta.url).pathname).href
export const ISSUER = `http://localhost:${PORT}`
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_auth_test"
export const ADMIN_DATABASE_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres"
export const OUTBOX_DIR = new URL("../../.outbox/integration/", import.meta.url).pathname

export const SAGA_SECRET = "saga-client-secret-0123456789abcdef"
export const PLAY_SECRET = "play-client-secret-0123456789abcdef"
export const APP_SECRETS = { saga: "saga-app-secret-0123456789abcdef", play: "play-app-secret-0123456789abcdef", auth: "auth-app-secret-0123456789abcdef", "tretu-web": "tretu-web-app-secret-0123456789ab" }

export const CLIENTS = {
  saga: {
    type: "confidential",
    secret: SAGA_SECRET,
    name: "Saga",
    redirectUris: ["http://localhost:3038/api/auth/oauth2/callback/tretu"],
    postLogoutRedirectUris: ["http://localhost:3038/"],
  },
  play: {
    type: "confidential",
    secret: PLAY_SECRET,
    name: "Play",
    redirectUris: ["http://localhost:3030/api/auth/oauth2/callback/tretu"],
  },
  hollowmere: {
    type: "public",
    name: "Hollowmere",
    redirectUris: ["https://hollowmere.tretu.de/auth/callback", "http://127.0.0.1/callback"],
  },
}

export function appEnv(): Record<string, string> {
  return {
    NODE_ENV: "production",
    PORT: String(PORT),
    DATABASE_URL: TEST_DATABASE_URL,
    TRETU_AUTH_ISSUER: ISSUER,
    BETTER_AUTH_SECRET: "integration-secret-integration-secret-123",
    MAIL_OUTBOX_DIR: OUTBOX_DIR,
    AUTH_RATE_LIMIT: "off",
    AUTH_HIBP: "off",
    TRETU_OAUTH_CLIENTS_JSON: JSON.stringify(CLIENTS),
    TRETU_APPS_JSON: JSON.stringify(Object.fromEntries(Object.entries(APP_SECRETS).map(([id, secret]) => [id, { secret }]))),
    TRETU_PLATFORM_URL: `http://127.0.0.1:${PLATFORM_PORT}`,
    TRETU_APP_SECRET: APP_SECRETS.auth,
    DISCORD_CLIENT_ID: MOCK_CLIENTS.discord.id,
    DISCORD_CLIENT_SECRET: MOCK_CLIENTS.discord.secret,
    GOOGLE_CLIENT_ID: MOCK_CLIENTS.google.id,
    GOOGLE_CLIENT_SECRET: MOCK_CLIENTS.google.secret,
    APPLE_CLIENT_ID: MOCK_CLIENTS.apple.id,
    APPLE_CLIENT_SECRET: MOCK_CLIENTS.apple.secret,
    STEAM_LOGIN: "true",
    STEAM_OPENID_ENDPOINT: STEAM_ENDPOINT,
    STEAM_WEB_API_KEY: "steam-web-api-test-key",
    // Test-only: the preload routes the server's provider fetches to the mock (see tests/support/intercept-fetch.mjs).
    TRETU_TEST_PROVIDER_MOCK: PROVIDER_MOCK,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${PRELOAD}`.trim(),
  }
}
