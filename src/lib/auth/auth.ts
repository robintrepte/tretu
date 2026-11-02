import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";

import { db } from "@/db";
import { authAccounts, authSessions, authVerifications, users } from "@/db/schema";
import { AUTH_BASE_URL, AUTH_COOKIE_PREFIX, AUTH_SIGNING_SECRET, getTretuAuthConfig } from "@/lib/auth/config";
import {
  matchTretuLogin,
  syncUserAfterSignIn,
  TRETU_PROVIDER,
  tretuClaimsSchema,
  tretuUserEmail,
} from "@/lib/auth/sync";
import { isUserLocked } from "@/lib/auth/tretu-account";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_MANUAL_COOKIE } from "@/i18n/config";
import { log } from "@/lib/observability/logger";

/** The only sign-in. Missing config: production does not start (instrumentation.ts), development shows a notice. */
const tretu = getTretuAuthConfig();

const SESSION_DAYS = 30;

function providerFromPath(path: string, params: Record<string, string> | undefined): string | null {
  if (path.startsWith("/callback/")) return params?.id ?? path.slice("/callback/".length);
  if (path.startsWith("/oauth2/callback/")) return params?.providerId ?? path.slice("/oauth2/callback/".length);
  return null;
}

const options = {
  appName: "Tretu",
  baseURL: AUTH_BASE_URL,
  secret: AUTH_SIGNING_SECRET,
  trustedOrigins: [AUTH_BASE_URL],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications },
  }),
  user: {
    // Better Auth's user model *is* the existing `users` table.
    fields: { name: "displayName", image: "avatarUrl" },
    additionalFields: {
      discordId: { type: "string", required: false, input: false },
      tretuSub: { type: "string", required: false, input: false },
      locale: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: SESSION_DAYS * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  account: {
    // Existing users are matched (and linked) by matchTretuLogin before Better Auth looks; it never links by email itself.
    accountLinking: { enabled: true, disableImplicitLinking: true, requireLocalEmailVerified: true },
  },
  // Per client IP (nginx overwrites X-Forwarded-For with the real address). In-memory: one tretu-web process.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production" && process.env.AUTH_RATE_LIMIT !== "off",
    window: 60,
    max: 120,
    customRules: {
      "/sign-in/*": { window: 60, max: 10 },
      "/oauth2/*": { window: 60, max: 20 },
      "/callback/*": { window: 60, max: 20 },
    },
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    // Keep the integer primary keys of `users` (and every table that references them).
    database: { generateId: "serial" },
  },
  databaseHooks: {
    session: {
      create: {
        // A locked Tretu-Konto (auth `user.updated` with `locked: true`) gets no new session. Better Auth then
        // redirects to /login?error=unable_to_create_session.
        async before(session) {
          const userId = Number(session.userId);
          if (Number.isInteger(userId) && (await isUserLocked(db, userId))) {
            log("info", "auth.session_refused_locked", { userId });
            return false;
          }
        },
      },
    },
  },
  // Only "Mit Tretu-Konto anmelden"; profile data is owned by the Tretu-Konto.
  disabledPaths: [
    "/update-user",
    "/delete-user",
    "/change-email",
    "/sign-up/email",
    "/sign-in/email",
    "/link-social",
    "/unlink-account",
  ],
  onAPIError: { errorURL: "/login" },
  plugins: [
    ...(tretu
      ? [
          genericOAuth({
            config: [
              {
                providerId: TRETU_PROVIDER,
                name: "Tretu-Konto",
                discoveryUrl: tretu.discoveryUrl,
                clientId: tretu.clientId,
                clientSecret: tretu.clientSecret,
                scopes: ["openid", "profile", "email", "offline_access", "tretu"],
                pkce: true,
                requireIdTokenVerification: true,
                redirectURI: tretu.redirectUri,
                postLogoutRedirectURI: `${AUTH_BASE_URL}/`,
                overrideUserInfo: true,
                async mapProfileToUser(profile) {
                  const claims = tretuClaimsSchema.safeParse(profile);
                  if (!claims.success) return {};
                  const c = claims.data;
                  const match = await matchTretuLogin(c);
                  return {
                    name: c.name || c.preferred_username || "Tretu",
                    image: c.picture,
                    ...(await tretuUserEmail(c, match.userId)),
                  };
                },
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const session = ctx.context.newSession;
      if (!session) return;
      const provider = providerFromPath(ctx.path, ctx.params as Record<string, string> | undefined);
      try {
        const { locale } = await syncUserAfterSignIn(Number(session.user.id), {
          provider,
          adminFromRoles: tretu?.adminFromRoles ?? false,
        });
        // Apply the Tretu-Konto language unless the visitor picked one here (language switcher).
        if (locale && !ctx.getCookie(LOCALE_MANUAL_COOKIE)) {
          ctx.setCookie(LOCALE_COOKIE, locale, {
            path: "/",
            maxAge: LOCALE_COOKIE_MAX_AGE,
            sameSite: "lax",
            httpOnly: false,
            secure: AUTH_BASE_URL.startsWith("https://"),
          });
        }
      } catch (error) {
        // Never block a login on the profile sync; it runs again on the next login.
        log("error", "auth.sign_in_sync_failed", { error: error instanceof Error ? error.message : "unknown" });
      }
    }),
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

export type AuthSession = typeof auth.$Infer.Session;
