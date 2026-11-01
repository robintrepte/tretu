import { eq, or } from "drizzle-orm"
import { audit } from "@/lib/audit"
import { db, sqlClient } from "@/lib/db"
import { user } from "@/lib/db/schema"
import { emitUserEvent } from "@/lib/tretu/events"

/**
 * npm run admin -- roles <username|email>             show roles
 * npm run admin -- grant <username|email> <role>      add a global role (e.g. admin; admins must turn on 2FA)
 * npm run admin -- revoke <username|email> <role>     remove a global role
 */
const [command, who, role] = process.argv.slice(2)
if (!command || !who || ((command === "grant" || command === "revoke") && !role)) {
  console.log("usage: npm run admin -- roles|grant|revoke <username|email> [role]")
  process.exit(1)
}
const key = who.trim().toLowerCase()
const row = await db.query.user.findFirst({ where: or(eq(user.username, key), eq(user.email, key)) })
if (!row) {
  console.error(`no user ${who}`)
  process.exit(1)
}
if (command === "roles") {
  console.log(`${row.displayUsername ?? row.username} (${row.id}): ${row.roles.join(", ") || "–"}`)
} else if (command === "grant" || command === "revoke") {
  const roles = command === "grant" ? [...new Set([...row.roles, role!])] : row.roles.filter((r) => r !== role)
  await db.update(user).set({ roles }).where(eq(user.id, row.id))
  await audit("roles.changed", { userId: row.id, meta: { roles, by: "cli" } })
  await emitUserEvent("user.updated", row.id)
  console.log(`${row.displayUsername ?? row.username}: ${roles.join(", ") || "–"}`)
} else {
  console.error(`unknown command ${command}`)
  process.exit(1)
}
await sqlClient.end()
