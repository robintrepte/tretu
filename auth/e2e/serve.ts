import { spawn, spawnSync } from "node:child_process"
import { rmSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { startSteamStub } from "../tests/support/steam-stub"

/**
 * Test server for the Playwright suite: fresh database `tretu_auth_test_e2e`, a stub Steam OpenID provider
 * (tests/support/steam-stub.ts, on E2E_STEAM_PORT), then `next start`.
 */
const root = path.resolve(import.meta.dirname, "..")
const port = process.env.E2E_PORT ?? "3131"
const database = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_auth_test_e2e"
const admin = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres@localhost:5432/postgres"

const name = new URL(database).pathname.slice(1)
const sql = postgres(admin, { max: 1, onnotice: () => {} })
await sql.unsafe(`drop database if exists "${name}" with (force)`)
await sql.unsafe(`create database "${name}"`)
await sql.end()
if (spawnSync("npx", ["tsx", "scripts/migrate.ts"], { cwd: root, stdio: "inherit", env: { ...process.env, DATABASE_URL: database } }).status !== 0) process.exit(1)
if (process.env.MAIL_OUTBOX_DIR) rmSync(process.env.MAIL_OUTBOX_DIR, { recursive: true, force: true })
const steamPort = Number(process.env.E2E_STEAM_PORT ?? 3197)
const steam = await startSteamStub(steamPort)

const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", port], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: database,
    TRETU_AUTH_ISSUER: `http://localhost:${port}`,
    BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-123456",
    AUTH_RATE_LIMIT: "off",
    AUTH_HIBP: "off",
    STEAM_LOGIN: "true",
    STEAM_OPENID_ENDPOINT: steam.endpoint,
  },
})
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    child.kill(signal)
    void steam.close()
  })
child.on("exit", (code) => process.exit(code ?? 0))
