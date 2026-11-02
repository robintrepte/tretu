/**
 * Central admin service layer (src/lib/admin) against a mocked auth admin API that verifies every signature:
 * search, detail, every account mutation with its audit row, wallet adjust / reverse, badge grant / revoke /
 * resync (sync jobs), and the role plumbing (Tretu admin claim, user.updated, locked).
 */
import { closeTestDatabase, resetTestDatabase } from "./helpers/test-db";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";

import { and, eq, sql } from "drizzle-orm";

import { mockUser, startMockAuth, type MockAuth } from "./helpers/mock-auth-admin";
import { db } from "../src/db";
import {
  platformAdminAudit,
  platformBadgeRevocations,
  platformBadgeSync,
  platformJobs,
  platformNotifications,
  platformUserApps,
  platformUserBadges,
  platformUserProgress,
  platformWalletTransactions,
} from "../src/db/platform-schema";
import { authAccounts, authSessions, roles, userRoles, users } from "../src/db/schema";
import { isAccountAdmin, type AdminActor } from "../src/lib/admin/access";
import {
  changeRoles,
  getAccountView,
  lockAccount,
  mergeAccounts,
  previewMerge,
  removeLink,
  resetTwoFactor,
  revokeSessions,
  unlockAccount,
  verifyEmail,
} from "../src/lib/admin/accounts";
import { listAdminAudit } from "../src/lib/admin/audit";
import { authAdmin, AuthAdminError } from "../src/lib/admin/auth-admin";
import { badgeCatalog, badgeHolders, grantBadge, resyncBadges, revokeBadge, syncStatus } from "../src/lib/admin/badges-admin";
import { adminMutationLimiter, AdminError } from "../src/lib/admin/guard";
import { summarizeMerge } from "../src/lib/admin/merge-summary";
import { accountKpis, platformKpis } from "../src/lib/admin/overview";
import { getServiceStatuses } from "../src/lib/admin/service-status";
import { adjustBalance, reverseTransaction, walletOfUser, walletOverview } from "../src/lib/admin/wallet-admin";
import { syncUserAfterSignIn } from "../src/lib/auth/sync";
import { applyTretuRoles, isUserLocked } from "../src/lib/auth/tretu-account";
import { getUserRoles, setUserRoles } from "../src/lib/permissions/checks";
import { platformDb } from "../src/lib/platform/db";
import { upsertDirectoryUser } from "../src/lib/platform/directory";
import { ingestEvents } from "../src/lib/platform/events";
import { lockProgress, settleProgress, incrementStat } from "../src/lib/platform/progress";
import { bookTransaction, peekBalance } from "../src/lib/platform/wallet";
import { clearStatusCache } from "../src/lib/status/read";
import { recordCheck } from "../src/lib/status/store";

const SECRET = "web-secret-for-admin-tests-0123456789";
const ADMIN = "00000000-0000-4000-8000-00000000ad01";
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000f2";
const actor: AdminActor = { userId: 0, sub: ADMIN, name: "Robin" };

let auth: MockAuth;

function idToken(claims: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "RS256" })}.${part({ iss: "https://auth.tretu.de", ...claims })}.c2ln`;
}

async function auditRows(action?: string) {
  return platformDb
    .select()
    .from(platformAdminAudit)
    .where(action ? eq(platformAdminAudit.action, action) : undefined)
    .orderBy(platformAdminAudit.id);
}

/** Last request auth received (path + body). */
const lastRequest = () => auth.requests[auth.requests.length - 1];

async function seedDirectory(sub: string, username: string) {
  await upsertDirectoryUser(platformDb, { sub, username, name: username, roles: [] } as never, new Date(0));
}

async function localUser(sub: string, name: string) {
  const [row] = await db.insert(users).values({ displayName: name, tretuSub: sub }).returning();
  await db.insert(authSessions).values({ token: `tok-${randomUUID()}`, userId: row!.id, expiresAt: new Date(Date.now() + 3600_000) });
  return row!;
}

const sessionCount = async (userId: number) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(authSessions).where(eq(authSessions.userId, userId)))[0]!.n;

before(async () => {
  await resetTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql.raw("truncate users, roles, user_roles, auth_sessions, auth_accounts restart identity cascade"));
  const { PLATFORM_TABLE_NAMES } = await import("../src/db/platform-schema");
  await platformDb.execute(sql.raw(`truncate ${PLATFORM_TABLE_NAMES.join(", ")} restart identity cascade`));
  adminMutationLimiter.reset();
  await auth?.close();
  auth = await startMockAuth({
    secret: SECRET,
    users: [
      mockUser({ sub: ADMIN, username: "robin", name: "Robin", email: "robin@example.org", emailVerified: true, roles: ["admin"], twoFactor: true }),
      mockUser({
        sub: USER,
        username: "lena",
        name: "Lena",
        email: "lena@example.org",
        twoFactor: true,
        links: { discord: "424242", minecraft: "uuid-1", minecraftName: "LenaMC", steam: "76561197960287930" },
        providers: [
          { provider: "credential", accountId: USER, createdAt: "2026-01-01T00:00:00.000Z" },
          { provider: "discord", accountId: "424242", displayName: "lena#0", createdAt: "2026-01-02T00:00:00.000Z" },
          { provider: "steam", accountId: "76561197960287930", displayName: "LenaSteam", createdAt: "2026-01-03T00:00:00.000Z" },
        ],
        sessions: [{ id: "s1", createdAt: "2026-10-01T00:00:00.000Z", expiresAt: "2099-12-01T00:00:00.000Z", ipAddress: "203.0.113.4", client: "saga" }],
        legacyLinks: [{ app: "hollowmere", legacyUserId: "nakama-77", legacyUsername: "lena_old", importedAt: "2026-02-01T00:00:00.000Z", method: "import" }],
      }),
      mockUser({ sub: OTHER, username: "lena_2", name: "Lena 2", email: "lena@example.org", legacyLinks: [{ app: "saga", legacyUserId: "9", legacyUsername: "lena", importedAt: "2026-02-01T00:00:00.000Z", method: "import" }] }),
    ],
  });
  process.env.TRETU_AUTH_ISSUER = auth.url;
  process.env.TRETU_APP_SECRET = SECRET;
  delete process.env.TRETU_APPS_JSON;
  delete process.env.TRETU_ADMIN_FROM_ROLES;
  for (const key of ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "TRETU_BADGE_DISCORD_ROLES_JSON"]) delete process.env[key];
  await seedDirectory(ADMIN, "robin");
  await seedDirectory(USER, "lena");
});

after(async () => {
  await auth?.close();
  await closeTestDatabase();
});

/* --------------------------------- reading --------------------------------- */

test("search and detail go to auth signed as tretu-web, always naming the acting admin", async () => {
  const result = await authAdmin.search(ADMIN, "lena");
  // Exact match first (username "lena"), then the newest.
  assert.deepEqual(result.items.map((u) => u.username), ["lena", "lena_2"]);
  assert.equal(lastRequest()!.app, "tretu-web");
  assert.equal(lastRequest()!.path, `/api/v1/admin/users?q=lena&limit=50&actorSub=${ADMIN}`);

  // Every identifier works (here: the Steam ID); `email` may be null, links carry the TeamSpeak name.
  auth.users.get(USER)!.links.teamspeak = "ts-uid=";
  auth.users.get(USER)!.links.teamspeakName = "LenaTS";
  const bySteam = (await authAdmin.search(ADMIN, "76561197960287930")).items[0];
  assert.equal(bySteam?.sub, USER);
  assert.equal(bySteam?.links.teamspeakName, "LenaTS");
  assert.equal((await authAdmin.search(ADMIN, "lena_2")).items[0]?.email, "lena@example.org");

  // The query is signed exactly as sent: spaces, plus signs, umlauts and slashes survive.
  for (const q of ["Lena 2", "a+b/c?d&e", "Jürgen ~'()!"]) await authAdmin.search(ADMIN, q);
  assert.match(auth.requests.at(-3)!.path, /\?q=Lena\+2&/);

  // Cursor pagination (limit clamped to auth's 1–100).
  const page1 = await authAdmin.search(ADMIN, "lena", { limit: 1 });
  assert.equal(page1.items.length, 1);
  assert.ok(page1.nextCursor);
  const page2 = await authAdmin.search(ADMIN, "lena", { limit: 1, cursor: page1.nextCursor });
  assert.deepEqual(page2.items.map((u) => u.username), ["lena_2"]);
  assert.equal(page2.nextCursor, null);
  await authAdmin.search(ADMIN, "lena", { limit: 500 });
  assert.match(lastRequest()!.path, /limit=100&/);
  await assert.rejects(authAdmin.search(ADMIN, "lena", { cursor: "not-a-cursor" }), (e: unknown) => e instanceof AuthAdminError && e.code === "invalid");

  // A wrong secret is a 401 → "unauthorized" (operator problem), not a crash.
  process.env.TRETU_APP_SECRET = "wrong-secret";
  await assert.rejects(authAdmin.search(ADMIN, "lena"), (e: unknown) => e instanceof AuthAdminError && e.code === "unauthorized");
});

test("reads are refused for actors who are no admin, are locked or have no 2FA", async () => {
  await assert.rejects(authAdmin.stats(OTHER), (e: unknown) => e instanceof AuthAdminError && e.code === "actor_not_admin");
  auth.users.get(ADMIN)!.twoFactor = false;
  await assert.rejects(authAdmin.user(ADMIN, USER), (e: unknown) => e instanceof AuthAdminError && e.code === "actor_two_factor_required");
  assert.deepEqual(await accountKpis(ADMIN), { ok: false, error: "actor_two_factor_required" });
  auth.users.get(ADMIN)!.twoFactor = true;
  Object.assign(auth.users.get(ADMIN)!, { locked: true, lockedUntil: null });
  await assert.rejects(authAdmin.legacy(ADMIN), (e: unknown) => e instanceof AuthAdminError && e.code === "actor_not_admin");
});

test("account view combines auth detail, platform data, app deep links and the hub audit", async () => {
  await platformDb.insert(platformUserApps).values([
    { sub: USER, app: "saga" },
    { sub: USER, app: "hollowmere" },
    { sub: USER, app: "mc-dashboard" },
  ]);
  await lockProgress(platformDb, USER);
  await platformDb.update(platformUserProgress).set({ xp: 350 }).where(eq(platformUserProgress.sub, USER));
  await bookTransaction(platformDb, { sub: USER, app: "saga", idempotencyKey: "k1", kind: "grant", amount: 40, reason: "Test" });

  const view = await getAccountView(actor, USER);
  assert.ok(view.auth.ok);
  const detail = view.auth.user;
  assert.equal(detail.legacyLinks[0]?.legacyUserId, "nakama-77");
  assert.deepEqual(detail.sessions.map((x) => [x.ipAddress, x.client]), [["203.0.113.4", "saga"]]);
  assert.equal(detail.locale, "de");
  assert.deepEqual(
    detail.providers.map((x) => [x.provider, x.accountId, x.displayName]),
    [
      ["password", null, null],
      ["discord", "424242", "lena#0"],
      ["steam", "76561197960287930", "LenaSteam"],
    ]
  );
  assert.equal(lastRequest()!.path, `/api/v1/admin/users/${USER}?actorSub=${ADMIN}`);
  assert.equal(view.platform?.level.level, 3);
  assert.equal(view.platform?.balance, 540); // welcome bonus 500 + 40
  const links = Object.fromEntries(view.apps.map((a) => [a.app, a]));
  assert.equal(links.saga!.url, `https://saga.tretu.de/admin/users?tretuSub=${USER}`);
  assert.equal(links["mc-dashboard"]!.url, `https://mc.tretu.de/admin?tretuSub=${USER}`);
  assert.equal(links.hollowmere!.url, null);
  assert.equal(links.hollowmere!.note, "nakama-77");

  // auth down: the page still renders platform data with a friendly error code.
  auth.failWith = 503;
  const degraded = await getAccountView(actor, USER);
  assert.deepEqual(degraded.auth, { ok: false, error: "unavailable" });
  assert.equal(degraded.platform?.balance, 540);
});

test("auth unreachable or not configured: friendly error codes", async () => {
  process.env.TRETU_AUTH_ISSUER = "http://127.0.0.1:9";
  await assert.rejects(authAdmin.user(ADMIN, USER), (e: unknown) => e instanceof AuthAdminError && e.code === "unavailable");
  delete process.env.TRETU_AUTH_ISSUER;
  await assert.rejects(authAdmin.stats(ADMIN), (e: unknown) => e instanceof AuthAdminError && e.code === "not_configured");
  assert.deepEqual(await accountKpis(ADMIN), { ok: false, error: "not_configured" });
});

/* --------------------------------- mutations ------------------------------- */

test("every account mutation forwards actorSub + reason and writes an audit row", async () => {
  const lena = await localUser(USER, "Lena");
  const reason = "Support-Ticket #12";

  assert.deepEqual(await changeRoles(actor, USER, { add: ["moderator"], reason }), { changed: true, auditDetails: { changed: true } });
  assert.deepEqual(lastRequest()!.body, { actorSub: ADMIN, reason, add: ["moderator"] });
  assert.ok(auth.users.get(USER)!.roles.includes("moderator"));
  await changeRoles(actor, USER, { remove: ["moderator"], reason });
  assert.deepEqual(lastRequest()!.body, { actorSub: ADMIN, reason, remove: ["moderator"] });

  await revokeSessions(actor, USER, { reason });
  assert.equal(lastRequest()!.path, `/api/v1/admin/users/${USER}/sessions/revoke`);
  assert.equal(await sessionCount(lena.id), 0, "tretu.de sessions end too");

  await db.insert(authSessions).values({ token: "again", userId: lena.id, expiresAt: new Date(Date.now() + 3600_000) });
  const until = new Date(Date.now() + 7 * 24 * 3600_000);
  await lockAccount(actor, USER, { reason, until: until.toISOString() });
  assert.deepEqual(lastRequest()!.body, { actorSub: ADMIN, reason, until: until.toISOString() });
  assert.equal(auth.users.get(USER)!.locked, true);
  assert.equal(await sessionCount(lena.id), 0);
  assert.equal(await isUserLocked(db, lena.id), true, "locked locally right away");

  await unlockAccount(actor, USER, { reason });
  assert.equal(auth.users.get(USER)!.locked, false);
  assert.equal(await isUserLocked(db, lena.id), false);

  await resetTwoFactor(actor, USER, { reason });
  assert.equal(auth.users.get(USER)!.twoFactor, false);
  await removeLink(actor, USER, { reason, provider: "minecraft" });
  assert.deepEqual(lastRequest()!.body, { actorSub: ADMIN, reason, provider: "minecraft" });
  await verifyEmail(actor, USER, { reason });
  assert.equal(auth.users.get(USER)!.emailVerified, true);

  const rows = await auditRows();
  assert.deepEqual(
    rows.map((r) => r.action),
    ["account.roles", "account.roles", "account.sessions.revoke", "account.lock", "account.unlock", "account.two_factor.reset", "account.link.remove", "account.email.verify"]
  );
  for (const row of rows) {
    assert.equal(row.actorSub, ADMIN);
    assert.equal(row.targetSub, USER);
    assert.equal(row.details.reason, reason);
    assert.equal(row.details.outcome, "ok");
  }
  assert.equal(rows[3]!.details.until, until.toISOString());
  assert.equal(rows[6]!.details.provider, "minecraft");
  // Every forwarded call was signed by tretu-web.
  assert.ok(auth.requests.every((r) => r.app === "tretu-web"));
  // auth recorded each change in the target's activity log (with the admin and the reason) and on the admin.
  assert.deepEqual(
    auth.users.get(USER)!.audit.map((a) => a.event),
    ["admin.roles_changed", "admin.roles_changed", "admin.sessions_revoked", "admin.locked", "admin.unlocked", "admin.two_factor_reset", "admin.link_removed", "admin.email_verified"]
  );
  assert.equal(auth.users.get(USER)!.audit[3]!.meta!.actorSub, ADMIN);
  assert.equal(auth.users.get(ADMIN)!.audit.filter((a) => a.event === "admin.performed").length, 8);
});

test("a change auth finds nothing to do is answered changed:false and audited here as a no-op", async () => {
  const reason = "Doppelt geklickt";
  const result = await unlockAccount(actor, USER, { reason });
  assert.equal(result.changed, false);
  await removeLink(actor, USER, { reason, provider: "teamspeak" });
  const rows = await auditRows();
  assert.deepEqual(rows.map((r) => [r.action, r.details.outcome]), [
    ["account.unlock", "noop"],
    ["account.link.remove", "noop"],
  ]);
  assert.equal(auth.users.get(USER)!.audit.length, 0, "auth records nothing for changed:false");
});

test("refusals: invalid reason (not audited), self-actions, auth 403/409 (audited as failed), rate limit", async () => {
  await assert.rejects(lockAccount(actor, USER, { reason: " x " }), (e: unknown) => e instanceof AdminError && e.code === "invalid_reason");
  await assert.rejects(lockAccount(actor, ADMIN, { reason: "Test it" }), (e: unknown) => e instanceof AdminError && e.code === "self_action");
  await assert.rejects(changeRoles(actor, ADMIN, { remove: ["admin"], reason: "Test it" }), (e: unknown) => e instanceof AdminError && e.code === "self_action");
  await assert.rejects(lockAccount(actor, USER, { reason: "Test it", until: "2001-01-01T00:00:00Z" }), (e: unknown) => e instanceof AdminError && e.code === "invalid_input");
  assert.equal(auth.requests.length, 0, "nothing reached auth");
  assert.equal((await auditRows()).length, 0);

  // The password is no removable link (refused here, never sent).
  await assert.rejects(removeLink(actor, USER, { reason: "Test it", provider: "password" }), (e: unknown) => e instanceof AdminError && e.code === "invalid_input");
  assert.equal(auth.requests.length, 0);

  // An actor without the admin role at auth: 403 actor_not_admin, recorded as failed.
  const impostor: AdminActor = { userId: 0, sub: OTHER, name: "x" };
  await assert.rejects(lockAccount(impostor, USER, { reason: "Test it" }), (e: unknown) => e instanceof AuthAdminError && e.code === "actor_not_admin");
  // An admin without 2FA: 403 actor_two_factor_required.
  auth.users.get(ADMIN)!.twoFactor = false;
  await assert.rejects(verifyEmail(actor, USER, { reason: "Test it" }), (e: unknown) => e instanceof AuthAdminError && e.code === "actor_two_factor_required");
  auth.users.get(ADMIN)!.twoFactor = true;
  // Last sign-in method: 409.
  auth.users.get(USER)!.providers = [{ provider: "discord", accountId: "424242", createdAt: "2026-01-01T00:00:00.000Z" }];
  await assert.rejects(removeLink(actor, USER, { reason: "Test it", provider: "discord" }), (e: unknown) => e instanceof AuthAdminError && e.code === "last_sign_in_method");
  // No address to verify: 409 no_email.
  auth.users.get(USER)!.email = null;
  await assert.rejects(verifyEmail(actor, USER, { reason: "Test it" }), (e: unknown) => e instanceof AuthAdminError && e.code === "no_email");
  // Merging an admin away: 409 merge_refused.
  await assert.rejects(mergeAccounts(actor, { from: ADMIN, into: USER, reason: "Test it" }), (e: unknown) => e instanceof AuthAdminError && e.code === "merge_refused");
  // Unknown account: 404.
  await assert.rejects(unlockAccount(actor, "00000000-0000-4000-8000-0000000000ff", { reason: "Test it" }), (e: unknown) => e instanceof AuthAdminError && e.code === "not_found");
  const failed = await auditRows();
  assert.deepEqual(failed.map((r) => [r.action, r.details.outcome, r.details.error]), [
    ["account.lock", "failed", "actor_not_admin"],
    ["account.email.verify", "failed", "actor_two_factor_required"],
    ["account.link.remove", "failed", "last_sign_in_method"],
    ["account.email.verify", "failed", "no_email"],
    ["account.merge", "failed", "merge_refused"],
    ["account.unlock", "failed", "not_found"],
  ]);
  auth.users.get(USER)!.email = "lena@example.org";

  // Burst of 10, then rate limited (per admin).
  adminMutationLimiter.reset();
  for (let i = 0; i < 10; i++) await verifyEmail(actor, USER, { reason: "Burst test" });
  await assert.rejects(verifyEmail(actor, USER, { reason: "Burst test" }), (e: unknown) => e instanceof AdminError && e.code === "rate_limited");
});

test("merge: dry-run preview (not audited), then the merge (audited on the surviving account)", async () => {
  const preview = await previewMerge(actor, { from: OTHER, into: USER });
  assert.equal(lastRequest()!.body!.dryRun, true);
  assert.equal(preview.dryRun, true);
  const summary = summarizeMerge(preview.plan);
  assert.deepEqual([summary.from, summary.into], ["@lena_2", "@lena"]);
  assert.deepEqual(summary.move.legacy, ["saga: lena"]);
  assert.deepEqual(summary.drop.providers, ["password"]);
  assert.equal(summary.fromSessions, 0);
  assert.equal((await auditRows()).length, 0);
  assert.equal(auth.users.has(OTHER), true, "a preview changes nothing");

  const merged = await mergeAccounts(actor, { from: OTHER, into: USER, reason: "Gleiche Person (E-Mail)" });
  assert.ok(!merged.dryRun && merged.merged);
  assert.equal(merged.user?.sub, USER);
  assert.equal(lastRequest()!.body!.dryRun, false);
  assert.equal(auth.users.has(OTHER), false);
  const [row] = await auditRows("account.merge");
  assert.equal(row!.targetSub, USER);
  assert.equal(row!.details.from, OTHER);
  assert.deepEqual(row!.details.moved, { providers: [], gameLinks: [], passkeys: 0, legacy: ["saga:9"] });

  await assert.rejects(previewMerge(actor, { from: USER, into: USER }), (e: unknown) => e instanceof AdminError && e.code === "invalid_input");
});

test("legacy list and stats are parsed from auth", async () => {
  const legacy = await authAdmin.legacy(ADMIN);
  assert.equal(lastRequest()!.path, `/api/v1/admin/legacy?actorSub=${ADMIN}`);

  const lena2 = legacy.find((c) => c.sub === OTHER);
  assert.ok(lena2);
  assert.equal(lena2.username, "lena_2");
  assert.deepEqual(lena2.legacy.map((l) => [l.app, l.legacyUsername, l.method]), [["saga", "lena", "import"]]);
  // Same email and the same name up to the `_2` suffix.
  assert.deepEqual(lena2.possibleMatches.map((m) => [m.sub, m.reasons]), [[USER, ["email", "username"]]]);
  assert.ok(legacy.find((c) => c.sub === USER), "the hollowmere import is listed too");

  const kpis = await accountKpis(ADMIN);
  assert.ok(kpis.ok);
  assert.equal(kpis.ok && kpis.stats.users.total, 3);
  assert.equal(kpis.ok && kpis.stats.users.admins, 1);
  // 90 Berlin days, oldest first.
  assert.equal(kpis.ok && kpis.stats.signInsPerDay.length, 90);
  assert.ok(kpis.ok && kpis.stats.signUpsPerDay[0]!.day < kpis.stats.signUpsPerDay[89]!.day);
});

/* ---------------------------------- wallet --------------------------------- */

test("wallet adjust is idempotent per requestId; negatives cannot overdraw; reverse once", async () => {
  const requestId = randomUUID();
  const first = await adjustBalance(actor, { sub: USER, amount: "250", reason: "Gewinnspiel", requestId });
  const again = await adjustBalance(actor, { sub: USER, amount: "250", reason: "Gewinnspiel", requestId });
  assert.equal(first.balance, 750); // welcome 500 + 250
  assert.equal(again.duplicate, true);
  assert.equal(await peekBalance(platformDb, USER), 750);
  const [tx] = await platformDb.select().from(platformWalletTransactions).where(eq(platformWalletTransactions.idempotencyKey, `admin:${requestId}`));
  assert.equal(tx!.kind, "adjust");
  assert.equal(tx!.app, "tretu-web");
  assert.equal(tx!.reason, "Gewinnspiel");

  await assert.rejects(adjustBalance(actor, { sub: USER, amount: -5000, reason: "Zu viel", requestId: randomUUID() }), (e: unknown) => e instanceof AdminError && e.code === "insufficient_funds");
  await assert.rejects(adjustBalance(actor, { sub: USER, amount: "1.5", reason: "Kaputt", requestId: randomUUID() }), (e: unknown) => e instanceof AdminError && e.code === "invalid_input");
  await assert.rejects(adjustBalance(actor, { sub: USER, amount: 5, reason: "Kein Request", requestId: "admin:x" }), (e: unknown) => e instanceof AdminError && e.code === "invalid_input");
  await assert.rejects(adjustBalance(actor, { sub: "unknown-sub", amount: 5, reason: "Unbekannt", requestId: randomUUID() }), (e: unknown) => e instanceof AdminError && e.code === "user_not_found");

  // A spend from Saga is reversed as a refund, exactly once.
  const spend = await bookTransaction(platformDb, { sub: USER, app: "saga", idempotencyKey: "spend-1", kind: "spend", amount: -100, reason: "Abenteuer" });
  const reversed = await reverseTransaction(actor, { transactionId: spend.transactionId, reason: "Fehlbuchung" });
  assert.equal(reversed.balance, 750);
  const [refund] = await platformDb.select().from(platformWalletTransactions).where(eq(platformWalletTransactions.idempotencyKey, `reverse:${spend.transactionId}`));
  assert.equal(refund!.kind, "refund");
  assert.equal(refund!.amount, 100);
  assert.equal(refund!.ref, spend.transactionId);
  await assert.rejects(reverseTransaction(actor, { transactionId: spend.transactionId, reason: "Nochmal" }), (e: unknown) => e instanceof AdminError && e.code === "already_reversed");

  const history = await walletOfUser(platformDb, USER);
  assert.ok(history.reversed.has(spend.transactionId));

  const audit = await auditRows();
  assert.deepEqual(audit.map((r) => [r.action, r.details.outcome]), [
    ["wallet.adjust", "ok"],
    ["wallet.adjust", "ok"],
    ["wallet.adjust", "failed"],
    ["wallet.adjust", "failed"],
    ["wallet.reverse", "ok"],
    ["wallet.reverse", "failed"],
  ]);
  assert.equal(audit[0]!.details.transactionId, first.transactionId);
  assert.equal(audit[1]!.details.duplicate, true);

  const overview = await walletOverview(platformDb);
  assert.equal(overview.totalBalance, 750);
  assert.equal(overview.topHolders[0]?.sub, USER);
  const today = overview.days[overview.days.length - 1]!;
  assert.equal(today.spent, 100);
  assert.ok(today.issued >= 500 + 250 + 100);
});

/* ---------------------------------- badges --------------------------------- */

test("badge grant: XP, credits, notification, sync jobs; revoke: XP back, role revoke job, not re-awarded; resync", async () => {
  process.env.DISCORD_BOT_TOKEN = "bot";
  process.env.DISCORD_GUILD_ID = "1";
  process.env.TRETU_BADGE_DISCORD_ROLES_JSON = JSON.stringify({ "play.first-win": "111" });
  await upsertDirectoryUser(platformDb, { sub: USER, username: "lena", name: "Lena", roles: [], links: { discord: "424242" } } as never, new Date(1));

  await grantBadge(actor, { sub: USER, badge: "play.first-win", reason: "Turniersieg offline" });
  const [badge] = await platformDb.select().from(platformUserBadges).where(eq(platformUserBadges.sub, USER));
  assert.equal(badge!.badgeKey, "play.first-win");
  const [progress] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, USER));
  assert.equal(progress!.xp, 50);
  assert.equal(await peekBalance(platformDb, USER), 520); // welcome 500 + badge 20
  assert.equal((await platformDb.select().from(platformNotifications).where(eq(platformNotifications.sub, USER))).length, 1);
  const jobs = await platformDb.select().from(platformJobs).where(eq(platformJobs.type, "badge.sync.discord"));
  assert.equal(jobs.length, 1);
  await assert.rejects(grantBadge(actor, { sub: USER, badge: "play.first-win", reason: "Doppelt" }), (e: unknown) => e instanceof AdminError && e.code === "already_earned");
  await assert.rejects(grantBadge(actor, { sub: USER, badge: "nope", reason: "Unbekannt" }), (e: unknown) => e instanceof AdminError && e.code === "unknown_badge");

  assert.equal((await badgeCatalog()).find((b) => b.key === "play.first-win")!.holders, 1);
  assert.equal((await badgeHolders(platformDb, "play.first-win")).items[0]!.sub, USER);

  // The role was granted (as the worker would record it).
  await platformDb.insert(platformBadgeSync).values({ sub: USER, badgeKey: "play.first-win", target: "discord", status: "done", grantedTo: "424242", grantedRef: "111" });
  await revokeBadge(actor, { sub: USER, badge: "play.first-win", reason: "Betrug" });
  assert.equal((await platformDb.select().from(platformUserBadges).where(eq(platformUserBadges.sub, USER))).length, 0);
  const [after] = await platformDb.select().from(platformUserProgress).where(eq(platformUserProgress.sub, USER));
  assert.equal(after!.xp, 0);
  assert.equal(after!.level, 1);
  assert.equal(await peekBalance(platformDb, USER), 520, "credits already paid stay");
  const revokes = await platformDb.select().from(platformJobs).where(eq(platformJobs.type, "badge.revoke.discord"));
  assert.equal(revokes.length, 1);
  assert.deepEqual([revokes[0]!.payload.to, revokes[0]!.payload.ref], ["424242", "111"]);
  assert.equal((await platformDb.select().from(platformBadgeSync).where(eq(platformBadgeSync.sub, USER))).length, 0);

  // The rule still holds (a win), but a revoked badge is not awarded again automatically.
  await lockProgress(platformDb, USER);
  await incrementStat(platformDb, USER, "play.games.won", 1);
  await settleProgress(platformDb, USER, { now: new Date() });
  assert.equal((await platformDb.select().from(platformUserBadges).where(eq(platformUserBadges.sub, USER))).length, 0);
  assert.equal((await platformDb.select().from(platformBadgeRevocations)).length, 1);

  // A manual grant lifts the revocation.
  await grantBadge(actor, { sub: USER, badge: "play.first-win", reason: "Doch verdient" });
  assert.equal((await platformDb.select().from(platformBadgeRevocations)).length, 0);
  assert.equal(await peekBalance(platformDb, USER), 520, "badge credits are one-time (same wallet key)");

  // Resync queues a forced sync job per earned, mapped badge.
  const { queued } = await resyncBadges(actor, { sub: USER, reason: "Rolle fehlt in Discord" });
  assert.equal(queued, 1);
  const forced = await platformDb.select().from(platformJobs).where(and(eq(platformJobs.type, "badge.sync.discord"), eq(platformJobs.dedupeKey, `discord:${USER}:play.first-win:force`)));
  assert.equal(forced[0]!.payload.force, true);
  const status = await syncStatus(platformDb, USER);
  assert.equal(status.discordEnabled, true);
  assert.ok(status.pendingJobs.length >= 1);

  assert.deepEqual((await auditRows()).map((r) => [r.action, r.details.outcome]), [
    ["badge.grant", "ok"],
    ["badge.grant", "failed"],
    ["badge.revoke", "ok"],
    ["badge.grant", "ok"],
    ["badge.resync", "ok"],
  ]);
});

/* ------------------------------- role plumbing ----------------------------- */

test("Tretu admin claim grants a tracked local admin, removed without it; local admins are never removed", async () => {
  const [u] = await db.insert(users).values({ displayName: "Tretu" }).returning();
  await db.insert(authAccounts).values({ userId: u!.id, providerId: "tretu", accountId: ADMIN, idToken: idToken({ sub: ADMIN, roles: ["admin"] }) });
  await syncUserAfterSignIn(u!.id, { provider: "tretu", adminFromRoles: true });
  assert.deepEqual(await getUserRoles(u!.id), ["admin"]);
  const [granted] = await db.select().from(userRoles).where(eq(userRoles.userId, u!.id));
  assert.equal(granted!.source, "tretu");
  const [row] = await db.select().from(users).where(eq(users.id, u!.id));
  assert.deepEqual(row!.tretuRoles, ["admin"]);
  assert.equal(isAccountAdmin({ tretuSub: row!.tretuSub, tretuRoles: row!.tretuRoles ?? [], roles: ["admin"] }), true);

  // Team panel edits keep the source of roles that stay.
  await setUserRoles(u!.id, ["admin", "operator"]);
  const sources = await db.select({ key: roles.key, source: userRoles.source }).from(userRoles).innerJoin(roles, eq(roles.id, userRoles.roleId)).where(eq(userRoles.userId, u!.id));
  assert.deepEqual(Object.fromEntries(sources.map((s) => [s.key, s.source])), { admin: "tretu", operator: "local" });

  // Next login without the claim: the Tretu-sourced admin goes, the local operator role stays.
  await db.update(authAccounts).set({ idToken: idToken({ sub: ADMIN, roles: [] }) }).where(eq(authAccounts.userId, u!.id));
  await syncUserAfterSignIn(u!.id, { provider: "tretu", adminFromRoles: true });
  assert.deepEqual(await getUserRoles(u!.id), ["operator"]);

  // A locally granted admin is never removed by the claim.
  const [local] = await db.insert(users).values({ displayName: "Lokal", tretuSub: USER }).returning();
  await setUserRoles(local!.id, ["admin"]);
  assert.equal(await applyTretuRoles(db, local!.id, [], { adminFromRoles: true }), "unchanged");
  assert.deepEqual(await getUserRoles(local!.id), ["admin"]);
  // …and an existing local admin is not downgraded by the claim.
  await applyTretuRoles(db, local!.id, ["admin"], { adminFromRoles: true });
  const [stillLocal] = await db.select().from(userRoles).where(eq(userRoles.userId, local!.id));
  assert.equal(stillLocal!.source, "local");
  // Local admin without the Tretu role: no account admin.
  assert.equal(isAccountAdmin({ tretuSub: USER, tretuRoles: [], roles: ["admin"] }), false);
  assert.equal(isAccountAdmin({ tretuSub: USER, tretuRoles: ["admin"], roles: ["operator"] }), false);
  assert.equal(isAccountAdmin({ tretuSub: null, tretuRoles: ["admin"], roles: ["admin"] }), false);

  // TRETU_ADMIN_FROM_ROLES=false: the claim grants nothing (and removes an earlier Tretu grant).
  process.env.TRETU_ADMIN_FROM_ROLES = "false";
  const [off] = await db.insert(users).values({ displayName: "Off", tretuSub: OTHER }).returning();
  assert.equal(await applyTretuRoles(db, off!.id, ["admin"]), "unchanged");
  assert.deepEqual(await getUserRoles(off!.id), []);
});

test("auth user.updated: admin granted / removed, locked ends hub sessions and refuses new ones, unlock restores", async () => {
  process.env.TRETU_APPS_JSON = JSON.stringify({ auth: { secret: "auth-secret" } });
  const lena = await localUser(USER, "Lena");
  let t = Date.now() - 60_000;
  const event = (data: Record<string, unknown>) => ({
    id: randomUUID(),
    type: "user.updated",
    app: "auth",
    sub: USER,
    occurredAt: new Date((t += 1000)).toISOString(),
    data: { username: "lena", name: "Lena", ...data },
  });

  await ingestEvents([event({ roles: ["admin"], locked: false })]);
  const [granted] = await db.select().from(userRoles).where(eq(userRoles.userId, lena.id));
  assert.equal(granted!.source, "tretu");
  await ingestEvents([event({ roles: [] })]);
  assert.deepEqual(await getUserRoles(lena.id), []);

  await ingestEvents([event({ roles: [], locked: true })]);
  assert.equal(await sessionCount(lena.id), 0);
  assert.equal(await isUserLocked(db, lena.id), true);
  const [row] = await db.select().from(users).where(eq(users.id, lena.id));
  assert.ok(row!.tretuLockedAt);

  await ingestEvents([event({ roles: [], locked: false })]);
  assert.equal(await isUserLocked(db, lena.id), false);

  // A temporary lock ends by itself.
  await ingestEvents([event({ roles: [], locked: true, lockedUntil: new Date(Date.now() - 1000).toISOString() })]);
  assert.equal(await isUserLocked(db, lena.id), false);

  // Users who never signed in here are skipped without error.
  await ingestEvents([{ ...event({ roles: ["admin"], locked: true }), sub: OTHER }]);
});

test("overview KPIs: active users per app and day, badges per day", async () => {
  process.env.TRETU_APPS_JSON = JSON.stringify({ play: { secret: "p" } });
  const now = new Date();
  await ingestEvents([
    { id: randomUUID(), type: "game.finished", app: "play", sub: USER, occurredAt: now.toISOString(), data: { game: "chess", result: "win" } },
    { id: randomUUID(), type: "game.finished", app: "play", sub: ADMIN, occurredAt: now.toISOString(), data: { game: "chess", result: "loss" } },
    { id: randomUUID(), type: "stat.increment", app: "saga", sub: USER, occurredAt: now.toISOString(), data: { key: "saga.turns", by: 1 } },
  ]);
  const kpis = await platformKpis(platformDb, now);
  const play = kpis.apps.find((a) => a.app === "play")!;
  assert.equal(play.daily[play.daily.length - 1]!.users, 2);
  assert.equal(play.weekly, 2);
  assert.equal(play.total, 2);
  assert.equal(kpis.apps.find((a) => a.app === "saga")!.weekly, 1);
  assert.equal(kpis.badgesPerDay[kpis.badgesPerDay.length - 1]!.count, kpis.badgesTotal);
  assert.ok(kpis.badgesTotal >= 1, "play.first-win was awarded");
  assert.equal(kpis.credits.length, 30);
});

test("service status on the overview comes from the status tables (same data as /status)", async () => {
  process.env.TRETU_STATUS_TARGETS_JSON = JSON.stringify([
    { id: "saga", url: "http://127.0.0.1:9/saga" },
    { id: "auth", url: "http://127.0.0.1:9/auth" },
  ]);
  process.env.TRETU_STATUS_MINECRAFT = "mc.example.org:25565";
  for (const key of ["TS_QUERY_HOST", "TRETU_STATUS_TEAMSPEAK"]) delete process.env[key];
  try {
    const now = new Date();
    await recordCheck(platformDb, "saga", { state: "degraded", responseMs: 240, httpStatus: 503, error: "checks:db" }, new Date(now.getTime() - 30_000));
    await recordCheck(platformDb, "minecraft", { state: "up", responseMs: 12, httpStatus: null, error: null, usersOnline: 3, usersMax: 20 }, new Date(now.getTime() - 30_000));
    clearStatusCache();
    const report = await getServiceStatuses(now);
    assert.ok(report.available);
    assert.equal(report.stale, false);
    const byId = Object.fromEntries(report.services.map((x) => [x.id, x]));
    assert.deepEqual(Object.keys(byId), ["saga", "auth", "minecraft"]);
    assert.deepEqual([byId.saga!.name, byId.saga!.state, byId.saga!.detail, byId.saga!.url], ["Saga", "degraded", "240 ms", "https://saga.tretu.de"]);
    assert.deepEqual([byId.auth!.state, byId.auth!.checkedAt, byId.auth!.detail], ["unknown", null, null]);
    assert.deepEqual([byId.minecraft!.state, byId.minecraft!.detail, byId.minecraft!.url], ["up", "3/20 online", null]);
    // Without any check for minutes the worker counts as stopped.
    clearStatusCache();
    const later = await getServiceStatuses(new Date(now.getTime() + 10 * 60_000));
    assert.equal(later.available && later.stale, true);
  } finally {
    delete process.env.TRETU_STATUS_TARGETS_JSON;
    delete process.env.TRETU_STATUS_MINECRAFT;
    clearStatusCache();
  }
});

test("audit log filters: actor, target, action, date and pagination", async () => {
  for (let i = 0; i < 3; i++) await verifyEmail(actor, USER, { reason: `Fall ${i}` });
  await platformDb.insert(platformAdminAudit).values({ actorSub: OTHER, action: "badge.grant", targetSub: ADMIN, details: { reason: "alt", outcome: "ok" }, createdAt: new Date("2026-01-05T10:00:00Z") });

  assert.equal((await listAdminAudit(platformDb, { actor: ADMIN })).items.length, 3);
  assert.equal((await listAdminAudit(platformDb, { target: ADMIN })).items.length, 1);
  assert.equal((await listAdminAudit(platformDb, { action: "account.email.verify" })).items.length, 3);
  assert.equal((await listAdminAudit(platformDb, { from: "2026-01-05", to: "2026-01-05" })).items.length, 1);
  const page1 = await listAdminAudit(platformDb, { limit: 2 });
  assert.equal(page1.items.length, 2);
  assert.ok(page1.nextBefore);
  const page2 = await listAdminAudit(platformDb, { limit: 2, before: page1.nextBefore });
  assert.equal(page2.items.length, 2);
  assert.equal(page2.nextBefore, null);
  assert.equal(page2.items[0]!.actorName, "robin", "names come from the directory");
  assert.equal(page1.items[0]!.actorName, null, "unknown subs stay unnamed");
});

test("auth responses with only the required fields still parse (lenient shapes)", async () => {
  const { adminUserDetailSchema, adminStatsSchema } = await import("../src/lib/admin/auth-admin");
  const user = adminUserDetailSchema.parse({ sub: USER });
  assert.deepEqual([user.roles, user.twoFactor, user.locked, user.providers, user.audit, user.createdAt], [[], false, false, [], [], null]);
  const withAudit = adminUserDetailSchema.parse({ sub: USER, audit: [{ event: "login", createdAt: "2026-10-01T00:00:00Z" }, "garbage"] });
  assert.deepEqual(withAudit.audit.map((a) => a.action), ["login"]);
  // An unknown locale degrades to null instead of failing the page.
  assert.equal(adminUserDetailSchema.parse({ sub: USER, locale: "fr" }).locale, null);
  const stats = adminStatsSchema.parse({ users: { total: 1 } });
  assert.deepEqual([stats.users.admins, stats.signUpsPerDay, stats.providers], [0, [], {}]);
});
