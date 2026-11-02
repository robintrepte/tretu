import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Db } from "@/lib/db"
import { applyPlan, loadAnchors } from "./apply"
import { buildReport, planImport, type ImportReport, type LegacyRecord } from "./plan"
import { readNakama, readPlay, readSaga, readTretu } from "./sources"

export interface ImportSources {
  saga?: string
  play?: string
  tretu?: string
  nakama?: string
}

/**
 * The whole legacy import: read every configured source (read-only), plan the merges against the existing
 * Tretu accounts, write a report and, unless `dryRun`, the accounts.
 */
export async function runImport(db: Db, sources: ImportSources, options: { dryRun: boolean; events?: boolean; reportDir?: string; log?: (line: string) => void }) {
  const log = options.log ?? (() => {})
  const records: LegacyRecord[] = []
  const counts: ImportReport["sources"] = {}
  if (sources.saga) {
    const list = await readSaga(sources.saga)
    records.push(...list)
    counts.saga = { read: list.length, skipped: 0 }
  }
  if (sources.play) {
    const { records: list, skipped } = await readPlay(sources.play)
    records.push(...list)
    counts.play = { read: list.length + skipped, skipped }
  }
  if (sources.tretu) {
    const list = await readTretu(sources.tretu)
    records.push(...list)
    counts["tretu-web"] = { read: list.length, skipped: 0 }
  }
  if (sources.nakama) {
    const { records: list, skipped } = await readNakama(sources.nakama)
    records.push(...list)
    counts.hollowmere = { read: list.length + skipped, skipped }
  }
  log(`read ${records.length} legacy accounts from ${Object.keys(counts).join(", ") || "no sources"}`)

  const { anchors } = await loadAnchors(db)
  const plan = planImport(records, anchors)
  const report = buildReport(plan, counts, options.dryRun, records)

  let written: { created: number; joined: number } | null = null
  if (!options.dryRun) written = await applyPlan(db, plan.groups, { events: options.events })

  let reportPath: string | null = null
  if (options.reportDir) {
    await mkdir(options.reportDir, { recursive: true })
    reportPath = path.join(options.reportDir, `legacy-import-${options.dryRun ? "dry-run-" : ""}${report.generatedAt.replace(/[:.]/g, "-")}.json`)
    await writeFile(reportPath, JSON.stringify(report, null, 2))
  }
  return { report, plan, written, reportPath }
}

export function formatReport(report: ImportReport): string {
  const lines = [
    `Legacy import ${report.dryRun ? "(DRY RUN, nothing written)" : ""}`.trim(),
    "",
    "Sources:",
    ...Object.entries(report.sources).map(([app, c]) => `  ${app.padEnd(12)} ${String(c.read).padStart(6)} read, ${c.skipped} skipped (guests/system)`),
    "",
    `Legacy accounts:        ${report.totals.records}`,
    `Tretu accounts planned: ${report.totals.groups} (${report.totals.newUsers} new, ${report.totals.joinedExisting} joining existing accounts)`,
    `Merged groups:          ${report.totals.mergedGroups}`,
    `Skipped:                ${report.totals.skipped}`,
    "",
    `Conflicts (${report.conflicts.length}):`,
    ...count(report.conflicts.map((c) => c.kind)).map(([kind, n]) => `  ${kind.padEnd(28)} ${n}`),
  ]
  if (report.merges.length) {
    lines.push("", "Merges (first 20):")
    for (const m of report.merges.slice(0, 20)) lines.push(`  ${m.username.padEnd(24)} ${m.reasons.join("+").padEnd(22)} ${m.records.join(", ")}`)
  }
  const usernameConflicts = report.conflicts.filter((c) => c.kind === "username")
  if (usernameConflicts.length) {
    lines.push("", "Username conflicts (first 20, free rename on first login):")
    for (const c of usernameConflicts.slice(0, 20)) lines.push(`  ${c.detail}   (${c.records.join(", ")})`)
  }
  if (report.legacyRoles.length) {
    lines.push("", `Accounts with roles in the old apps (grant global roles by hand: npm run admin -- grant <user> admin): ${report.legacyRoles.length}`)
  }
  return lines.join("\n")
}

function count(values: string[]): [string, number][] {
  const map = new Map<string, number>()
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
  return [...map]
}
