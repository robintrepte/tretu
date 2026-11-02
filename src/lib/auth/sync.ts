import { and, eq, ne, sql } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod";

import { db } from "@/db";
import { authAccounts, users } from "@/db/schema";
import { getDashboardAdminDiscordIds } from "@/lib/env/server";
import { log } from "@/lib/observability/logger";
import { applyTretuRoles } from "@/lib/auth/tretu-account";
import { grantRole } from "@/lib/permissions/checks";

export const TRETU_PROVIDER = "tretu";
/** This app's key in the `legacy_ids` claim (contract §1 app id). */
export const LEGACY_APP_ID = "tretu-web";

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
  /** The old app accounts of this Tretu-Konto (legacy import): here only `tretu-web`, our own `users.id`. */
  legacy_ids: z
    .object({ [LEGACY_APP_ID]: z.string().optional().catch(undefined) })
    .optional()
    .catch(undefined),
});
export type TretuClaims = z.infer<typeof tretuClaimsSchema>;

/** Better Auth needs an email per user; accounts without a usable one get a non-routable placeholder. */
export function placeholderEmail(provider: string, accountId: string): string {
  return `${provider}-${accountId}@users.tretu.invalid`;
}

/** How a Tretu sign-in found its local user (contract §2 match order); `new` = Better Auth creates one. */
export type TretuMatchVia = "account" | "tretu_sub" | "legacy_id" | "discord_id" | "email" | "new";
export type TretuMatch = { userId: number | null; via: TretuMatchVia };

/** A local user may take this sub only while it has no other Tretu-Konto (column or account row). */
async function linkableTo(userId: number, tretuSub: string | null, sub: string): Promise<boolean> {
  if (tretuSub && tretuSub !== sub) return false;
  const [other] = await db
    .select({ id: authAccounts.id })
    .from(authAccounts)
    .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, TRETU_PROVIDER), ne(authAccounts.accountId, sub)))
    .limit(1);
  return !other;
}

/** The legacy id of tretu.de is our integer `users.id`; anything else never matches. */
function legacyUserId(claims: TretuClaims): number | null {
  const raw = claims.legacy_ids?.[LEGACY_APP_ID]?.trim();
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/**
 * Finds the local user of a Tretu sign-in and links it *before* Better Auth looks the account up, so the login lands
 * on that user instead of creating a duplicate. Order (contract §2, Tretu-Konto-only spec):
 * 1. the user already linked to this `sub` (account row, or `users.tretu_sub`);
 * 2. the user whose id is `legacy_ids["tretu-web"]` (legacy import);
 * 3. the user with the `discord_id` claim's Discord ID;
 * 4. the user with the same email, verified on both sides;
 * 5. none: Better Auth creates a new user.
 * Steps 2–4 only take a user that has no other Tretu-Konto. Better Auth's own email linking is off (auth.ts), so
 * nothing else ever attaches a Tretu-Konto to an existing user.
 */
export async function matchTretuLogin(claims: TretuClaims): Promise<TretuMatch> {
  const sub = claims.sub;
  const [account] = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(and(eq(authAccounts.providerId, TRETU_PROVIDER), eq(authAccounts.accountId, sub)))
    .limit(1);
  if (account) return { userId: account.userId, via: "account" };

  const columns = { id: users.id, tretuSub: users.tretuSub };
  const candidates: [Exclude<TretuMatchVia, "account" | "new">, () => Promise<{ id: number; tretuSub: string | null } | undefined>][] = [
    ["tretu_sub", async () => (await db.select(columns).from(users).where(eq(users.tretuSub, sub)).limit(1))[0]],
    [
      "legacy_id",
      async () => {
        const id = legacyUserId(claims);
        return id === null ? undefined : (await db.select(columns).from(users).where(eq(users.id, id)).limit(1))[0];
      },
    ],
    [
      "discord_id",
      async () =>
        claims.discord_id ? (await db.select(columns).from(users).where(eq(users.discordId, claims.discord_id)).limit(1))[0] : undefined,
    ],
    [
      "email",
      async () => {
        const email = claims.email?.trim().toLowerCase();
        if (!email || claims.email_verified !== true) return undefined;
        const [row] = await db
          .select(columns)
          .from(users)
          .where(and(sql`lower(${users.email}) = ${email}`, eq(users.emailVerified, true)))
          .limit(1);
        return row;
      },
    ],
  ];

  for (const [via, find] of candidates) {
    const user = await find();
    if (!user || !(await linkableTo(user.id, user.tretuSub, sub))) continue;
    const [linked] = await db
      .insert(authAccounts)
      .values({ userId: user.id, providerId: TRETU_PROVIDER, accountId: sub })
      .onConflictDoNothing({ target: [authAccounts.providerId, authAccounts.accountId] })
      .returning({ userId: authAccounts.userId });
    if (!linked) {
      // A parallel sign-in of the same sub linked it first: follow that link.
      const [winner] = await db
        .select({ userId: authAccounts.userId })
        .from(authAccounts)
        .where(and(eq(authAccounts.providerId, TRETU_PROVIDER), eq(authAccounts.accountId, sub)))
        .limit(1);
      return { userId: winner?.userId ?? null, via: "account" };
    }
    log("info", "auth.tretu_account_matched", { via, userId: user.id });
    return { userId: user.id, via };
  }
  return { userId: null, via: "new" };
}

/**
 * The email to store for a Tretu sign-in: the claim's address unless another local user already has it (an account
 * the match above refused: unverified on one side or linked to another Tretu-Konto). Then the user gets a
 * placeholder, so Better Auth neither links by email nor runs into the unique email.
 */
export async function tretuUserEmail(claims: TretuClaims, userId: number | null): Promise<{ email: string; emailVerified: boolean }> {
  const placeholder = { email: placeholderEmail(TRETU_PROVIDER, claims.sub), emailVerified: false };
  const email = claims.email?.trim().toLowerCase();
  if (!email) return placeholder;
  const [holder] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  if (holder && holder.id !== userId) return placeholder;
  return { email, emailVerified: claims.email_verified === true };
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
 * Runs after every successful sign-in (Better Auth `hooks.after`): stores Tretu sub and Discord ID (claim) on the
 * user, bumps `updated_at` (last login), applies the Tretu `locale` claim and the admin role (Tretu `admin` claim
 * when `adminFromRoles`, tracked as `source = 'tretu'` and removed again without it; `DASHBOARD_ADMIN_DISCORD_IDS`).
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

  // Tretu login: the `roles` claim decides the Tretu-sourced admin role (granted or taken back).
  if (opts.provider === TRETU_PROVIDER && claims) {
    await applyTretuRoles(db, userId, claims.roles ?? [], { adminFromRoles: opts.adminFromRoles });
  }
  // Admins listed by Discord ID are local admins (never removed automatically).
  if (discordId && getDashboardAdminDiscordIds().includes(discordId)) await grantRole(userId, "admin");

  return { locale: claims?.locale ?? null };
}
