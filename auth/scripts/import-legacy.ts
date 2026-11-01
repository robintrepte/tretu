import path from "node:path"
import { db, sqlClient } from "@/lib/db"
import { formatReport, runImport } from "@/lib/legacy/run"

/**
 * npm run import:legacy -- --dry-run      plan only: prints the report and writes reports/legacy-import-*.json
 * npm run import:legacy                   imports (idempotent: already imported accounts are skipped)
 * Options: --no-events (don't announce imported accounts to the platform), --report-dir <dir>
 *
 * Sources (each optional, read-only): LEGACY_SAGA_DATABASE_URL, LEGACY_PLAY_DATABASE_URL,
 * LEGACY_TRETU_DATABASE_URL, LEGACY_NAKAMA_DATABASE_URL.
 */
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const events = !args.includes("--no-events")
const reportDirIndex = args.indexOf("--report-dir")
const reportDir = reportDirIndex >= 0 && args[reportDirIndex + 1] ? args[reportDirIndex + 1]! : path.join(process.cwd(), "reports")

const sources = {
  saga: process.env.LEGACY_SAGA_DATABASE_URL || undefined,
  play: process.env.LEGACY_PLAY_DATABASE_URL || undefined,
  tretu: process.env.LEGACY_TRETU_DATABASE_URL || undefined,
  nakama: process.env.LEGACY_NAKAMA_DATABASE_URL || undefined,
}
if (!Object.values(sources).some(Boolean)) {
  console.error("No LEGACY_*_DATABASE_URL set: nothing to import.")
  process.exit(1)
}

try {
  const { report, written, reportPath } = await runImport(db, sources, { dryRun, events, reportDir, log: (line) => console.log(`[import] ${line}`) })
  console.log(`\n${formatReport(report)}\n`)
  if (written) console.log(`Written: ${written.created} new Tretu accounts, ${written.joined} existing accounts extended.`)
  if (reportPath) console.log(`Report: ${reportPath}`)
} finally {
  await sqlClient.end()
}
