/** Shared settings of the integration tests (the app runs as a child process with this environment). */
export const PORT = 3121
export const PLATFORM_PORT = 3122
export const ISSUER = `http://localhost:${PORT}`
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_auth_test"
export const ADMIN_DATABASE_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres"
export const OUTBOX_DIR = new URL("../../.outbox/integration/", import.meta.url).pathname

export const SAGA_SECRET = "saga-client-secret-0123456789abcdef"
export const PLAY_SECRET = "play-client-secret-0123456789abcdef"
export const APP_SECRETS = { saga: "saga-app-secret-0123456789abcdef", play: "play-app-secret-0123456789abcdef", auth: "auth-app-secret-0123456789abcdef" }

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
    LEGACY_CLAIM_DAYS: "90",
  }
}
