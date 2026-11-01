CREATE TABLE "platform_badge_sync" (
	"sub" text NOT NULL,
	"badge_key" text NOT NULL,
	"target" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_badge_sync_sub_badge_key_target_pk" PRIMARY KEY("sub","badge_key","target")
);
--> statement-breakpoint
CREATE TABLE "platform_daily_counters" (
	"sub" text NOT NULL,
	"day" text NOT NULL,
	"counter" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "platform_daily_counters_sub_day_counter_pk" PRIMARY KEY("sub","day","counter")
);
--> statement-breakpoint
CREATE TABLE "platform_deleted_users" (
	"sub" text PRIMARY KEY NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"app" text NOT NULL,
	"type" text NOT NULL,
	"sub" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'processed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_friend_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_sub" text NOT NULL,
	"to_sub" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_friendships" (
	"sub_a" text NOT NULL,
	"sub_b" text NOT NULL,
	"since" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_friendships_sub_a_sub_b_pk" PRIMARY KEY("sub_a","sub_b"),
	CONSTRAINT "platform_friendships_order" CHECK ("platform_friendships"."sub_a" < "platform_friendships"."sub_b")
);
--> statement-breakpoint
CREATE TABLE "platform_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"sub" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_notification_settings" (
	"sub" text NOT NULL,
	"category" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"push" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_notification_settings_sub_category_pk" PRIMARY KEY("sub","category")
);
--> statement-breakpoint
CREATE TABLE "platform_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"app" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"url" text,
	"icon" text,
	"actor_sub" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"target_app" text NOT NULL,
	"type" text NOT NULL,
	"sub" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"last_status" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_presence" (
	"sub" text NOT NULL,
	"app" text NOT NULL,
	"status" text NOT NULL,
	"activity" text,
	"join_url" text,
	"updated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "platform_presence_sub_app_pk" PRIMARY KEY("sub","app")
);
--> statement-breakpoint
CREATE TABLE "platform_profile_settings" (
	"sub" text PRIMARY KEY NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_ts_links" (
	"sub" text PRIMARY KEY NOT NULL,
	"ts_uid" text,
	"ts_client_db_id" integer,
	"ts_nickname" text,
	"verify_code" text,
	"code_expires_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_user_achievements" (
	"sub" text NOT NULL,
	"key" text NOT NULL,
	"app" text NOT NULL,
	"title" text,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_user_achievements_sub_key_pk" PRIMARY KEY("sub","key")
);
--> statement-breakpoint
CREATE TABLE "platform_user_apps" (
	"sub" text NOT NULL,
	"app" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_user_apps_sub_app_pk" PRIMARY KEY("sub","app")
);
--> statement-breakpoint
CREATE TABLE "platform_user_badges" (
	"sub" text NOT NULL,
	"badge_key" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"source_event_id" uuid,
	CONSTRAINT "platform_user_badges_sub_badge_key_pk" PRIMARY KEY("sub","badge_key")
);
--> statement-breakpoint
CREATE TABLE "platform_user_progress" (
	"sub" text PRIMARY KEY NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_user_stats" (
	"sub" text NOT NULL,
	"key" text NOT NULL,
	"value" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_user_stats_sub_key_pk" PRIMARY KEY("sub","key")
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"sub" text PRIMARY KEY NOT NULL,
	"username" text,
	"username_lower" text,
	"name" text,
	"picture" text,
	"locale" text,
	"roles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discord_id" text,
	"auth_created_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_wallet_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text NOT NULL,
	"sub" text,
	"kind" text NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_wallet_accounts_user_nonneg" CHECK ("platform_wallet_accounts"."kind" <> 'user' or "platform_wallet_accounts"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "platform_wallet_daily" (
	"sub" text NOT NULL,
	"day" text NOT NULL,
	"granted" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_wallet_daily_sub_day_pk" PRIMARY KEY("sub","day")
);
--> statement-breakpoint
CREATE TABLE "platform_wallet_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"sub" text,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"reason" text,
	"ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_wallet_entries" ADD CONSTRAINT "platform_wallet_entries_tx_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."platform_wallet_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_wallet_entries" ADD CONSTRAINT "platform_wallet_entries_account_fk" FOREIGN KEY ("account_id") REFERENCES "public"."platform_wallet_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_events_sub_idx" ON "platform_events" USING btree ("sub","received_at");--> statement-breakpoint
CREATE INDEX "platform_events_app_type_idx" ON "platform_events" USING btree ("app","type");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_friend_requests_pending_idx" ON "platform_friend_requests" USING btree ("from_sub","to_sub") WHERE "platform_friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "platform_friend_requests_to_idx" ON "platform_friend_requests" USING btree ("to_sub","status");--> statement-breakpoint
CREATE INDEX "platform_friendships_b_idx" ON "platform_friendships" USING btree ("sub_b");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_jobs_dedupe_pending_idx" ON "platform_jobs" USING btree ("dedupe_key") WHERE "platform_jobs"."status" = 'pending' and "platform_jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "platform_jobs_due_idx" ON "platform_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "platform_jobs_sub_idx" ON "platform_jobs" USING btree ("sub");--> statement-breakpoint
CREATE INDEX "platform_notifications_sub_idx" ON "platform_notifications" USING btree ("sub","created_at");--> statement-breakpoint
CREATE INDEX "platform_notifications_unread_idx" ON "platform_notifications" USING btree ("sub") WHERE "platform_notifications"."read_at" is null;--> statement-breakpoint
CREATE INDEX "platform_notifications_actor_idx" ON "platform_notifications" USING btree ("actor_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_outbox_event_app_idx" ON "platform_outbox" USING btree ("event_id","target_app");--> statement-breakpoint
CREATE INDEX "platform_outbox_due_idx" ON "platform_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "platform_outbox_sub_idx" ON "platform_outbox" USING btree ("sub");--> statement-breakpoint
CREATE INDEX "platform_presence_expires_idx" ON "platform_presence" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_push_subscriptions_endpoint_idx" ON "platform_push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "platform_push_subscriptions_sub_idx" ON "platform_push_subscriptions" USING btree ("sub");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_ts_links_uid_idx" ON "platform_ts_links" USING btree ("ts_uid");--> statement-breakpoint
CREATE INDEX "platform_user_badges_badge_idx" ON "platform_user_badges" USING btree ("badge_key");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_users_username_lower_idx" ON "platform_users" USING btree ("username_lower");--> statement-breakpoint
CREATE INDEX "platform_users_discord_id_idx" ON "platform_users" USING btree ("discord_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_wallet_accounts_owner_idx" ON "platform_wallet_accounts" USING btree ("owner");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_wallet_accounts_sub_idx" ON "platform_wallet_accounts" USING btree ("sub");--> statement-breakpoint
CREATE INDEX "platform_wallet_entries_account_idx" ON "platform_wallet_entries" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "platform_wallet_entries_tx_idx" ON "platform_wallet_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_wallet_tx_idem_idx" ON "platform_wallet_transactions" USING btree ("app","idempotency_key");--> statement-breakpoint
CREATE INDEX "platform_wallet_tx_sub_idx" ON "platform_wallet_transactions" USING btree ("sub");