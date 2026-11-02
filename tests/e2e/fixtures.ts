/** Seed data shared by tests/e2e/serve.ts and the specs. */
export const E2E_SECRET = "e2e-secret-e2e-secret-e2e-secret-0123456789";
export const STEAM_ID = "76561197960287930";
export const SESSION_TOKEN = "e2e-session-token-0123456789abcdef";

export const USERS = {
  steamy: { sub: "00000000-0000-4000-8000-0000000000a1", username: "steamy", name: "Steamy" },
  hidden: { sub: "00000000-0000-4000-8000-0000000000a2", username: "hidden", name: "Hidden" },
  owner: { sub: "00000000-0000-4000-8000-0000000000a3", username: "robin", name: "Robin" },
} as const;

export const TS_UID = "e2eTeamSpeakUid+/AAAA=";

/** Services on the e2e status page (URLs are never requested by the page) and their seeded state. */
export const STATUS_TARGETS = [
  { id: "tretu-web", url: "http://127.0.0.1:9/tretu-web" },
  { id: "auth", url: "http://127.0.0.1:9/auth" },
  { id: "saga", url: "http://127.0.0.1:9/saga" },
  { id: "play", url: "http://127.0.0.1:9/play" },
  { id: "hollowmere", url: "http://127.0.0.1:9/hollowmere" },
  { id: "mc-dashboard", url: "http://127.0.0.1:9/mc" },
];
/**
 * mc-dashboard has no data on purpose ("Keine Daten"). The Minecraft row is the default target (mc.tretu.de:25565),
 * the TeamSpeak row appears because serve.ts sets TS_QUERY_* (ServerQuery).
 */
export const STATUS_SEED: Record<string, { now: "up" | "degraded" | "down"; badDay?: boolean; users?: [number, number | null] }> = {
  "tretu-web": { now: "up" },
  auth: { now: "up" },
  saga: { now: "degraded" },
  play: { now: "down", badDay: true },
  hollowmere: { now: "up" },
  minecraft: { now: "up", users: [3, 20] },
  teamspeak: { now: "up", users: [4, null] },
};

/** A signed-in team member without the Tretu admin role (no access to the central admin). */
export const MEMBER_SESSION_TOKEN = "e2e-member-session-token-0123456789";
export const MEMBER_SUB = "00000000-0000-4000-8000-0000000000a4";
/** A second Tretu admin whose Tretu-Konto has no 2FA yet: auth refuses it as actor (`actor_two_factor_required`). */
export const NO2FA_SESSION_TOKEN = "e2e-no2fa-admin-session-token-0123456";
export const NO2FA_SUB = "00000000-0000-4000-8000-0000000000a5";

/** The mocked auth.tretu.de admin API (tests/helpers/mock-auth-admin.ts) and the secret tretu.de signs with. */
export const AUTH_MOCK_PORT = Number(process.env.E2E_AUTH_PORT ?? 3133);
export const AUTH_MOCK_URL = `http://127.0.0.1:${AUTH_MOCK_PORT}`;
export const WEB_SECRET = "e2e-web-secret-0123456789";
