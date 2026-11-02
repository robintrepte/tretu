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
