/**
 * node --test deploy/scripts/create-databases.test.mjs — runs create-databases.sh against the local Postgres
 * with a throwaway prefix (admin connection: PGHOST/PGUSER or localhost/postgres), checks least privileges and
 * idempotency, then drops everything again. Skipped when no Postgres is reachable.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildEcosystem } from "./generate-secrets.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "create-databases.sh");
const env = { ...process.env, PGHOST: process.env.PGHOST ?? "localhost", PGUSER: process.env.PGUSER ?? "postgres" };
const prefix = `cdbtest_${process.pid}_`;
const tmp = mkdtempSync(path.join(tmpdir(), "tretu-cdb-"));
const passwords = path.join(tmp, "roles.env");

const reachable = spawnSync("psql", ["-X", "-At", "-d", "postgres", "-c", "select 1"], { env, encoding: "utf8" }).stdout?.trim() === "1";

function sh(args) {
  return spawnSync("bash", [script, ...args], { env, encoding: "utf8" });
}
/** psql as `user` (defaults to the admin). */
function psql(sql, { db = "postgres", user } = {}) {
  return spawnSync("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", db, ...(user ? ["-U", user] : []), "-c", sql], { env, encoding: "utf8" });
}
const value = (sql, opts) => {
  const r = psql(sql, opts);
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

before(() => {
  if (!reachable) return;
  const { files } = buildEcosystem({});
  writeFileSync(passwords, files.find((f) => f.rel === "postgres/roles.env").content, { mode: 0o600 });
  // A legacy database with data, as auth's import would find it.
  psql(`create database "${prefix}saga_seed"`);
});

after(() => {
  if (reachable) {
    sh(["--drop", "--prefix", prefix]);
    psql(`drop database if exists "${prefix}saga_seed"`);
  }
  rmSync(tmp, { recursive: true, force: true });
});

test("creates one least-privileged role and database per app, idempotently", { skip: !reachable && "no local Postgres" }, () => {
  const first = sh(["--passwords", passwords, "--prefix", prefix]);
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, new RegExp(`${prefix}saga\\s+${prefix}saga\\s+created, role created`));
  for (const app of ["tretu_web", "tretu_auth", "saga", "play", "mc_dashboard", "nakama", "umami"]) {
    const name = `${prefix}${app}`;
    assert.equal(
      value(`select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls from pg_roles where rolname = '${name}'`),
      "t|f|f|f|f|f",
      name
    );
    assert.equal(value(`select pg_get_userbyid(datdba) from pg_database where datname = '${name}'`), name);
    assert.equal(value(`select has_database_privilege('public', '${name}', 'CONNECT')`), "f", "PUBLIC cannot connect");
    assert.equal(value(`select pg_get_userbyid(nspowner) from pg_namespace where nspname = 'public'`, { db: name }), name);
  }
  // The app role can create its tables; another app's role cannot even connect.
  value("create table things (id int primary key); insert into things values (1)", { db: `${prefix}saga`, user: `${prefix}saga` });
  const foreign = psql("select 1", { db: `${prefix}saga`, user: `${prefix}play` });
  assert.notEqual(foreign.status, 0);
  assert.match(foreign.stderr, /permission denied/);

  const second = sh(["--passwords", passwords, "--prefix", prefix]);
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, new RegExp(`${prefix}saga\\s+${prefix}saga\\s+exists\\n`));
  assert.equal(value("select count(*) from things", { db: `${prefix}saga`, user: `${prefix}saga` }), "1", "data untouched");
});

test("the legacy reader can read the old apps' tables but never write", { skip: !reachable && "no local Postgres" }, () => {
  const reader = `${prefix}tretu_legacy_reader`;
  // Tables created after the grant are covered by the default privileges.
  value("create table later (id int); insert into later values (7)", { db: `${prefix}saga`, user: `${prefix}saga` });
  assert.equal(value("select count(*) from things", { db: `${prefix}saga`, user: reader }), "1");
  assert.equal(value("select id from later", { db: `${prefix}saga`, user: reader }), "7");
  const write = psql("insert into things values (2)", { db: `${prefix}saga`, user: reader });
  assert.notEqual(write.status, 0);
  assert.match(write.stderr, /read-only transaction|permission denied/);
  assert.notEqual(psql("select 1", { db: `${prefix}umami`, user: reader }).status, 0, "no access to non-legacy databases");
});

test("an existing database of another owner is left alone; --drop needs a prefix; dry runs change nothing", { skip: !reachable && "no local Postgres" }, () => {
  const other = `${prefix}umami`;
  value(`drop database "${other}"`);
  value(`create database "${other}"`); // owned by the admin, like a hand-made database
  const run = sh(["--passwords", passwords, "--prefix", prefix, "--only", "umami"]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stderr, /belongs to postgres/);
  assert.match(run.stdout, /SKIPPED \(owner postgres\)/);
  assert.equal(value(`select pg_get_userbyid(datdba) from pg_database where datname = '${other}'`), env.PGUSER);

  assert.equal(sh(["--drop"]).status, 2);
  const dry = sh(["--passwords", passwords, "--prefix", `${prefix}dry_`, "--dry-run"]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /PASSWORD '\*\*\*'/);
  assert.equal(value(`select count(*) from pg_roles where rolname like '${prefix}dry_%'`), "0");
  assert.equal(sh(["--prefix", prefix]).status, 2, "--passwords required");
});
