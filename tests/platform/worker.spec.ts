/** Worker restart behaviour: graceful SIGTERM, exit code 78 without a database, claimed jobs handed back, status checks. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { closeDatabase, resetDatabase } from "./helpers";
import { platformJobs, platformStatusChecks, platformStatusServices } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { enqueueJob, runDueJobs } from "../../src/lib/platform/jobs";

beforeEach(resetDatabase);
after(closeDatabase);

const root = path.resolve(__dirname, "../..");

function startWorker(env: Record<string, string | undefined>, args: string[] = []) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--import", "./src/lib/env/load-local-env.ts", "./scripts/platform-worker.ts", ...args],
    {
      cwd: root,
      // Status checks off unless a test sets targets (never the real hosts from a test).
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        TRETU_STATUS_TARGETS_JSON: "[]",
        TRETU_STATUS_MINECRAFT: "off",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let output = "";
  child.stdout.on("data", (d) => (output += d));
  child.stderr.on("data", (d) => (output += d));
  const exited = new Promise<number | null>((resolve) => child.on("exit", (code) => resolve(code)));
  return { child, exited, output: () => output };
}

async function waitFor(predicate: () => boolean, timeoutMs: number) {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("without DATABASE_URL the worker exits 78 (PM2 leaves it stopped)", { timeout: 60_000 }, async () => {
  const worker = startWorker({ DATABASE_URL: "" });
  assert.equal(await worker.exited, 78);
});

test("SIGTERM stops the worker loop cleanly (exit 0)", { timeout: 120_000 }, async () => {
  const worker = startWorker({ DATABASE_URL: process.env.DATABASE_URL });
  // tsx startup can be slow on loaded machines: wait for the start log, not a fixed time.
  await waitFor(() => worker.output().includes("platform.worker.started"), 90_000);
  const stoppedAt = Date.now();
  worker.child.kill("SIGTERM");
  assert.equal(await worker.exited, 0, worker.output());
  assert.ok(Date.now() - stoppedAt < 15_000, "within PM2's kill_timeout");
  assert.match(worker.output(), /platform\.worker\.stopped/);
});

test("a stop request hands claimed but unprocessed jobs back immediately", async () => {
  for (let i = 0; i < 3; i++) await enqueueJob(platformDb, { type: "user.fetch", payload: { i } });
  let stop = false;
  const handled: number[] = [];
  const result = await runDueJobs(
    {
      "user.fetch": async (job) => {
        handled.push(Number(job.payload.i));
        stop = true; // SIGTERM arrives while the first job runs
        return { status: "done" };
      },
    },
    { shouldStop: () => stop }
  );
  assert.deepEqual(result, { done: 1, retried: 0, failed: 0 });
  assert.deepEqual(handled, [0]);
  const pending = await platformDb.select().from(platformJobs).where(eq(platformJobs.status, "pending"));
  assert.equal(pending.length, 2);
  assert.ok(pending.every((j) => j.lockedUntil === null), "no 2-minute wait after a restart");
});

test("one pass (--once) checks every status target and stores the results", { timeout: 120_000 }, async () => {
  const server = createServer((req, res) => {
    res.writeHead(req.url === "/ok" ? 200 : 503, { "content-type": "application/json" });
    res.end(JSON.stringify(req.url === "/ok" ? { status: "ok", checks: { db: "ok" } } : { status: "error", checks: { db: "error" } }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const targets = [
      { id: "saga", url: `${base}/ok` },
      { id: "play", url: `${base}/broken` },
    ];
    const worker = startWorker({ DATABASE_URL: process.env.DATABASE_URL, TRETU_STATUS_TARGETS_JSON: JSON.stringify(targets) }, ["--once"]);
    assert.equal(await worker.exited, 0, worker.output());
    const checks = await platformDb.select().from(platformStatusChecks).orderBy(platformStatusChecks.service);
    assert.deepEqual(
      checks.map((c) => [c.service, c.state, c.httpStatus, c.error]),
      [
        ["play", "degraded", 503, "checks:db"],
        ["saga", "up", 200, null],
      ]
    );
    assert.equal((await platformDb.select().from(platformStatusServices)).length, 2);
  } finally {
    server.close();
  }
});
