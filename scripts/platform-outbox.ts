/**
 * Webhook outbox admin (needs DATABASE_URL and TRETU_APPS_JSON, read from .env.local like the worker):
 *   npm run platform:outbox -- status [--app saga] [--type user.deleted] [--since 2026-11-01]
 *   npm run platform:outbox -- retry  [--app saga] [--type …] [--since …] [--dry-run]
 * See src/lib/platform/outbox-cli.ts.
 */
import { closePlatformDb, isPlatformDbConfigured } from "@/lib/platform/db";
import { OUTBOX_USAGE, runOutboxCommand } from "@/lib/platform/outbox-cli";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes("-h") || argv.includes("--help")) {
    console.log(OUTBOX_USAGE);
    return argv.length ? 0 : 2;
  }
  if (!isPlatformDbConfigured()) {
    console.error("set DATABASE_URL");
    return 2;
  }
  try {
    return await runOutboxCommand(argv, (line) => console.log(line));
  } finally {
    await closePlatformDb();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
);
