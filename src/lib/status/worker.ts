/**
 * One round of status checks (scripts/platform-worker.ts runs it every {@link STATUS_CHECK_EVERY_MS}):
 * every configured service in parallel, results stored, state changes posted to Discord.
 */
import { log } from "@/lib/observability/logger";
import { platformDb } from "@/lib/platform/db";
import { alertMessage, discordWebhookUrl, postDiscord } from "@/lib/status/alerts";
import { checkTarget } from "@/lib/status/check";
import { recordCheck } from "@/lib/status/store";
import { statusTargets } from "@/lib/status/targets";
import { SITE_URL } from "@/lib/env";

export const STATUS_CHECK_EVERY_MS = 60_000;

export type StatusTickDeps = {
  /** Used for the health checks and the Discord webhook (tests pass a stub). */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborts running checks on shutdown. */
  signal?: AbortSignal;
};

/** Checks every service once. Returns the number of services checked (0 = checks switched off). */
export async function runStatusTick(now: Date = new Date(), deps: StatusTickDeps = {}): Promise<number> {
  const targets = statusTargets();
  if (!targets.length) return 0;
  const results = await Promise.all(
    targets.map(async (target) => ({
      target,
      result: await checkTarget(target, { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs, signal: deps.signal }),
    }))
  );
  // A shutdown in the middle would record every service as "timeout": keep nothing from this round.
  if (deps.signal?.aborted) return 0;
  const webhook = discordWebhookUrl();
  for (const { target, result } of results) {
    const change = await recordCheck(platformDb, target.id, result, now);
    if (!change) continue;
    log(change.kind === "recovered" ? "info" : "warn", "status.changed", { service: target.id, kind: change.kind, error: change.error });
    if (webhook) await postDiscord(webhook, alertMessage(target, change, now, `${SITE_URL}/status`), deps.fetchImpl);
  }
  return targets.length;
}
