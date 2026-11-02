/**
 * TeamSpeak side of the badge sync, reusing the rank system's ServerQuery client and identity model:
 * the TS rank system identifies a person by the TeamSpeak unique identifier (`client_unique_identifier`,
 * normalised with `normalizeTsUuid`) and assigns server groups by `client_database_id`. Tretu users
 * link that identity once by putting a short code into their TS nickname; we store uid + database id.
 */
import { randomInt } from "node:crypto";

import { eq } from "drizzle-orm";

import { platformTsLinks } from "@/db/platform-schema";
import { getTsRankConfig } from "@/lib/env/server";
import { type Executor } from "@/lib/platform/db";
import { getTsBadgeGroups } from "@/lib/platform/env";
import { conflict, notFound, PlatformError } from "@/lib/platform/errors";
import { normalizeTsUuid } from "@/lib/teamspeak/query-escape";
import { TeamSpeakQueryClient, type TsOnlineClient } from "@/lib/teamspeak/query-client";

export const TS_CODE_TTL_MS = 15 * 60 * 1000;

/** ServerQuery credentials (TS_QUERY_*) are set: enough to remove groups even without a badge mapping. */
export function teamspeakConfigured(): boolean {
  return getTsRankConfig().enabled;
}

/** TS badge groups are on when ServerQuery is configured (TS_QUERY_*) and a badge mapping exists. */
export function teamspeakSyncEnabled(): boolean {
  return getTsRankConfig().enabled && Object.keys(getTsBadgeGroups()).length > 0;
}

export function createTsQueryClient(): TeamSpeakQueryClient | null {
  const config = getTsRankConfig();
  if (!config.enabled) return null;
  return new TeamSpeakQueryClient({
    host: config.queryHost,
    queryPort: config.queryPort,
    username: config.queryUser,
    password: config.queryPassword,
    virtualServerPort: config.virtualServerPort,
    readyTimeoutMs: 8000,
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TeamSpeak query timed out")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function listOnlineTsClients(): Promise<TsOnlineClient[]> {
  const client = createTsQueryClient();
  if (!client) throw new PlatformError(503, "teamspeak_unavailable");
  try {
    await withTimeout(client.connect(1), 10_000);
    return await withTimeout(client.clientList(), 10_000);
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export type TsLinkState = {
  linked: boolean;
  nickname: string | null;
  code: string | null;
  codeExpiresAt: string | null;
};

export async function getTsLinkState(db: Executor, sub: string, now: Date = new Date()): Promise<TsLinkState> {
  const [row] = await db.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1);
  const codeValid = Boolean(row?.verifyCode && row.codeExpiresAt && row.codeExpiresAt.getTime() > now.getTime());
  return {
    linked: Boolean(row?.verifiedAt && row.tsUid),
    nickname: row?.tsNickname ?? null,
    code: codeValid ? (row?.verifyCode ?? null) : null,
    codeExpiresAt: codeValid ? (row?.codeExpiresAt?.toISOString() ?? null) : null,
  };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function startTsLink(db: Executor, sub: string, now: Date = new Date()): Promise<{ code: string; expiresAt: string }> {
  let code = "TRT-";
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  const expiresAt = new Date(now.getTime() + TS_CODE_TTL_MS);
  await db
    .insert(platformTsLinks)
    .values({ sub, verifyCode: code, codeExpiresAt: expiresAt, updatedAt: now })
    .onConflictDoUpdate({ target: platformTsLinks.sub, set: { verifyCode: code, codeExpiresAt: expiresAt, updatedAt: now } });
  return { code, expiresAt: expiresAt.toISOString() };
}

/** Finds the online TS client whose nickname contains the user's code and links that identity. */
export async function verifyTsLink(
  db: Executor,
  sub: string,
  now: Date = new Date(),
  listClients: () => Promise<TsOnlineClient[]> = listOnlineTsClients
): Promise<{ nickname: string }> {
  const [row] = await db.select().from(platformTsLinks).where(eq(platformTsLinks.sub, sub)).limit(1);
  if (!row?.verifyCode || !row.codeExpiresAt || row.codeExpiresAt.getTime() <= now.getTime()) {
    throw new PlatformError(410, "code_expired", "Start the linking again.");
  }
  const code = row.verifyCode.toUpperCase();
  const match = (await listClients()).find((c) => c.nickname.toUpperCase().includes(code));
  if (!match) throw notFound("ts_client_not_found", "No TeamSpeak client with that code in its nickname is online.");
  const uid = normalizeTsUuid(match.uniqueIdentifier);
  const [taken] = await db.select({ sub: platformTsLinks.sub }).from(platformTsLinks).where(eq(platformTsLinks.tsUid, uid)).limit(1);
  if (taken && taken.sub !== sub) throw conflict("ts_identity_taken", "This TeamSpeak identity is linked to another account.");
  const nickname = match.nickname.replace(new RegExp(code, "ig"), "").replace(/[\s\-_|]+$/, "").trim() || match.nickname;
  await db
    .update(platformTsLinks)
    .set({
      tsUid: uid,
      tsClientDbId: match.clientDatabaseId,
      tsNickname: nickname,
      verifiedAt: now,
      verifyCode: null,
      codeExpiresAt: null,
      updatedAt: now,
    })
    .where(eq(platformTsLinks.sub, sub));
  return { nickname };
}

/** Removes the link; returns the client database id that was linked (for taking back granted groups). */
export async function unlinkTs(db: Executor, sub: string): Promise<string | null> {
  const [row] = await db.delete(platformTsLinks).where(eq(platformTsLinks.sub, sub)).returning();
  return row?.verifiedAt && row.tsClientDbId ? String(row.tsClientDbId) : null;
}
