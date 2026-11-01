import assert from "node:assert/strict";
import test from "node:test";

import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import { and, eq } from "drizzle-orm";

import { db } from "../src/db";
import { authAccounts, users } from "../src/db/schema";
import { placeholderEmail, prelinkAccount, readTretuClaims, syncUserAfterSignIn } from "../src/lib/auth/sync";
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

test("existing Discord users are pre-linked for Better Auth (no duplicate user)", async () => {
  const [legacy] = await db.insert(users).values({ discordId: "1001", displayName: "Alt" }).returning();
  await prelinkAccount("discord", "1001", "1001");
  await prelinkAccount("discord", "1001", "1001");
  const accounts = await db.select().from(authAccounts).where(eq(authAccounts.userId, legacy!.id));
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0]!.providerId, "discord");

  // Unknown Discord IDs are left to Better Auth (new user).
  await prelinkAccount("discord", "9999", "9999");
  assert.equal((await db.select().from(authAccounts).where(eq(authAccounts.accountId, "9999"))).length, 0);
});

test("Tretu-Konto matches the local user by the discord_id claim", async () => {
  const [legacy] = await db.insert(users).values({ discordId: "2002", displayName: "Discord-Nutzer" }).returning();
  await prelinkAccount("tretu", "sub-2002", "2002");
  const [account] = await db
    .select()
    .from(authAccounts)
    .where(and(eq(authAccounts.providerId, "tretu"), eq(authAccounts.accountId, "sub-2002")));
  assert.equal(account?.userId, legacy!.id);

  // A second Tretu sub never attaches to the same local user.
  await prelinkAccount("tretu", "other-sub", "2002");
  assert.equal((await db.select().from(authAccounts).where(eq(authAccounts.accountId, "other-sub"))).length, 0);
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

test("Discord sign-in grants admin by Discord ID (as before)", async () => {
  const [user] = await db.insert(users).values({ displayName: "Discord" }).returning();
  await db.insert(authAccounts).values({ userId: user!.id, providerId: "discord", accountId: "6006" });
  await syncUserAfterSignIn(user!.id, { provider: "discord", adminFromRoles: false });
  const [row] = await db.select().from(users).where(eq(users.id, user!.id));
  assert.equal(row!.discordId, "6006");
  assert.deepEqual(await getUserRoles(user!.id), ["admin"]);
});

test("claims parsing ignores garbage and unknown values", () => {
  assert.equal(readTretuClaims(null), null);
  assert.equal(readTretuClaims("not-a-jwt"), null);
  const claims = readTretuClaims(idToken({ sub: "x", locale: "fr", roles: "admin" }));
  assert.equal(claims?.sub, "x");
  assert.equal(claims?.locale, undefined);
  assert.equal(claims?.roles, undefined);
  assert.equal(placeholderEmail("discord", "1"), "discord-1@users.tretu.invalid");
});
