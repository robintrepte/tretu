import { eq } from "drizzle-orm"
import { audit } from "@/lib/audit"
import { db, sqlClient } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { adminMerge, closeMatches, findUser, formatAccount, formatLegacyList, formatMatches, formatMergePlan, listLegacyAccounts, mergeRefusal, planMerge } from "@/lib/legacy/admin"
import { emitUserEvent } from "@/lib/tretu/events"

/**
 * npm run admin -- roles <username|email>             show roles
 * npm run admin -- grant <username|email> <role>      add a global role (e.g. admin; admins must turn on 2FA)
 * npm run admin -- revoke <username|email> <role>     remove a global role
 * npm run admin -- legacy                             imported old accounts no merge touched yet, with possible matches
 * npm run admin -- merge <from> <into> [--yes]        merge account <from> into <into> (username|email); dry run without --yes
 */
const USAGE = [
  "usage: npm run admin -- roles|grant|revoke <username|email> [role]",
  "       npm run admin -- legacy",
  "       npm run admin -- merge <from: username|email> <into: username|email> [--yes]",
].join("\n")

const REFUSALS = {
  same: "refused: <from> and <into> are the same account",
  fromAdmin: "refused: <from> has the admin role; revoke it first if this account really should go (npm run admin -- revoke <from> admin)",
} as const

const args = process.argv.slice(2)
const yes = args.includes("--yes")
const [command, who, third] = args.filter((a) => a !== "--yes")

async function lookup(name: string) {
  const row = await findUser(db, name)
  if (row) return row
  const close = await closeMatches(db, name)
  console.error(`no user ${name}${close.length ? ` (did you mean: ${formatMatches(close)}?)` : ""}`)
  return null
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
    const refusal = mergeRefusal(from, into)
    if (refusal) {
      console.error(REFUSALS[refusal])
      return 1
    }
    if (!yes) {
      console.log(formatMergePlan(await planMerge(db, from.id, into.id), { dryRun: true }))
      return 0
    }
    const { plan, after } = await adminMerge(db, from, into)
    console.log(formatMergePlan(plan, { dryRun: false }))
    console.log(`\nMerged ${plan.from.username ?? from.id} into ${after.username ?? after.id}. Now:\n${formatAccount(after)}`)
    return 0
  }
  if ((command !== "roles" && command !== "grant" && command !== "revoke") || !who || (command !== "roles" && !third)) {
    if (command && command !== "roles" && command !== "grant" && command !== "revoke") console.error(`unknown command ${command}`)
    console.log(USAGE)
    return 1
  }
  const row = await lookup(who)
  if (!row) return 1
  if (command === "roles") {
    console.log(`${row.displayUsername ?? row.username} (${row.id}): ${row.roles.join(", ") || "–"}`)
    return 0
  }
  const role = third!
  const roles = command === "grant" ? [...new Set([...row.roles, role])] : row.roles.filter((r) => r !== role)
  await db.update(user).set({ roles }).where(eq(user.id, row.id))
  await audit("roles.changed", { userId: row.id, meta: { roles, by: "cli" } })
  await emitUserEvent("user.updated", row.id)
  console.log(`${row.displayUsername ?? row.username}: ${roles.join(", ") || "–"}`)
  return 0
}

let code = 1
try {
  code = await main()
} finally {
  await sqlClient.end()
}
process.exit(code)
