/**
 * TeamSpeak as a linked account of the Tretu-Konto. The nickname-code link on /einstellungen is the
 * only way to prove a TeamSpeak identity, so tretu.de registers it at auth.tretu.de
 * (`POST /api/v1/links {sub, provider:"teamspeak", providerAccountId:<uid>, displayName}`) and removes it
 * on unlink (`DELETE /api/v1/links {sub, provider:"teamspeak"}`), signed as `tretu-web` (contract §2/§3).
 *
 * Both are durable `auth.link.teamspeak` / `auth.unlink.teamspeak` jobs (retried like webhooks). The jobs
 * check the local state when they run, so link → unlink → link in quick succession converges. A `409`
 * (the identity belongs to another Tretu-Konto) undoes the local link, takes back badge groups and tells
 * the user. The other direction: auth's `user.updated` without (or with another) `links.teamspeak`
 * unlinks locally ({@link applyAuthTeamspeakLink}).
 */
import { and, eq } from "drizzle-orm";

import { platformJobs, platformTsLinks, type PlatformUserLinks } from "@/db/platform-schema";
import { log } from "@/lib/observability/logger";
import { enqueueBadgeResync, releaseStaleGrants } from "@/lib/platform/badge-sync";
import { inTransaction, type Executor } from "@/lib/platform/db";
import { AuthUnavailableError, authAdminConfigured, authRequest, getDirectoryUser } from "@/lib/platform/directory";
import { translate } from "@/lib/platform/i18n-core";
import { enqueueJob, type JobOutcome, type JobRow } from "@/lib/platform/jobs";
import { PlatformError } from "@/lib/platform/errors";
import { createNotification } from "@/lib/platform/notifications";
import { unlinkTs, verifyTsLink } from "@/lib/platform/teamspeak";
import type { TsOnlineClient } from "@/lib/teamspeak/query-client";

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export const TS_PROVIDER = "teamspeak";
/** Error code stored on the link (and shown on /einstellungen) when auth refused the identity. */
export const TS_TAKEN_AT_AUTH = "ts_identity_taken_auth";

export type AuthSyncResult = { status: "ok" } | { status: "conflict" } | { status: "off" } | { status: "retry"; error: string };

async function callAuth(method: "POST" | "DELETE", body: Record<string, unknown>, fetchImpl: FetchLike): Promise<AuthSyncResult> {
  if (!authAdminConfigured()) return { status: "off" };
  try {
    const res = await authRequest(method, "/api/v1/links", body, fetchImpl);
    if (res.ok) return { status: "ok" };
    if (res.status === 409 && method === "POST") return { status: "conflict" };
    // Nothing to remove at auth.
    if (res.status === 404 && method === "DELETE") return { status: "ok" };
    if (res.status === 401) log("error", "platform.ts_auth_link.unauthorized", { method });
    return { status: "retry", error: `auth answered ${res.status}` };
  } catch (error) {
    if (error instanceof AuthUnavailableError) return { status: "off" };
    return { status: "retry", error: error instanceof Error ? error.name : "request failed" };
  }
}

async function verifiedLink(db: Executor, sub: string) {
  const [row] = await db.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1);
  return row?.verifiedAt && row.tsUid ? row : null;
}

function linkDedupeKey(sub: string, uid: string) {
  return `auth.link.teamspeak:${sub}:${uid}`;
}

/** Queues the registration at auth (no-op when the auth admin API is not configured). */
export async function enqueueTsAuthLink(db: Executor, sub: string, uid: string, nickname: string | null): Promise<void> {
  if (!authAdminConfigured()) return;
  await enqueueJob(db, { type: "auth.link.teamspeak", payload: { sub, uid, nickname }, dedupeKey: linkDedupeKey(sub, uid), sub });
}

export async function enqueueTsAuthUnlink(db: Executor, sub: string): Promise<void> {
  if (!authAdminConfigured()) return;
  await enqueueJob(db, { type: "auth.unlink.teamspeak", payload: { sub }, sub });
}

/**
 * Undoes a local link that auth refused (409): the identity is unlinked (with a reason for the
 * settings page), badge groups granted to it are taken back and the user gets a notification.
 * Only when the link still points at `uid` (the user may have re-linked meanwhile).
 */
export async function undoRefusedTsLink(db: Executor, sub: string, uid: string, now: Date = new Date()): Promise<boolean> {
  return inTransaction(db, async (tx) => {
    const [row] = await tx
      .select()
      .from(platformTsLinks)
      .where(and(eq(platformTsLinks.sub, sub), eq(platformTsLinks.tsUid, uid)))
      .for("update");
    if (!row) return false;
    await tx
      .update(platformTsLinks)
      .set({ tsUid: null, tsClientDbId: null, tsNickname: null, verifiedAt: null, verifyCode: null, codeExpiresAt: null, linkError: TS_TAKEN_AT_AUTH, updatedAt: now })
      .where(eq(platformTsLinks.sub, sub));
    await releaseStaleGrants(tx, { sub, target: "teamspeak", previousIdentity: row.tsClientDbId ? String(row.tsClientDbId) : null });
    const locale = (await getDirectoryUser(tx, sub))?.locale ?? "de";
    await createNotification(tx, {
      sub,
      app: "platform",
      type: "teamspeak",
      title: translate(locale, "settings.teamspeakRefusedTitle"),
      body: translate(locale, `settings.teamspeakErrors.${TS_TAKEN_AT_AUTH}`),
      url: "/einstellungen#teamspeak",
      now,
    });
    log("info", "platform.ts_auth_link.refused", {});
    return true;
  });
}

/**
 * Registers the current link at auth right away (called by the settings route after a successful
 * verification so the user sees a refusal immediately). On success the queued job is marked done.
 */
export async function registerTsLinkNow(db: Executor, sub: string, fetchImpl: FetchLike = fetch): Promise<AuthSyncResult> {
  const link = await verifiedLink(db, sub);
  if (!link?.tsUid) return { status: "ok" };
  const result = await callAuth("POST", { sub, provider: TS_PROVIDER, providerAccountId: link.tsUid, displayName: link.tsNickname ?? link.tsUid }, fetchImpl);
  if (result.status === "conflict") await undoRefusedTsLink(db, sub, link.tsUid);
  if (result.status === "ok") {
    await db
      .update(platformJobs)
      .set({ status: "done", finishedAt: new Date(), lockedUntil: null })
      .where(and(eq(platformJobs.dedupeKey, linkDedupeKey(sub, link.tsUid)), eq(platformJobs.status, "pending")));
  }
  return result;
}

/** Job `auth.link.teamspeak` {sub, uid, nickname}. */
export async function tsAuthLinkJob(db: Executor, job: JobRow, fetchImpl: FetchLike = fetch): Promise<JobOutcome> {
  const sub = String(job.payload.sub ?? "");
  const uid = String(job.payload.uid ?? "");
  const link = await verifiedLink(db, sub);
  // Unlinked or re-linked to another identity meanwhile: a later job carries the current state.
  if (!link || link.tsUid !== uid) return { status: "done" };
  const nickname = typeof job.payload.nickname === "string" && job.payload.nickname ? job.payload.nickname : uid;
  const result = await callAuth("POST", { sub, provider: TS_PROVIDER, providerAccountId: uid, displayName: nickname }, fetchImpl);
  if (result.status === "retry") return result;
  if (result.status === "conflict") await undoRefusedTsLink(db, sub, uid);
  return { status: "done" };
}

/** Job `auth.unlink.teamspeak` {sub}. */
export async function tsAuthUnlinkJob(db: Executor, job: JobRow, fetchImpl: FetchLike = fetch): Promise<JobOutcome> {
  const sub = String(job.payload.sub ?? "");
  // Linked again meanwhile: the link job registers the new identity (POST replaces it at auth).
  if (await verifiedLink(db, sub)) return { status: "done" };
  const result = await callAuth("DELETE", { sub, provider: TS_PROVIDER }, fetchImpl);
  return result.status === "retry" ? result : { status: "done" };
}

/**
 * auth's `user.updated` changed `links.teamspeak` away from the identity linked here (the user
 * unlinked TeamSpeak in Mein Konto): unlink locally and take back badge groups. Only acts on a change
 * away from what auth had before, so an event that predates our own registration changes nothing.
 */
export async function applyAuthTeamspeakLink(
  tx: Executor,
  sub: string,
  previous: PlatformUserLinks | null | undefined,
  current: PlatformUserLinks
): Promise<boolean> {
  const before = previous?.teamspeak;
  if (!before || before === current.teamspeak) return false;
  const [link] = await tx.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1);
  if (!link?.verifiedAt || link.tsUid !== before) return false;
  const previousIdentity = link.tsClientDbId ? String(link.tsClientDbId) : null;
  await tx.delete(platformTsLinks).where(eq(platformTsLinks.sub, sub));
  await releaseStaleGrants(tx, { sub, target: "teamspeak", previousIdentity });
  return true;
}

/**
 * The whole "Prüfen" step of /einstellungen: verify the nickname code, move badge groups to the new
 * identity, register the link at auth (durable job + immediate attempt). Throws `409
 * ts_identity_taken_auth` when auth refused it (the local link is then already undone).
 */
export async function completeTsLink(
  db: Executor,
  sub: string,
  options: { now?: Date; listClients?: () => Promise<TsOnlineClient[]>; fetchImpl?: FetchLike } = {}
): Promise<{ nickname: string }> {
  const { nickname, uid } = await verifyTsLink(db, sub, options.now ?? new Date(), options.listClients);
  // Groups granted to a previously linked identity are taken back, the new one gets them.
  await releaseStaleGrants(db, { sub, target: "teamspeak" });
  await enqueueTsAuthLink(db, sub, uid, nickname);
  const registered = await registerTsLinkNow(db, sub, options.fetchImpl);
  if (registered.status === "conflict") {
    throw new PlatformError(409, TS_TAKEN_AT_AUTH, "This TeamSpeak identity is linked to another Tretu-Konto.");
  }
  await enqueueBadgeResync(db, sub, "teamspeak");
  return { nickname };
}

/** "Verknüpfung lösen": unlink locally, take back badge groups, remove the link at auth (job). */
export async function removeTsLink(db: Executor, sub: string): Promise<void> {
  const previous = await unlinkTs(db, sub);
  await releaseStaleGrants(db, { sub, target: "teamspeak", previousIdentity: previous });
  if (previous) await enqueueTsAuthUnlink(db, sub);
}
