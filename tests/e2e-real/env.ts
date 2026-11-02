/**
 * Settings shared by the real hub + auth e2e (tests/e2e-real/serve.ts starts both, the spec drives them).
 * Plain http on loopback: auth allows an http issuer on localhost in non-production test setups, and the two
 * apps use different hosts (`localhost` / `127.0.0.1`) so their cookies never mix.
 */
import path from "node:path";

export const ROOT = path.resolve(__dirname, "../..");
export const AUTH_DIR = path.join(ROOT, "auth");

export const AUTH_PORT = Number(process.env.E2E_REAL_AUTH_PORT ?? 3141);
export const HUB_PORT = Number(process.env.E2E_REAL_HUB_PORT ?? 3142);
export const AUTH_URL = `http://localhost:${AUTH_PORT}`;
export const HUB_URL = `http://127.0.0.1:${HUB_PORT}`;

export const AUTH_DATABASE_URL = process.env.E2E_REAL_AUTH_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_auth_test_admin_real";
export const HUB_DATABASE_URL = process.env.E2E_REAL_HUB_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_web_test_admin_real";
export const ADMIN_DATABASE_URL = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres";

/** Test-only secrets (never used anywhere else). */
export const SECRETS = {
  /** tretu.de's app secret (contract §3): signs the admin API calls, known to auth via TRETU_APPS_JSON. */
  web: "e2e-real-tretu-web-app-secret-0123456789",
  /** auth's app secret: signs the user events auth sends to the platform. */
  auth: "e2e-real-auth-app-secret-0123456789abcd",
  /** The OIDC client secret of `tretu-web` at auth. */
  client: "e2e-real-tretu-web-oidc-client-secret-0123",
  authSession: "e2e-real-auth-better-auth-secret-0123456789",
  hubSession: "e2e-real-hub-auth-secret-0123456789abcdefgh",
};

/** auth writes its emails here as JSON instead of sending them. */
export const MAIL_DIR = path.join(ROOT, "test-results", "e2e-real-mail");
