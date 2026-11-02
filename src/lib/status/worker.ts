/**
 * One round of status checks (scripts/platform-worker.ts runs it every {@link STATUS_CHECK_EVERY_MS}):
 * every configured service in parallel, results stored, state changes posted to Discord.
 */
import { log } from "@/lib/observability/logger";
import { platformDb } from "@/lib/platform/db";
import { alertMessage, discordWebhookUrl, postDiscord } from "@/lib/status/alerts";
import { checkTarget, type CheckResult } from "@/lib/status/check";
import { checkMinecraft, checkTcp, checkTeamspeakQuery, type TsStatusClient } from "@/lib/status/game";
import { runCertTick } from "@/lib/status/certs";
import { recordCheck } from "@/lib/status/store";
import { maintenanceActive, statusTargets, type StatusTarget } from "@/lib/status/targets";
import { SITE_URL } from "@/lib/env";

export const STATUS_CHECK_EVERY_MS = 60_000;

export type StatusTickDeps = {
  /** Used for the health checks and the Discord webhook (tests pass a stub). */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborts running checks on shutdown. */
  signal?: AbortSignal;
  /** ServerQuery client factory (tests pass a stub). */
  createTsClient?: () => TsStatusClient | null;
};

/** Runs the check that fits the target. Never throws. */
export function runCheck(target: StatusTarget, deps: StatusTickDeps = {}): Promise<CheckResult> {
  const options = { timeoutMs: deps.timeoutMs, signal: deps.signal };
  switch (target.kind) {
    case "http":
      return checkTarget(target, { ...options, fetchImpl: deps.fetchImpl });
    case "minecraft":
      return checkMinecraft(target.address, options);
    case "teamspeak":
      return target.mode === "query" || !target.address
        ? checkTeamspeakQuery({ ...options, createClient: deps.createTsClient })
        : checkTcp(target.address, options);
  }
}

/**
 * Checks every service once. Returns the number of services checked (0 = checks switched off). Services in
 * maintenance are checked and stored as usual, but never alert.
 */
export async function runStatusTick(now: Date = new Date(), deps: StatusTickDeps = {}): Promise<number> {
  const targets = statusTargets();
  if (!targets.length) return 0;
  const results = await Promise.all(
    targets.map(async (target) => ({
      target,
      result: await runCheck(target, deps),
    }))
  );
  // A shutdown in the middle would record every service as "timeout": keep nothing from this round.
  if (deps.signal?.aborted) return 0;
  const webhook = discordWebhookUrl();
  for (const { target, result } of results) {
    const change = await recordCheck(platformDb, target.id, result, now, { silent: maintenanceActive(target.maintenance, now) });
    if (!change) continue;
    log(change.kind === "recovered" ? "info" : "warn", "status.changed", { service: target.id, kind: change.kind, error: change.error });
    if (webhook) await postDiscord(webhook, alertMessage(target, change, now, `${SITE_URL}/status`), deps.fetchImpl);
  }
  return targets.length;
}

/** Hourly: certificate expiry warnings for every HTTPS target not in maintenance (src/lib/status/certs.ts). */
export function runCertificateTick(now: Date = new Date(), deps: StatusTickDeps = {}): Promise<number> {
  const targets = statusTargets().filter((t) => !maintenanceActive(t.maintenance, now));
  return runCertTick(platformDb, targets, now, { timeoutMs: deps.timeoutMs, signal: deps.signal, fetchImpl: deps.fetchImpl });
}
