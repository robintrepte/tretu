/**
 * Readable summary of auth's merge plan (`POST /api/v1/admin/merge` → `plan`, built by `planMerge` in
 * auth/lib/legacy/admin.ts): which sign-in methods, game links, passkeys and old-app links move from `from` to
 * `into`, and which are dropped because `into` already has one of the same kind.
 */
import type { MergePlan } from "@/lib/admin/auth-admin";

export type MergeSummary = {
  from: string;
  into: string;
  move: { providers: string[]; gameLinks: string[]; passkeys: number; legacy: string[] };
  drop: { providers: string[]; gameLinks: string[] };
  /** Sessions of `from` that end with the merge. */
  fromSessions: number;
  /** `from` was used with an app (the apps drop that local user on `user.deleted`). */
  fromUsedByApps: boolean;
};

type Provider = MergePlan["move"]["providers"][number];
type GameLink = MergePlan["move"]["gameLinks"][number];

const provider = (p: Provider) => (p.providerId === "credential" ? "password" : p.displayName ? `${p.providerId} (${p.displayName})` : p.providerId);
const game = (g: GameLink) => (g.displayName ? `${g.provider} (${g.displayName})` : g.provider);
const name = (a: MergePlan["from"]) => (a.username ? `@${a.username}` : (a.email ?? a.id));

export function summarizeMerge(plan: MergePlan): MergeSummary {
  return {
    from: name(plan.from),
    into: name(plan.into),
    move: {
      providers: plan.move.providers.map(provider),
      gameLinks: plan.move.gameLinks.map(game),
      passkeys: plan.move.passkeys.length,
      legacy: plan.move.legacy.map((l) => `${l.app}: ${l.legacyUsername ?? l.legacyUserId}`),
    },
    drop: { providers: plan.drop.providers.map(provider), gameLinks: plan.drop.gameLinks.map(game) },
    fromSessions: plan.from.sessions,
    fromUsedByApps: plan.from.usedByApps,
  };
}
