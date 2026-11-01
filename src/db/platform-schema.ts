/**
 * Tretu platform tables (events, XP/levels/badges, wallet, friends, presence, notifications).
 *
 * Postgres (drizzle pg-core). Every table is prefixed `platform_` so the schema can be merged into
 * the main tretu.de database without name clashes. See docs/ecosystem/PLATFORM.md for the data model.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => tz("created_at").notNull().defaultNow();
const updatedAt = () => tz("updated_at").notNull().defaultNow();

export type PlatformUserLinks = {
  discord?: string;
  minecraft?: string;
  minecraftName?: string;
  steam?: string;
};

/* -------------------------------------------------------------------------- */
/* User directory (mirrors auth.tretu.de via user.* events)                    */
/* -------------------------------------------------------------------------- */

export const platformUsers = pgTable(
  "platform_users",
  {
    sub: text("sub").primaryKey(),
    username: text("username"),
    usernameLower: text("username_lower"),
    name: text("name"),
    picture: text("picture"),
    locale: text("locale"),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    links: jsonb("links").$type<PlatformUserLinks>().notNull().default({}),
    discordId: text("discord_id"),
    authCreatedAt: tz("auth_created_at"),
    /** occurredAt of the last applied user.* event (out-of-order protection). */
    sourceUpdatedAt: tz("source_updated_at"),
    /** Last successful sync from auth (event or admin API). Null = stub that still needs a fetch. */
    fetchedAt: tz("fetched_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("platform_users_username_lower_idx").on(t.usernameLower),
    index("platform_users_discord_id_idx").on(t.discordId),
  ]
);

/** Subs erased via user.deleted. Only the pseudonymous id is kept so late events cannot re-create data. */
export const platformDeletedUsers = pgTable("platform_deleted_users", {
  sub: text("sub").primaryKey(),
  deletedAt: tz("deleted_at").notNull().defaultNow(),
});

export const platformProfileSettings = pgTable("platform_profile_settings", {
  sub: text("sub").primaryKey(),
  /** public | friends | private */
  visibility: text("visibility").notNull().default("public"),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------------------- */
/* Events, stats, XP, badges                                                   */
/* -------------------------------------------------------------------------- */

export const platformEvents = pgTable(
  "platform_events",
  {
    id: uuid("id").primaryKey(),
    app: text("app").notNull(),
    type: text("type").notNull(),
    sub: text("sub"),
    occurredAt: tz("occurred_at").notNull(),
    receivedAt: tz("received_at").notNull().defaultNow(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    /** processed | stored (no sub / unknown type) | ignored (erased user) */
    status: text("status").notNull().default("processed"),
  },
  (t) => [
    index("platform_events_sub_idx").on(t.sub, t.receivedAt),
    index("platform_events_app_type_idx").on(t.app, t.type),
  ]
);

export const platformUserStats = pgTable(
  "platform_user_stats",
  {
    sub: text("sub").notNull(),
    key: text("key").notNull(),
    value: bigint("value", { mode: "number" }).notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.key] })]
);

export const platformUserProgress = pgTable("platform_user_progress", {
  sub: text("sub").primaryKey(),
  xp: bigint("xp", { mode: "number" }).notNull().default(0),
  level: integer("level").notNull().default(1),
  updatedAt: updatedAt(),
});

/** Per user + Europe/Berlin day counters (XP per app, game-win credits). */
export const platformDailyCounters = pgTable(
  "platform_daily_counters",
  {
    sub: text("sub").notNull(),
    day: text("day").notNull(),
    counter: text("counter").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.sub, t.day, t.counter] })]
);

export const platformUserApps = pgTable(
  "platform_user_apps",
  {
    sub: text("sub").notNull(),
    app: text("app").notNull(),
    firstSeenAt: tz("first_seen_at").notNull().defaultNow(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.app] })]
);

export const platformUserBadges = pgTable(
  "platform_user_badges",
  {
    sub: text("sub").notNull(),
    badgeKey: text("badge_key").notNull(),
    earnedAt: tz("earned_at").notNull().defaultNow(),
    xp: integer("xp").notNull().default(0),
    credits: integer("credits").notNull().default(0),
    sourceEventId: uuid("source_event_id"),
  },
  (t) => [primaryKey({ columns: [t.sub, t.badgeKey] }), index("platform_user_badges_badge_idx").on(t.badgeKey)]
);

export const platformUserAchievements = pgTable(
  "platform_user_achievements",
  {
    sub: text("sub").notNull(),
    key: text("key").notNull(),
    app: text("app").notNull(),
    title: text("title"),
    unlockedAt: tz("unlocked_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.key] })]
);

/** Discord role / TeamSpeak group sync state per earned badge. */
export const platformBadgeSync = pgTable(
  "platform_badge_sync",
  {
    sub: text("sub").notNull(),
    badgeKey: text("badge_key").notNull(),
    /** discord | teamspeak */
    target: text("target").notNull(),
    /** done | skipped */
    status: text("status").notNull(),
    detail: text("detail"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.badgeKey, t.target] })]
);

/** TeamSpeak identity verified by the user (nickname code), used for badge server groups. */
export const platformTsLinks = pgTable(
  "platform_ts_links",
  {
    sub: text("sub").primaryKey(),
    tsUid: text("ts_uid"),
    tsClientDbId: integer("ts_client_db_id"),
    tsNickname: text("ts_nickname"),
    verifyCode: text("verify_code"),
    codeExpiresAt: tz("code_expires_at"),
    verifiedAt: tz("verified_at"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("platform_ts_links_uid_idx").on(t.tsUid)]
);

/* -------------------------------------------------------------------------- */
/* Webhook outbox + background jobs                                            */
/* -------------------------------------------------------------------------- */

export const platformOutbox = pgTable(
  "platform_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventId: uuid("event_id").notNull(),
    targetApp: text("target_app").notNull(),
    type: text("type").notNull(),
    sub: text("sub"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** pending | delivered | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tz("next_attempt_at").notNull().defaultNow(),
    lockedUntil: tz("locked_until"),
    lastError: text("last_error"),
    lastStatus: integer("last_status"),
    createdAt: createdAt(),
    deliveredAt: tz("delivered_at"),
  },
  (t) => [
    uniqueIndex("platform_outbox_event_app_idx").on(t.eventId, t.targetApp),
    index("platform_outbox_due_idx").on(t.status, t.nextAttemptAt),
    index("platform_outbox_sub_idx").on(t.sub),
  ]
);

export const platformJobs = pgTable(
  "platform_jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** While pending, a second enqueue with the same key is a no-op. */
    dedupeKey: text("dedupe_key"),
    sub: text("sub"),
    /** pending | done | failed */
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tz("next_attempt_at").notNull().defaultNow(),
    lockedUntil: tz("locked_until"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: tz("finished_at"),
  },
  (t) => [
    uniqueIndex("platform_jobs_dedupe_pending_idx")
      .on(t.dedupeKey)
      .where(sql`${t.status} = 'pending' and ${t.dedupeKey} is not null`),
    index("platform_jobs_due_idx").on(t.status, t.nextAttemptAt),
    index("platform_jobs_sub_idx").on(t.sub),
  ]
);

/* -------------------------------------------------------------------------- */
/* Wallet (double-entry ledger, Tretu-Credits "TC")                            */
/* -------------------------------------------------------------------------- */

export const platformWalletAccounts = pgTable(
  "platform_wallet_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `user:<sub>`, `system:<name>` or `erased:<uuid>` after user.deleted. */
    owner: text("owner").notNull(),
    sub: text("sub"),
    /** user | system | erased */
    kind: text("kind").notNull(),
    balance: bigint("balance", { mode: "number" }).notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("platform_wallet_accounts_owner_idx").on(t.owner),
    uniqueIndex("platform_wallet_accounts_sub_idx").on(t.sub),
    check("platform_wallet_accounts_user_nonneg", sql`${t.kind} <> 'user' or ${t.balance} >= 0`),
  ]
);

export const platformWalletTransactions = pgTable(
  "platform_wallet_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** App that booked it (`platform` for internal bookings). Idempotency keys are unique per app. */
    app: text("app").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    sub: text("sub"),
    kind: text("kind").notNull(),
    /** Delta from the user's point of view. */
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: text("reason"),
    ref: text("ref"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("platform_wallet_tx_idem_idx").on(t.app, t.idempotencyKey),
    index("platform_wallet_tx_sub_idx").on(t.sub),
  ]
);

export const platformWalletEntries = pgTable(
  "platform_wallet_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    transactionId: uuid("transaction_id").notNull(),
    accountId: uuid("account_id").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    balanceAfter: bigint("balance_after", { mode: "number" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: "platform_wallet_entries_tx_fk",
      columns: [t.transactionId],
      foreignColumns: [platformWalletTransactions.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "platform_wallet_entries_account_fk",
      columns: [t.accountId],
      foreignColumns: [platformWalletAccounts.id],
    }),
    index("platform_wallet_entries_account_idx").on(t.accountId, t.id),
    index("platform_wallet_entries_tx_idx").on(t.transactionId),
  ]
);

/** One row per user + Europe/Berlin day once the daily top-up was claimed (or the wallet was opened that day). */
export const platformWalletDaily = pgTable(
  "platform_wallet_daily",
  {
    sub: text("sub").notNull(),
    day: text("day").notNull(),
    granted: integer("granted").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.day] })]
);

/* -------------------------------------------------------------------------- */
/* Friends, presence                                                           */
/* -------------------------------------------------------------------------- */

export const platformFriendRequests = pgTable(
  "platform_friend_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromSub: text("from_sub").notNull(),
    toSub: text("to_sub").notNull(),
    /** pending | accepted | declined | cancelled */
    status: text("status").notNull().default("pending"),
    createdAt: createdAt(),
    respondedAt: tz("responded_at"),
  },
  (t) => [
    uniqueIndex("platform_friend_requests_pending_idx")
      .on(t.fromSub, t.toSub)
      .where(sql`${t.status} = 'pending'`),
    index("platform_friend_requests_to_idx").on(t.toSub, t.status),
  ]
);

/** One row per friendship, `subA < subB`. */
export const platformFriendships = pgTable(
  "platform_friendships",
  {
    subA: text("sub_a").notNull(),
    subB: text("sub_b").notNull(),
    since: tz("since").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.subA, t.subB] }),
    index("platform_friendships_b_idx").on(t.subB),
    check("platform_friendships_order", sql`${t.subA} < ${t.subB}`),
  ]
);

export const platformPresence = pgTable(
  "platform_presence",
  {
    sub: text("sub").notNull(),
    app: text("app").notNull(),
    /** online | playing */
    status: text("status").notNull(),
    activity: text("activity"),
    joinUrl: text("join_url"),
    updatedAt: tz("updated_at").notNull(),
    expiresAt: tz("expires_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.app] }), index("platform_presence_expires_idx").on(t.expiresAt)]
);

/* -------------------------------------------------------------------------- */
/* Notifications + web push                                                    */
/* -------------------------------------------------------------------------- */

export const platformNotifications = pgTable(
  "platform_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sub: text("sub").notNull(),
    app: text("app").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    icon: text("icon"),
    /** The user who caused it (friend request, invite); erased with that user. */
    actorSub: text("actor_sub"),
    readAt: tz("read_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("platform_notifications_sub_idx").on(t.sub, t.createdAt),
    index("platform_notifications_unread_idx").on(t.sub).where(sql`${t.readAt} is null`),
    index("platform_notifications_actor_idx").on(t.actorSub),
  ]
);

export const platformNotificationSettings = pgTable(
  "platform_notification_settings",
  {
    sub: text("sub").notNull(),
    /** social | invite | achievement | wallet | app */
    category: text("category").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    push: boolean("push").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.sub, t.category] })]
);

export const platformPushSubscriptions = pgTable(
  "platform_push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sub: text("sub").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    failureCount: integer("failure_count").notNull().default(0),
    lastSuccessAt: tz("last_success_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("platform_push_subscriptions_endpoint_idx").on(t.endpoint),
    index("platform_push_subscriptions_sub_idx").on(t.sub),
  ]
);

/** Every table in this file (tests use it to reset the database). */
export const PLATFORM_TABLE_NAMES = [
  "platform_users",
  "platform_deleted_users",
  "platform_profile_settings",
  "platform_events",
  "platform_user_stats",
  "platform_user_progress",
  "platform_daily_counters",
  "platform_user_apps",
  "platform_user_badges",
  "platform_user_achievements",
  "platform_badge_sync",
  "platform_ts_links",
  "platform_outbox",
  "platform_jobs",
  "platform_wallet_entries",
  "platform_wallet_transactions",
  "platform_wallet_accounts",
  "platform_wallet_daily",
  "platform_friend_requests",
  "platform_friendships",
  "platform_presence",
  "platform_notifications",
  "platform_notification_settings",
  "platform_push_subscriptions",
] as const;
