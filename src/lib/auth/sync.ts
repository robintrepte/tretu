import { and, eq, ne } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod";

import { db } from "@/db";
import { authAccounts, users } from "@/db/schema";
import { getDashboardAdminDiscordIds } from "@/lib/env/server";
import { log } from "@/lib/observability/logger";
import { grantRole } from "@/lib/permissions/checks";

export const DISCORD_PROVIDER = "discord";
export const TRETU_PROVIDER = "tretu";

/** Claims of auth.tretu.de that matter here (contract §2). Unknown claims are ignored. */
export const tretuClaimsSchema = z.object({
  sub: z.string().min(1),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  picture: z.string().optional(),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  locale: z.enum(["de", "en"]).optional().catch(undefined),
  roles: z.array(z.string()).optional().catch(undefined),
  discord_id: z.string().optional().catch(undefined),
});
export type TretuClaims = z.infer<typeof tretuClaimsSchema>;

/** Better Auth needs an email per user; Discord accounts without one get a non-routable placeholder. */
export function placeholderEmail(provider: string, accountId: string): string {
  return `${provider}-${accountId}@users.tretu.invalid`;
}

/**
 * Links a provider account to an existing local user *before* Better Auth looks the account up, so
 * the login lands on that user instead of creating a duplicate:
 * - Discord: users that existed before Better Auth (matched by `users.discord_id`).
 * - Tretu-Konto: users whose Discord ID equals the `discord_id` claim (contract §2).
 * Verified-email matching is left to Better Auth's own account linking.
 */
export async function prelinkAccount(providerId: string, accountId: string, discordId: string | undefined) {
  if (!accountId || !discordId) return;
  const [existing] = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.providerId, providerId), eq(authAccounts.accountId, accountId)))
    .limit(1);
  if (existing) return;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.discordId, discordId)).limit(1);
  if (!user) return;

  if (providerId === TRETU_PROVIDER) {
    // One Tretu-Konto per local user: never attach a second sub to the same person.
    const [other] = await db
      .select({ id: authAccounts.id })
      .from(authAccounts)
      .where(and(eq(authAccounts.userId, user.id), eq(authAccounts.providerId, TRETU_PROVIDER)))
      .limit(1);
    if (other) return;
  }

  await db
    .insert(authAccounts)
    .values({ userId: user.id, providerId, accountId })
    .onConflictDoNothing({ target: [authAccounts.providerId, authAccounts.accountId] });
  log("info", "auth.account_prelinked", { providerId, userId: user.id });
}

export function readTretuClaims(idToken: string | null | undefined): TretuClaims | null {
  if (!idToken) return null;
  try {
    const parsed = tretuClaimsSchema.safeParse(decodeJwt(idToken));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type SignInSyncResult = { locale: "de" | "en" | null };

/**
 * Runs after every successful sign-in (Better Auth `hooks.after`): stores Discord ID / Tretu sub on the
 * user, bumps `updated_at` (last login), applies the Tretu `locale` claim and grants admin rights.
 */
export async function syncUserAfterSignIn(
  userId: number,
  opts: { provider: string | null; adminFromRoles: boolean }
): Promise<SignInSyncResult> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { locale: null };
  const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, userId));
  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

  let discordId = user.discordId;
  const discordAccount = accounts.find((a) => a.providerId === DISCORD_PROVIDER);
  if (!discordId && discordAccount) discordId = discordAccount.accountId;

  const tretuAccount = accounts.find((a) => a.providerId === TRETU_PROVIDER);
  const claims = opts.provider === TRETU_PROVIDER ? readTretuClaims(tretuAccount?.idToken) : null;
  if (tretuAccount && user.tretuSub !== tretuAccount.accountId) updates.tretuSub = tretuAccount.accountId;
  if (!discordId && claims?.discord_id) discordId = claims.discord_id;
  if (claims?.locale) updates.locale = claims.locale;

  if (discordId && discordId !== user.discordId) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.discordId, discordId), ne(users.id, userId)))
      .limit(1);
    if (!taken) updates.discordId = discordId;
    else discordId = user.discordId;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  const adminByDiscord = Boolean(discordId && getDashboardAdminDiscordIds().includes(discordId));
  const adminByRoles = opts.adminFromRoles && Boolean(claims?.roles?.includes("admin"));
  if (adminByDiscord || adminByRoles) await grantRole(userId, "admin");

  return { locale: claims?.locale ?? null };
}
