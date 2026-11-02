/**
 * node --test deploy/scripts/pg-backup.test.mjs — pg-backup.sh + pg-restore-test.sh against the local Postgres
 * (PGHOST/PGUSER or localhost/postgres) with throwaway databases. Skipped when no Postgres is reachable.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
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
