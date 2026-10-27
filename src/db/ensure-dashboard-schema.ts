import type Database from "better-sqlite3";

/**
 * Idempotent DDL for the game-server dashboard (mirrors `drizzle/0006_dashboard_overhaul.sql`).
 * Runs on worker start so existing databases pick up the new columns/tables without a manual `db:push`.
 */
const ADDED_COLUMNS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "game_instances", column: "subdomain", ddl: "ALTER TABLE `game_instances` ADD `subdomain` text" },
  { table: "game_instances", column: "dns_record_id", ddl: "ALTER TABLE `game_instances` ADD `dns_record_id` text" },
  {
    table: "game_instances",
    column: "hetzner_firewall_id",
    ddl: "ALTER TABLE `game_instances` ADD `hetzner_firewall_id` text",
  },
  {
    table: "game_instances",
    column: "last_activity_at",
    ddl: "ALTER TABLE `game_instances` ADD `last_activity_at` integer",
  },
  {
    table: "game_instances",
    column: "backup_retention",
    ddl: "ALTER TABLE `game_instances` ADD `backup_retention` integer DEFAULT 5 NOT NULL",
  },
  {
    table: "game_instances",
    column: "backup_on_hibernate",
    ddl: "ALTER TABLE `game_instances` ADD `backup_on_hibernate` integer DEFAULT true NOT NULL",
  },
  { table: "action_jobs", column: "progress", ddl: "ALTER TABLE `action_jobs` ADD `progress` text" },
  { table: "action_jobs", column: "log", ddl: "ALTER TABLE `action_jobs` ADD `log` text DEFAULT '' NOT NULL" },
  { table: "action_jobs", column: "error", ddl: "ALTER TABLE `action_jobs` ADD `error` text" },
];

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`game_backups\` (
	\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	\`instance_id\` integer NOT NULL,
	\`file_name\` text NOT NULL,
	\`size_bytes\` integer,
	\`kind\` text DEFAULT 'manual' NOT NULL,
	\`created_by_user_id\` integer,
	\`created_at\` integer NOT NULL,
	FOREIGN KEY (\`instance_id\`) REFERENCES \`game_instances\`(\`id\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`created_by_user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
)`,
  "CREATE INDEX IF NOT EXISTS `game_backups_instance_created_idx` ON `game_backups` (`instance_id`,`created_at`)",
  `CREATE TABLE IF NOT EXISTS \`dashboard_settings\` (
	\`key\` text PRIMARY KEY NOT NULL,
	\`value\` text NOT NULL,
	\`encrypted\` integer DEFAULT false NOT NULL,
	\`updated_at\` integer NOT NULL
)`,
];

function tableExists(sqlite: Database.Database, table: string): boolean {
  return Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function columnExists(sqlite: Database.Database, table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(\`${table}\`)`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

export function ensureDashboardSchema(sqlite: Database.Database): void {
  // Fresh database without the base tables: `npm run db:push` creates everything from schema.ts.
  if (!tableExists(sqlite, "game_instances")) return;

  for (const statement of CREATE_STATEMENTS) sqlite.exec(statement);
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    if (tableExists(sqlite, table) && !columnExists(sqlite, table, column)) sqlite.exec(ddl);
  }
}
