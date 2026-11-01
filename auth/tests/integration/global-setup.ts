import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { existsSync, rmSync } from "node:fs"
import { createServer, type Server } from "node:http"
import path from "node:path"
import postgres from "postgres"
import { ADMIN_DATABASE_URL, appEnv, ISSUER, OUTBOX_DIR, PLATFORM_PORT, TEST_DATABASE_URL } from "./env"

const root = path.resolve(import.meta.dirname, "../..")
let app: ChildProcess | undefined
let platform: Server | undefined

/** A stand-in for the platform API: stores every event POST so tests can read them back. */
function startPlatform(): Promise<Server> {
  const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = []
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/__events") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(received))
      return
    }
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      received.push({ headers: req.headers, body })
      res.writeHead(202, { "content-type": "application/json" })
      res.end(JSON.stringify({ accepted: 1, duplicates: 0 }))
    })
  })
  return new Promise((resolve) => server.listen(PLATFORM_PORT, "127.0.0.1", () => resolve(server)))
}

async function resetDatabase() {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1)
  const admin = postgres(ADMIN_DATABASE_URL, { max: 1, onnotice: () => {} })
  const exists = await admin`select 1 from pg_database where datname = ${name}`
  if (!exists.length) await admin.unsafe(`create database "${name}"`)
  await admin.end()
  const db = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  await db.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;")
  await db.end()
  const migrate = spawnSync("npx", ["tsx", "scripts/migrate.ts"], { cwd: root, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "inherit" })
  if (migrate.status !== 0) throw new Error("migrations failed")
}

async function waitForHealth(timeoutMs: number) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const res = await fetch(`${ISSUER}/api/health`)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("the app did not become healthy")
}

export async function setup() {
  const stale = await fetch(`${ISSUER}/api/health`).then(() => true, () => false)
  if (stale) throw new Error(`port ${new URL(ISSUER).port} is in use: stop the old test server first`)
  await resetDatabase()
  rmSync(OUTBOX_DIR, { recursive: true, force: true })
  if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
    const build = spawnSync("npx", ["next", "build"], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" } })
    if (build.status !== 0) throw new Error("next build failed")
  }
  platform = await startPlatform()
  app = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", String(new URL(ISSUER).port)], {
    cwd: root,
    env: { ...process.env, ...appEnv() },
    stdio: process.env.DEBUG_APP ? "inherit" : "ignore",
    detached: true,
  })
  await waitForHealth(60_000)
}

export async function teardown() {
  // The whole process group: next start forks its own server process.
  if (app?.pid) {
    try {
      process.kill(-app.pid, "SIGTERM")
    } catch {
      app.kill("SIGTERM")
    }
  }
  await new Promise((resolve) => platform?.close(resolve) ?? resolve(null))
}
