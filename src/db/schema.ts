import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  discordId: text("discord_id").notNull().unique(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const userRoles = sqliteTable(
  "user_roles",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    uniqueUserRole: uniqueIndex("user_roles_user_role_idx").on(table.userId, table.roleId),
  })
);

export const gameInstances = sqliteTable("game_instances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  gameType: text("game_type").notNull(),
  region: text("region").notNull().default("fsn1"),
  desiredState: text("desired_state").notNull().default("offline"),
  activeServerType: text("active_server_type").notNull(),
  configProfile: text("config_profile", { mode: "json" }).notNull().default(sql`'{}'`),
  idleDeleteAfterMinutes: integer("idle_delete_after_minutes").notNull().default(120),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const infraServers = sqliteTable(
  "infra_servers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    hetznerServerId: text("hetzner_server_id").notNull(),
    name: text("name").notNull(),
    ipV4: text("ip_v4"),
    status: text("status").notNull().default("provisioning"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (table) => ({
    instanceIdx: index("infra_servers_instance_idx").on(table.instanceId, table.createdAt),
  })
);

export const infraVolumes = sqliteTable("infra_volumes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  hetznerVolumeId: text("hetzner_volume_id").notNull().unique(),
  linuxDevice: text("linux_device"),
  mountPath: text("mount_path").notNull(),
  sizeGb: integer("size_gb").notNull(),
  status: text("status").notNull().default("attached"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const instancePorts = sqliteTable("instance_ports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
});

export const actionJobs = sqliteTable(
  "action_jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    requestedByUserId: integer("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    payloadJson: text("payload_json", { mode: "json" }).notNull().default(sql`'{}'`),
    status: text("status").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
  },
  (table) => ({
    idemIdx: uniqueIndex("action_jobs_idempotency_key_idx").on(table.idempotencyKey),
    listIdx: index("action_jobs_instance_created_idx").on(table.instanceId, table.createdAt),
  })
);

export const actionAttempts = sqliteTable(
  "action_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => actionJobs.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    logExcerpt: text("log_excerpt"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    createdIdx: index("action_attempts_job_created_idx").on(table.jobId, table.createdAt),
  })
);

export const instanceStatusSnapshots = sqliteTable(
  "instance_status_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: integer("instance_id")
      .notNull()
      .references(() => gameInstances.id, { onDelete: "cascade" }),
    infraStatus: text("infra_status").notNull(),
    gameStatus: text("game_status").notNull(),
    playerCount: integer("player_count"),
    maxPlayers: integer("max_players"),
    lastHeartbeatAt: integer("last_heartbeat_at", { mode: "timestamp" }),
    rawJson: text("raw_json", { mode: "json" }).notNull().default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    createdIdx: index("instance_status_snapshots_instance_created_idx").on(table.instanceId, table.createdAt),
  })
);

export const backups = sqliteTable("backups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  instanceId: integer("instance_id")
    .notNull()
    .references(() => gameInstances.id, { onDelete: "cascade" }),
  hetznerSnapshotId: text("hetzner_snapshot_id").notNull(),
  kind: text("kind").notNull().default("manual"),
  sizeGb: integer("size_gb"),
  createdByUserId: integer("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  restoredAt: integer("restored_at", { mode: "timestamp" }),
});

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").references(() => users.id),
    instanceId: integer("instance_id").references(() => gameInstances.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    metaJson: text("meta_json", { mode: "json" }).notNull().default(sql`'{}'`),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    userCreatedIdx: index("audit_events_user_created_idx").on(table.userId, table.createdAt),
    instanceCreatedIdx: index("audit_events_instance_created_idx").on(table.instanceId, table.createdAt),
  })
);

export const gameInstancesRelations = relations(gameInstances, ({ many }) => ({
  servers: many(infraServers),
  volumes: many(infraVolumes),
  ports: many(instancePorts),
  jobs: many(actionJobs),
  statuses: many(instanceStatusSnapshots),
  backupRecords: many(backups),
}));

export const tsRankTiers = sqliteTable(
  "ts_rank_tiers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tierKind: text("tier_kind").notNull().default("level"),
    sortOrder: integer("sort_order").notNull(),
    levelNumber: integer("level_number"),
    prestigeLevel: integer("prestige_level"),
    name: text("name").notNull(),
    minTotalSeconds: integer("min_total_seconds").notNull(),
    serverGroupId: integer("server_group_id").notNull(),
    removePreviousGroup: integer("remove_previous_group", { mode: "boolean" }).notNull().default(true),
    prestigeFlag: integer("prestige_flag", { mode: "boolean" }).notNull().default(false),
  },
  (table) => ({
    kindSortIdx: uniqueIndex("ts_rank_tiers_kind_sort_idx").on(table.tierKind, table.sortOrder),
    sgidIdx: index("ts_rank_tiers_server_group_id_idx").on(table.serverGroupId),
  })
);

export const tsUsers = sqliteTable(
  "ts_users",
  {
    uuid: text("uuid").primaryKey(),
    clientDbId: integer("client_db_id").notNull().default(0),
    nickname: text("nickname").notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
    firstConnectedAt: integer("first_connected_at", { mode: "timestamp" }),
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
    excepted: integer("excepted", { mode: "boolean" }).notNull().default(false),
    isOnline: integer("is_online", { mode: "boolean" }).notNull().default(false),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    periodLeaderboardIdx: index("ts_users_period_leaderboard_idx").on(
      table.periodKey,
      table.periodOnlineSeconds
    ),
    weekLeaderboardIdx: index("ts_users_week_leaderboard_idx").on(
      table.weekKey,
      table.weekOnlineSeconds
    ),
    yearLeaderboardIdx: index("ts_users_year_leaderboard_idx").on(
      table.yearKey,
      table.yearOnlineSeconds
    ),
    lastSeenIdx: index("ts_users_last_seen_idx").on(table.lastSeenAt),
    totalLeaderboardIdx: index("ts_users_total_leaderboard_idx").on(table.totalOnlineSeconds),
  })
);

export const tsWorkerState = sqliteTable("ts_worker_state", {
  id: integer("id").primaryKey().default(1),
  lastPollAt: integer("last_poll_at", { mode: "timestamp" }),
  lastSuccessAt: integer("last_success_at", { mode: "timestamp" }),
  status: text("status").notNull().default("idle"),
  lastError: text("last_error"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

/** Hourly TeamSpeak online-client samples (rank worker). */
export const tsServerSnapshots = sqliteTable(
  "ts_server_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull(),
    onlineClients: integer("online_clients").notNull(),
  },
  (table) => ({
    recordedAtIdx: index("ts_server_snapshots_recorded_at_idx").on(table.recordedAt),
  })
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
