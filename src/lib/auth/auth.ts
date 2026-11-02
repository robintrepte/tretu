import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";

import { db } from "@/db";
import { authAccounts, authSessions, authVerifications, users } from "@/db/schema";
import {
  AUTH_BASE_URL,
  AUTH_COOKIE_PREFIX,
  AUTH_SIGNING_SECRET,
  getLoginProviders,
  getTretuAuthConfig,
} from "@/lib/auth/config";
import {
  DISCORD_PROVIDER,
  placeholderEmail,
  prelinkAccount,
  syncUserAfterSignIn,
  TRETU_PROVIDER,
  tretuClaimsSchema,
} from "@/lib/auth/sync";
import { AUTH_DISCORD_CLIENT_ID, AUTH_DISCORD_CLIENT_SECRET } from "@/lib/env/server";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, LOCALE_MANUAL_COOKIE } from "@/i18n/config";
import { log } from "@/lib/observability/logger";

const tretu = getTretuAuthConfig();
const providers = getLoginProviders();

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
    accountLinking: { enabled: true, requireLocalEmailVerified: true },
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
  // Only social sign-in is offered; profile data is owned by Discord / the Tretu-Konto.
  disabledPaths: ["/update-user", "/delete-user", "/change-email", "/sign-up/email", "/sign-in/email"],
  onAPIError: { errorURL: "/login" },
  socialProviders: providers.discord
    ? {
        discord: {
          clientId: AUTH_DISCORD_CLIENT_ID,
          clientSecret: AUTH_DISCORD_CLIENT_SECRET,
          // Refresh display name and avatar from Discord on every login (as before).
          overrideUserInfoOnSignIn: true,
          async mapProfileToUser(profile) {
            await prelinkAccount(DISCORD_PROVIDER, profile.id, profile.id);
            return profile.email ? {} : { email: placeholderEmail(DISCORD_PROVIDER, profile.id), emailVerified: false };
          },
        },
      }
    : {},
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
                  await prelinkAccount(TRETU_PROVIDER, c.sub, c.discord_id);
                  return {
                    name: c.name || c.preferred_username || "Tretu",
                    image: c.picture,
                    ...(c.email
                      ? { email: c.email, emailVerified: c.email_verified === true }
                      : { email: placeholderEmail(TRETU_PROVIDER, c.sub), emailVerified: false }),
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
