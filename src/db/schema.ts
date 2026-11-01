import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** All timestamps are `timestamptz`, read and written as JS `Date`. */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: createdAt(),
});

/**
 * Local identities. Better Auth uses this table as its `user` model
 * (`name` → `display_name`, `image` → `avatar_url`), so there is exactly one identity per person.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /** Discord user id (unique). `null` for people who only ever signed in with a Tretu-Konto. */
  discordId: text("discord_id").unique(),
  /** Permanent Tretu ID (`sub` claim of auth.tretu.de), set on the first Tretu-Konto login. */
  tretuSub: text("tretu_sub").unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  /** UI language from the Tretu-Konto (`de` | `en`). */
  locale: text("locale"),
  createdAt: createdAt(),
  /** Bumped on every sign-in (shown as "last login" in the team list). */
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Better Auth sessions (database sessions, cookie holds the signed token). */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)]
);

/** Better Auth provider accounts (Discord, Tretu-Konto). */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Provider-side id: Discord user id or Tretu `sub`. */
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_idx").on(table.providerId, table.accountId),
    index("auth_accounts_user_idx").on(table.userId),
  ]
);

/** Better Auth verification values (OAuth state, PKCE verifier, …). */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: serial("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)]
);

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  createdAt: createdAt(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("user_roles_user_role_idx").on(table.userId, table.roleId)]
);

export const gameInstances = pgTable("game_instances", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  gameType: text("game_type").notNull(),
  region: text("region").notNull().default("fsn1"),
  desiredState: text("desired_state").notNull().default("offline"),
  activeServerType: text("active_server_type").notNull(),
  configProfile: jsonb("config_profile").notNull().default(sql`'{}'::jsonb`),
  idleDeleteAfterMinutes: integer("idle_delete_after_minutes").notNull().default(120),
  /** Subdomain under the configured Cloudflare zone (e.g. "mc" → mc.tretu.de). */
  subdomain: text("subdomain"),
  dnsRecordId: text("dns_record_id"),
  hetznerFirewallId: text("hetzner_firewall_id"),
  /** Last time players were seen online (or the host was started); drives the idle shutdown. */
  lastActivityAt: ts("last_activity_at"),
  backupRetention: integer("backup_retention").notNull().default(5),
  backupOnHibernate: boolean("backup_on_hibernate").notNull().default(true),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const infraServers = pgTable(
  "infra_servers",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    hetznerServerId: text("hetzner_server_id").notNull(),
    name: text("name").notNull(),
    ipV4: text("ip_v4"),
    status: text("status").notNull().default("provisioning"),
    createdAt: createdAt(),
    deletedAt: ts("deleted_at"),
  },
  (table) => [index("infra_servers_instance_idx").on(table.instanceId, table.createdAt)]
);

export const infraVolumes = pgTable("infra_volumes", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  hetznerVolumeId: text("hetzner_volume_id").notNull().unique(),
  linuxDevice: text("linux_device"),
  mountPath: text("mount_path").notNull(),
  sizeGb: integer("size_gb").notNull(),
  status: text("status").notNull().default("attached"),
  createdAt: createdAt(),
});

export const instancePorts = pgTable("instance_ports", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
});

export const actionJobs = pgTable(
  "action_jobs",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    requestedByUserId: integer("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    payloadJson: jsonb("payload_json").notNull().default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    /** Current step shown in the UI while the job runs. */
    progress: text("progress"),
    log: text("log").notNull().default(""),
    error: text("error"),
    createdAt: createdAt(),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
  },
  (table) => [
    uniqueIndex("action_jobs_idempotency_key_idx").on(table.idempotencyKey),
    index("action_jobs_instance_created_idx").on(table.instanceId, table.createdAt),
    index("action_jobs_status_idx").on(table.status),
  ]
);

export const actionAttempts = pgTable(
  "action_attempts",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => actionJobs.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    logExcerpt: text("log_excerpt"),
    createdAt: createdAt(),
  },
  (table) => [index("action_attempts_job_created_idx").on(table.jobId, table.createdAt)]
);

export const instanceStatusSnapshots = pgTable(
  "instance_status_snapshots",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    infraStatus: text("infra_status").notNull(),
    gameStatus: text("game_status").notNull(),
    playerCount: integer("player_count"),
    maxPlayers: integer("max_players"),
    lastHeartbeatAt: ts("last_heartbeat_at"),
    rawJson: jsonb("raw_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [index("instance_status_snapshots_instance_created_idx").on(table.instanceId, table.createdAt)]
);

export const backups = pgTable("backups", {
  id: serial("id").primaryKey(),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  hetznerSnapshotId: text("hetzner_snapshot_id").notNull(),
  kind: text("kind").notNull().default("manual"),
  sizeGb: integer("size_gb"),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  restoredAt: ts("restored_at"),
});

/** File-level backups (tar.gz) stored on the instance volume under /srv/game/backups. */
export const gameBackups = pgTable(
  "game_backups",
  {
    id: serial("id").primaryKey(),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    kind: text("kind").notNull().default("manual"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (table) => [index("game_backups_instance_created_idx").on(table.instanceId, table.createdAt)]
);

/** Key/value settings for the dashboard (Hetzner, Cloudflare, …); secrets are stored encrypted. */
export const dashboardSettings = pgTable("dashboard_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  encrypted: boolean("encrypted").notNull().default(false),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    instanceId: integer("instance_id").references(() => gameInstances.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metaJson: jsonb("meta_json").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_user_created_idx").on(table.userId, table.createdAt),
    index("audit_events_instance_created_idx").on(table.instanceId, table.createdAt),
  ]
);

export const gameInstancesRelations = relations(gameInstances, ({ many }) => ({
  servers: many(infraServers),
  volumes: many(infraVolumes),
  ports: many(instancePorts),
  jobs: many(actionJobs),
  statuses: many(instanceStatusSnapshots),
  backupRecords: many(backups),
  gameBackups: many(gameBackups),
}));

export const tsRankTiers = pgTable(
  "ts_rank_tiers",
  {
    id: serial("id").primaryKey(),
    tierKind: text("tier_kind").notNull().default("level"),
    sortOrder: integer("sort_order").notNull(),
    levelNumber: integer("level_number"),
    prestigeLevel: integer("prestige_level"),
    name: text("name").notNull(),
    minTotalSeconds: integer("min_total_seconds").notNull(),
    serverGroupId: integer("server_group_id").notNull(),
    removePreviousGroup: boolean("remove_previous_group").notNull().default(true),
    prestigeFlag: boolean("prestige_flag").notNull().default(false),
  },
  (table) => [
    uniqueIndex("ts_rank_tiers_kind_sort_idx").on(table.tierKind, table.sortOrder),
    index("ts_rank_tiers_server_group_id_idx").on(table.serverGroupId),
  ]
);

export const tsUsers = pgTable(
  "ts_users",
  {
    uuid: text("uuid").primaryKey(),
    clientDbId: integer("client_db_id").notNull().default(0),
    nickname: text("nickname").notNull(),
    lastSeenAt: ts("last_seen_at").notNull(),
    firstConnectedAt: ts("first_connected_at"),
    totalOnlineSeconds: integer("total_online_seconds").notNull().default(0),
    cycleOnlineSeconds: integer("cycle_online_seconds").notNull().default(0),
    prestige: integer("prestige").notNull().default(0),
    currentLevel: integer("current_level").notNull().default(0),
    periodOnlineSeconds: integer("period_online_seconds").notNull().default(0),
    periodIdleSeconds: integer("period_idle_seconds").notNull().default(0),
    periodKey: text("period_key").notNull(),
    weekOnlineSeconds: integer("week_online_seconds").notNull().default(0),
    weekKey: text("week_key").notNull().default(""),
    yearOnlineSeconds: integer("year_online_seconds").notNull().default(0),
    yearKey: text("year_key").notNull().default(""),
    currentTierId: integer("current_tier_id").references(() => tsRankTiers.id, {
      onDelete: "set null",
    }),
    assignedServerGroupId: integer("assigned_server_group_id"),
    assignedPrestigeGroupId: integer("assigned_prestige_group_id"),
    excepted: boolean("excepted").notNull().default(false),
    isOnline: boolean("is_online").notNull().default(false),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("ts_users_period_leaderboard_idx").on(table.periodKey, table.periodOnlineSeconds),
    index("ts_users_week_leaderboard_idx").on(table.weekKey, table.weekOnlineSeconds),
    index("ts_users_year_leaderboard_idx").on(table.yearKey, table.yearOnlineSeconds),
    index("ts_users_last_seen_idx").on(table.lastSeenAt),
    index("ts_users_total_leaderboard_idx").on(table.totalOnlineSeconds),
  ]
);

export const tsWorkerState = pgTable("ts_worker_state", {
  id: integer("id").primaryKey().default(1),
  lastPollAt: ts("last_poll_at"),
  lastSuccessAt: ts("last_success_at"),
  status: text("status").notNull().default("idle"),
  lastError: text("last_error"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** TeamSpeak online-client samples (rank worker, one per poll). */
export const tsServerSnapshots = pgTable(
  "ts_server_snapshots",
  {
    id: serial("id").primaryKey(),
    recordedAt: ts("recorded_at").notNull(),
    onlineClients: integer("online_clients").notNull(),
  },
  (table) => [index("ts_server_snapshots_recorded_at_idx").on(table.recordedAt)]
);

export const tsRankTiersRelations = relations(tsRankTiers, ({ many }) => ({
  users: many(tsUsers),
}));

export const tsUsersRelations = relations(tsUsers, ({ one }) => ({
  currentTier: one(tsRankTiers, {
    fields: [tsUsers.currentTierId],
    references: [tsRankTiers.id],
  }),
}));
