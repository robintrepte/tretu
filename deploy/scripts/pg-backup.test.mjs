/**
 * node --test deploy/scripts/pg-backup.test.mjs — pg-backup.sh + pg-restore-test.sh against the local Postgres
 * (PGHOST/PGUSER or localhost/postgres) with throwaway databases. Skipped when no Postgres is reachable.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = { ...process.env, PGHOST: process.env.PGHOST ?? "localhost", PGUSER: process.env.PGUSER ?? "postgres" };
const db = `bkptest_${process.pid}`;
const tmp = mkdtempSync(path.join(tmpdir(), "tretu-backup-"));
const backupDir = path.join(tmp, "backups");
const reachable = spawnSync("psql", ["-X", "-At", "-d", "postgres", "-c", "select 1"], { env, encoding: "utf8" }).stdout?.trim() === "1";

const psql = (sql, database = "postgres") => spawnSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", database, "-c", sql], { env, encoding: "utf8" });
const run = (script, args = [], extra = {}) =>
  spawnSync("bash", [path.join(here, script), ...args], { env: { ...env, BACKUP_DIR: backupDir, BACKUP_DATABASES: db, ...extra }, encoding: "utf8" });

before(() => {
  if (!reachable) return;
  psql(`drop database if exists "${db}" with (force)`);
  assert.equal(psql(`create database "${db}"`).status, 0);
  assert.equal(psql("create table players (id int primary key, name text); insert into players select g, 'p' || g from generate_series(1, 250) g", db).status, 0);
});
after(() => {
  if (reachable) {
    psql(`drop database if exists "${db}" with (force)`);
    psql(`drop database if exists "${db}_restore_test" with (force)`);
  }
  rmSync(tmp, { recursive: true, force: true });
});

const dumps = () => readdirSync(path.join(backupDir, db)).filter((f) => f.endsWith(".dump"));

test("backup writes a verified dump per database (mode 600) plus the roles", { skip: !reachable && "no local Postgres" }, () => {
  const result = run("pg-backup.sh");
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, new RegExp(`^${db}\\s+OK`, "m"));
  assert.equal(statSync(backupDir).mode & 0o777, 0o700);
  const [dump] = dumps();
  assert.ok(dump);
  assert.equal(statSync(path.join(backupDir, db, dump)).mode & 0o777, 0o600);
  assert.ok(existsSync(path.join(backupDir, db, `${dump}.sha256`)));
  assert.equal(readdirSync(path.join(backupDir, "globals")).filter((f) => f.endsWith(".sql")).length, 1);
});

test("restore test restores the newest dump into a scratch database and drops it", { skip: !reachable && "no local Postgres" }, () => {
  const result = run("pg-restore-test.sh");
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, new RegExp(`^${db}\\s+OK\\s+1\\s+250`, "m"));
  assert.equal(psql(`select count(*) from pg_database where datname = '${db}_restore_test'`).stdout.trim(), "0");
});

test("restore test fails on a stale or corrupted dump", { skip: !reachable && "no local Postgres" }, () => {
  const stale = run("pg-restore-test.sh", [], { MAX_AGE_HOURS: "0" });
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /newest dump is 0 h old/);
  const [dump] = dumps();
  appendFileSync(path.join(backupDir, db, dump), "garbage");
  const corrupted = run("pg-restore-test.sh");
  assert.equal(corrupted.status, 1);
  assert.match(corrupted.stdout, /checksum mismatch/);
});

test("retention removes old dumps; a missing database fails the backup", { skip: !reachable && "no local Postgres" }, () => {
  const old = path.join(backupDir, db, `${db}-20000101T000000Z.dump`);
  writeFileSync(old, "old");
  const longAgo = new Date("2000-01-02T00:00:00Z");
  utimesSync(old, longAgo, longAgo);
  const result = run("pg-backup.sh", [], { RETENTION_DAYS: "14" });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!existsSync(old), "old dump removed");
  const missing = run("pg-backup.sh", [], { BACKUP_DATABASES: `${db} ${db}_does_not_exist` });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /does_not_exist\s+MISSING/);
});

test("a failed run posts one German message to BACKUP_ALERT_WEBHOOK_URL, a good run none", { skip: !reachable && "no local Postgres" }, async () => {
  const posts = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      posts.push({ method: req.method, type: req.headers["content-type"], body: JSON.parse(body) });
      res.writeHead(204).end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const webhook = `http://127.0.0.1:${server.address().port}/api/webhooks/1/secret-token`;
  // spawn (not spawnSync): the webhook stand-in runs in this process.
  const runAsync = (script, extra) =>
    new Promise((resolve) => {
      const child = spawn("bash", [path.join(here, script)], { env: { ...env, BACKUP_DIR: backupDir, BACKUP_DATABASES: db, BACKUP_ALERT_WEBHOOK_URL: webhook, ...extra } });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("exit", (code) => resolve({ code, out }));
    });
  try {
    const ok = await runAsync("pg-backup.sh", {});
    assert.equal(ok.code, 0, ok.out);
    assert.equal(posts.length, 0);

    const failed = await runAsync("pg-backup.sh", { BACKUP_DATABASES: `${db} ${db}_does_not_exist` });
    assert.equal(failed.code, 1);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].method, "POST");
    assert.equal(posts[0].type, "application/json");
    assert.match(posts[0].body.content, /^Tretu-Backup auf .+ ist fehlgeschlagen \(Exit-Code 1\)/);
    assert.deepEqual(posts[0].body.allowed_mentions, { parse: [] });
    assert.ok(!failed.out.includes("secret-token"), "webhook URL never printed");

    const stale = await runAsync("pg-restore-test.sh", { MAX_AGE_HOURS: "0" });
    assert.equal(stale.code, 1);
    assert.equal(posts.length, 2);
    assert.match(posts[1].body.content, /^Tretu-Restore-Test auf .+ ist fehlgeschlagen/);
  } finally {
    server.close();
  }
});
