import { CLI_ACTOR } from "@/lib/admin/audit"
import { changeRoles, lockUser, mergeAccounts, unlockUser, type ActionError } from "@/lib/admin/actions"
import { db, sqlClient } from "@/lib/db"
import { closeMatches, findUser, formatAccount, formatLegacyList, formatMatches, formatMergePlan, listLegacyAccounts } from "@/lib/legacy/admin"

/**
 * npm run admin -- roles <username|email>                     show roles
 * npm run admin -- grant <username|email> <role>              add a global role (e.g. admin; admins must turn on 2FA)
 * npm run admin -- revoke <username|email> <role>             remove a global role (never from the last admin)
 * npm run admin -- lock <username|email> [--until=<ISO date>] lock the account (no sign-in, signed out everywhere)
 * npm run admin -- unlock <username|email>                    lift the lock
 * npm run admin -- legacy                                     imported old accounts no merge touched yet, with possible matches
 * npm run admin -- merge <from> <into> [--yes]                merge account <from> into <into> (username|email); dry run without --yes
 *
 * Changes take an optional --reason="…" for the activity log (default "CLI"). The same library functions serve the
 * admin API of tretu.de (lib/admin/actions.ts), with the same guards.
 */
const USAGE = [
  "usage: npm run admin -- roles|grant|revoke <username|email> [role] [--reason=…]",
  "       npm run admin -- lock <username|email> [--until=<ISO date>] [--reason=…]",
  "       npm run admin -- unlock <username|email> [--reason=…]",
  "       npm run admin -- legacy",
  "       npm run admin -- merge <from: username|email> <into: username|email> [--yes] [--reason=…]",
].join("\n")

const REFUSALS: Record<string, string> = {
  same: "refused: <from> and <into> are the same account",
  fromAdmin: "refused: <from> has the admin role; revoke it first if this account really should go (npm run admin -- revoke <from> admin)",
}

const args = process.argv.slice(2)
const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const yes = args.includes("--yes")
const reason = option("reason")?.trim() || "CLI"
const [command, who, third] = args.filter((a) => !a.startsWith("--"))

async function lookup(name: string) {
  const row = await findUser(db, name)
  if (row) return row
  const close = await closeMatches(db, name)
  console.error(`no user ${name}${close.length ? ` (did you mean: ${formatMatches(close)}?)` : ""}`)
  return null
}

function refused(error: ActionError): number {
  console.error(`refused: ${error.message}`)
  return 1
}

async function main(): Promise<number> {
  if (command === "legacy") {
    console.log(formatLegacyList(await listLegacyAccounts(db)))
    return 0
  }
  if (command === "merge") {
    if (!who || !third) {
      console.log(USAGE)
      return 1
    }
    const [from, into] = [await lookup(who), await lookup(third)]
    if (!from || !into) return 1
    const result = await mergeAccounts(db, { actor: CLI_ACTOR, fromId: from.id, intoId: into.id, reason, dryRun: !yes })
    if (!result.ok) {
      if (result.error !== "merge_refused") return refused(result)
      console.error(from.id === into.id ? REFUSALS.same : REFUSALS.fromAdmin)
      return 1
    }
    console.log(formatMergePlan(result.plan, { dryRun: result.dryRun }))
    if (result.after) console.log(`\nMerged ${result.plan.from.username ?? from.id} into ${result.after.username ?? result.after.id}. Now:\n${formatAccount(result.after)}`)
    return 0
  }
  const known = ["roles", "grant", "revoke", "lock", "unlock"]
  if (!command || !known.includes(command) || !who || ((command === "grant" || command === "revoke") && !third)) {
    if (command && !known.includes(command)) console.error(`unknown command ${command}`)
    console.log(USAGE)
    return 1
  }
  const row = await lookup(who)
  if (!row) return 1
  const name = row.displayUsername ?? row.username
  if (command === "roles") {
    console.log(`${name} (${row.id}): ${row.roles.join(", ") || "–"}`)
    return 0
  }
  if (command === "lock") {
    const untilText = option("until")
    const until = untilText ? new Date(untilText) : null
    if (until && (Number.isNaN(until.getTime()) || until.getTime() <= Date.now())) {
      console.error("--until must be a date in the future, e.g. --until=2026-12-31T12:00:00Z")
      return 1
    }
    const result = await lockUser(db, { actor: CLI_ACTOR, targetId: row.id, reason, until })
    if (!result.ok) return refused(result)
    console.log(`${name}: ${result.changed ? "locked" : "already locked"}${until ? ` until ${until.toISOString()}` : ""}`)
    return 0
  }
  if (command === "unlock") {
    const result = await unlockUser(db, { actor: CLI_ACTOR, targetId: row.id, reason })
    if (!result.ok) return refused(result)
    console.log(`${name}: ${result.changed ? "unlocked" : "was not locked"}`)
    return 0
  }
  const role = third!
  const result = await changeRoles(db, { actor: CLI_ACTOR, targetId: row.id, reason, ...(command === "grant" ? { add: [role] } : { remove: [role] }) })
  if (!result.ok) return refused(result)
  console.log(`${name}: ${result.roles.join(", ") || "–"}`)
  return 0
}

let code = 1
try {
  code = await main()
} finally {
  await sqlClient.end()
}
process.exit(code)
