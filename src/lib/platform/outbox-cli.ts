/**
 * `npm run platform:outbox -- status|retry [--app <id>] [--type <t>] [--since <iso>] [--dry-run]` (scripts/platform-outbox.ts):
 * webhook outbox counts per app and state, and re-queueing of failed/expired deliveries. Kept here (not in the
 * script) so tests can run it against the test database.
 */
import { platformDb, type Executor } from "@/lib/platform/db";
import { outboxSummary, retryOutbox, type OutboxFilter } from "@/lib/platform/outbox";

export const OUTBOX_USAGE = `Usage: npm run platform:outbox -- <command> [options]

Commands:
  status   webhook deliveries per app and state (parked = app has no webhook in TRETU_APPS_JSON yet)
  retry    set failed and expired deliveries back to pending (same event ids; rows already pending or
           delivered are never touched, so running it twice is harmless)

Options:
  --app <id>      only this app (e.g. saga)
  --type <type>   only this event type (e.g. user.deleted)
  --since <iso>   only rows created at or after this time (e.g. 2026-11-01 or 2026-11-01T12:00:00Z)
  --dry-run       retry: only count what would be re-queued`;

export type OutboxArgs = { command: "status" | "retry"; filter: OutboxFilter; dryRun: boolean };

/** Parses the command line; throws an Error with a user-facing message on bad input. */
export function parseOutboxArgs(argv: string[]): OutboxArgs {
  const [command, ...rest] = argv;
  if (command !== "status" && command !== "retry") throw new Error(command ? `unknown command: ${command}` : "missing command");
  const filter: OutboxFilter = {};
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    const value = () => {
      const v = rest[++i];
      if (!v || v.startsWith("--")) throw new Error(`${arg} needs a value`);
      return v;
    };
    if (arg === "--app") {
      const app = value();
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(app)) throw new Error(`invalid app id: ${app}`);
      filter.app = app;
    } else if (arg === "--type") {
      const type = value();
      if (!/^[a-z][a-z0-9._-]{0,99}$/.test(type)) throw new Error(`invalid event type: ${type}`);
      filter.type = type;
    } else if (arg === "--since") {
      const raw = value();
      const since = new Date(raw);
      if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(since.getTime())) throw new Error(`invalid --since (ISO date or time expected): ${raw}`);
      filter.since = since;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  if (dryRun && command !== "retry") throw new Error("--dry-run only applies to retry");
  return { command, filter, dryRun };
}

function table(rows: string[][]): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => r.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]!) : cell.padStart(widths[i]!))).join("  ").trimEnd()).join("\n");
}

function describeFilter(filter: OutboxFilter): string {
  const parts = [filter.app && `app=${filter.app}`, filter.type && `type=${filter.type}`, filter.since && `since=${filter.since.toISOString()}`].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

/** Runs one command; returns the exit code (0 ok, 2 usage error). */
export async function runOutboxCommand(argv: string[], out: (line: string) => void, db: Executor = platformDb, now: Date = new Date()): Promise<number> {
  let args: OutboxArgs;
  try {
    args = parseOutboxArgs(argv);
  } catch (error) {
    out(`${error instanceof Error ? error.message : String(error)}\n\n${OUTBOX_USAGE}`);
    return 2;
  }

  if (args.command === "status") {
    const summary = await outboxSummary(db, args.filter);
    out(`Webhook outbox${describeFilter(args.filter)}`);
    if (!summary.length) {
      out("no receiving apps configured (TRETU_APPS_JSON) and no rows");
      return 0;
    }
    const age = (iso: string | null) => {
      if (!iso) return "-";
      const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
      return minutes < 120 ? `${minutes} min` : minutes < 48 * 60 ? `${Math.round(minutes / 60)} h` : `${Math.round(minutes / 1440)} d`;
    };
    out(
      table([
        ["APP", "WEBHOOK", "QUEUED", "RETRYING", "PARKED", "DELIVERED", "FAILED", "EXPIRED", "OLDEST PENDING"],
        ...summary.map((s) => [
          s.app,
          s.webhook ? "yes" : "no",
          String(s.queued),
          String(s.retrying),
          String(s.parked),
          String(s.delivered),
          String(s.failed),
          String(s.expired),
          age(s.oldestPending),
        ]),
      ])
    );
    const parked = summary.filter((s) => s.parked > 0).map((s) => s.app);
    if (parked.length) out(`\nparked: ${parked.join(", ")} – add a webhook to TRETU_APPS_JSON and restart the worker to deliver them (they expire 7 days after creation)`);
    if (summary.some((s) => s.failed + s.expired > 0)) out("re-queue failed/expired deliveries: npm run platform:outbox -- retry [--app <id>]");
    return 0;
  }

  const result = await retryOutbox(db, args.filter, { now, dryRun: args.dryRun });
  const total = Object.values(result.requeued).reduce((n, c) => n + c, 0);
  const per = (map: Record<string, number>) =>
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([app, n]) => `${app}: ${n}`)
      .join(", ");
  out(`${args.dryRun ? "would re-queue" : "re-queued"} ${total} deliver${total === 1 ? "y" : "ies"}${describeFilter(args.filter)}${total ? ` (${per(result.requeued)})` : ""}`);
  if (Object.keys(result.skippedNoWebhook).length) {
    out(`skipped, app has no webhook configured: ${per(result.skippedNoWebhook)}`);
  }
  return 0;
}
