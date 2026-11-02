import assert from "node:assert/strict";
import test from "node:test";

import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db";
import { authAccounts, users } from "../src/db/schema";
import {
  matchTretuLogin,
  placeholderEmail,
  readTretuClaims,
  syncUserAfterSignIn,
  tretuClaimsSchema,
  tretuUserEmail,
} from "../src/lib/auth/sync";
import { getUserRoles } from "../src/lib/permissions/checks";

/** ID token as stored by Better Auth after verification (the signature is irrelevant for reading claims). */
function idToken(claims: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload = { iss: "https://auth.tretu.de", iat: Math.floor(Date.now() / 1000), ...claims };
  return `${part({ alg: "RS256", typ: "JWT" })}.${part(payload)}.c2lnbmF0dXJl`;
}

test.before(async () => {
  await resetTestDatabase();
});

test.after(async () => {
  await closeTestDatabase();
});

const tretuAccountOf = async (sub: string) =>
  (await db.select().from(authAccounts).where(and(eq(authAccounts.providerId, "tretu"), eq(authAccounts.accountId, sub))))[0];
const claimsOf = (claims: Record<string, unknown>) => tretuClaimsSchema.parse(claims);

test("Tretu sign-in: an existing link wins, then users.tretu_sub", async () => {
  const [linked] = await db.insert(users).values({ displayName: "Verknüpft", discordId: "1101" }).returning();
  await db.insert(authAccounts).values({ userId: linked!.id, providerId: "tretu", accountId: "sub-1101" });
  // Even a legacy id or Discord ID of someone else never moves an existing link.
  assert.deepEqual(await matchTretuLogin(claimsOf({ sub: "sub-1101", discord_id: "nobody", legacy_ids: { "tretu-web": "999999" } })), {
    userId: linked!.id,
    via: "account",
  });

  // A user that only has the column (e.g. the row was cleaned up) gets its account row back.
  const [column] = await db.insert(users).values({ displayName: "Spalte", tretuSub: "sub-1102" }).returning();
  assert.deepEqual(await matchTretuLogin(claimsOf({ sub: "sub-1102" })), { userId: column!.id, via: "tretu_sub" });
  assert.equal((await tretuAccountOf("sub-1102"))?.userId, column!.id);
});

test("Tretu sign-in: legacy_ids[tretu-web] before the Discord ID and the email", async () => {
  const [old] = await db.insert(users).values({ displayName: "Altkonto" }).returning();
  const [byDiscord] = await db.insert(users).values({ displayName: "Discord", discordId: "1201" }).returning();
  const [byEmail] = await db.insert(users).values({ displayName: "Mail", email: "legacy-order@example.org", emailVerified: true }).returning();
  const claims = claimsOf({
    sub: "sub-1201",
    discord_id: "1201",
    email: "Legacy-Order@example.org",
    email_verified: true,
    legacy_ids: { "tretu-web": String(old!.id), saga: "77" },
  });
  assert.deepEqual(await matchTretuLogin(claims), { userId: old!.id, via: "legacy_id" });
  assert.equal((await tretuAccountOf("sub-1201"))?.userId, old!.id);
  // The next sign-in follows the link; the other candidates stay untouched.
  assert.deepEqual(await matchTretuLogin(claims), { userId: old!.id, via: "account" });
  assert.equal((await db.select().from(authAccounts).where(eq(authAccounts.userId, byDiscord!.id))).length, 0);
  assert.equal((await db.select().from(authAccounts).where(eq(authAccounts.userId, byEmail!.id))).length, 0);
});

test("Tretu sign-in: legacy id of a user linked to another Tretu-Konto falls through to the Discord ID", async () => {
  const [taken] = await db.insert(users).values({ displayName: "Vergeben", tretuSub: "sub-other-1301" }).returning();
  const [discord] = await db.insert(users).values({ displayName: "Discord", discordId: "1301" }).returning();
  const match = await matchTretuLogin(claimsOf({ sub: "sub-1301", discord_id: "1301", legacy_ids: { "tretu-web": String(taken!.id) } }));
  assert.deepEqual(match, { userId: discord!.id, via: "discord_id" });
  assert.equal((await db.select().from(users).where(eq(users.id, taken!.id)))[0]!.tretuSub, "sub-other-1301");

  // A second Tretu sub never attaches to the same local user (account row instead of the column).
  assert.deepEqual(await matchTretuLogin(claimsOf({ sub: "sub-1301-b", discord_id: "1301" })), { userId: null, via: "new" });
  assert.equal(await tretuAccountOf("sub-1301-b"), undefined);
});

test("Tretu sign-in: garbage legacy ids never match", async () => {
  for (const value of ["", "abc", "-1", "0", "1.5", "99999999999", "1e3"]) {
    assert.deepEqual(await matchTretuLogin(claimsOf({ sub: `sub-garbage-${value}`, legacy_ids: { "tretu-web": value } })), {
      userId: null,
      via: "new",
    });
  }
  // A non-object claim is ignored, not an error.
  assert.equal(claimsOf({ sub: "x", legacy_ids: "7" }).legacy_ids, undefined);
});

test("Tretu sign-in: email only when verified on both sides and not linked elsewhere", async () => {
  const [verified] = await db.insert(users).values({ displayName: "Bestätigt", email: "both@example.org", emailVerified: true }).returning();
  await db.insert(users).values({ displayName: "Unbestätigt", email: "local-unverified@example.org", emailVerified: false });
  await db.insert(users).values({ displayName: "Fremd", email: "elsewhere@example.org", emailVerified: true, tretuSub: "sub-elsewhere" });

  // Unverified claim: no match, and the new user must not take the address.
  const unverifiedClaim = claimsOf({ sub: "sub-1401-a", email: "both@example.org", email_verified: false });
  assert.deepEqual(await matchTretuLogin(unverifiedClaim), { userId: null, via: "new" });
  assert.deepEqual(await tretuUserEmail(unverifiedClaim, null), { email: placeholderEmail("tretu", "sub-1401-a"), emailVerified: false });

  for (const [sub, email] of [
    ["sub-1401-b", "local-unverified@example.org"],
    ["sub-1401-c", "elsewhere@example.org"],
  ] as const) {
    const claims = claimsOf({ sub, email, email_verified: true });
    assert.deepEqual(await matchTretuLogin(claims), { userId: null, via: "new" });
    assert.equal((await tretuUserEmail(claims, null)).email, placeholderEmail("tretu", sub));
  }

  const claims = claimsOf({ sub: "sub-1401-d", email: "BOTH@example.org", email_verified: true });
  assert.deepEqual(await matchTretuLogin(claims), { userId: verified!.id, via: "email" });
  assert.deepEqual(await tretuUserEmail(claims, verified!.id), { email: "both@example.org", emailVerified: true });

  // A brand-new address is kept as sent; no email at all gets the placeholder.
  assert.deepEqual(await tretuUserEmail(claimsOf({ sub: "sub-1401-e", email: "new@example.org", email_verified: true }), null), {
    email: "new@example.org",
    emailVerified: true,
  });
  assert.equal((await tretuUserEmail(claimsOf({ sub: "sub-1401-f" }), null)).email, placeholderEmail("tretu", "sub-1401-f"));
});

test("sign-in sync stores tretu_sub, applies locale and grants admin from roles only when enabled", async () => {
  const [user] = await db.insert(users).values({ discordId: "3003", displayName: "Rollen" }).returning();
  await db.insert(authAccounts).values({
    userId: user!.id,
    providerId: "tretu",
    accountId: "sub-3003",
    idToken: idToken({ sub: "sub-3003", locale: "en", roles: ["admin"], discord_id: "3003" }),
  });

  const off = await syncUserAfterSignIn(user!.id, { provider: "tretu", adminFromRoles: false });
  assert.equal(off.locale, "en");
  let [row] = await db.select().from(users).where(eq(users.id, user!.id));
  assert.equal(row!.tretuSub, "sub-3003");
  assert.equal(row!.locale, "en");
  assert.deepEqual(await getUserRoles(user!.id), []);

  await syncUserAfterSignIn(user!.id, { provider: "tretu", adminFromRoles: true });
  assert.deepEqual(await getUserRoles(user!.id), ["admin"]);
  [row] = await db.select().from(users).where(eq(users.id, user!.id));
  assert.ok(row!.updatedAt.getTime() > 0);
});

test("Tretu-only users get their Discord ID from the claim, admins from DASHBOARD_ADMIN_DISCORD_IDS", async () => {
  process.env.DASHBOARD_ADMIN_DISCORD_IDS = "5005, 6006";
  const [user] = await db.insert(users).values({ displayName: "Neu", email: "neu@example.org" }).returning();
  await db.insert(authAccounts).values({
    userId: user!.id,
    providerId: "tretu",
    accountId: "sub-5005",
    idToken: idToken({ sub: "sub-5005", discord_id: "5005" }),
  });
  await syncUserAfterSignIn(user!.id, { provider: "tretu", adminFromRoles: false });
  const [row] = await db.select().from(users).where(eq(users.id, user!.id));
  assert.equal(row!.discordId, "5005");
  assert.deepEqual(await getUserRoles(user!.id), ["admin"]);
});

test("claims parsing ignores garbage and unknown values", () => {
  assert.equal(readTretuClaims(null), null);
  assert.equal(readTretuClaims("not-a-jwt"), null);
  const claims = readTretuClaims(idToken({ sub: "x", locale: "fr", roles: "admin" }));
  assert.equal(claims?.sub, "x");
  assert.equal(claims?.locale, undefined);
  assert.equal(claims?.roles, undefined);
  assert.equal(placeholderEmail("tretu", "1"), "tretu-1@users.tretu.invalid");
});

test("the Tretu-Konto configuration is required: missing variables are named, production refuses to start", async () => {
  const { assertTretuAuthConfigured, missingTretuAuthEnv } = await import("../src/lib/auth/config");
  const full = { TRETU_AUTH_ISSUER: "https://auth.tretu.de", TRETU_AUTH_CLIENT_ID: "tretu-web", TRETU_AUTH_CLIENT_SECRET: "s3cret" };
  assert.deepEqual(missingTretuAuthEnv(full), []);
  assert.doesNotThrow(() => assertTretuAuthConfigured(full));
  assert.deepEqual(missingTretuAuthEnv({ ...full, TRETU_AUTH_CLIENT_SECRET: "  " }), ["TRETU_AUTH_CLIENT_SECRET"]);
  assert.deepEqual(missingTretuAuthEnv({}), ["TRETU_AUTH_ISSUER", "TRETU_AUTH_CLIENT_ID", "TRETU_AUTH_CLIENT_SECRET"]);
  assert.throws(() => assertTretuAuthConfigured({ TRETU_AUTH_ISSUER: "https://auth.tretu.de" }), /TRETU_AUTH_CLIENT_ID, TRETU_AUTH_CLIENT_SECRET must be set/);
});
