CREATE TABLE "action_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text NOT NULL,
	"error_code" text,
	"error_message" text,
	"log_excerpt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"requested_by_user_id" integer NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"idempotency_key" text NOT NULL,
	"progress" text,
	"log" text DEFAULT '' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"instance_id" integer,
	"event_type" text NOT NULL,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"hetzner_snapshot_id" text NOT NULL,
	"kind" text DEFAULT 'manual' NOT NULL,
	"size_gb" integer,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint,
	"kind" text DEFAULT 'manual' NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"game_type" text NOT NULL,
	"region" text DEFAULT 'fsn1' NOT NULL,
	"desired_state" text DEFAULT 'offline' NOT NULL,
	"active_server_type" text NOT NULL,
	"config_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idle_delete_after_minutes" integer DEFAULT 120 NOT NULL,
	"subdomain" text,
	"dns_record_id" text,
	"hetzner_firewall_id" text,
	"last_activity_at" timestamp with time zone,
	"backup_retention" integer DEFAULT 5 NOT NULL,
	"backup_on_hibernate" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_instances_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "infra_servers" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"hetzner_server_id" text NOT NULL,
	"name" text NOT NULL,
	"ip_v4" text,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "infra_volumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"hetzner_volume_id" text NOT NULL,
	"linux_device" text,
	"mount_path" text NOT NULL,
	"size_gb" integer NOT NULL,
	"status" text DEFAULT 'attached' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infra_volumes_hetzner_volume_id_unique" UNIQUE("hetzner_volume_id")
);
--> statement-breakpoint
CREATE TABLE "instance_ports" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"kind" text NOT NULL,
	"port" integer NOT NULL,
	"protocol" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_status_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"infra_status" text NOT NULL,
	"game_status" text NOT NULL,
	"player_count" integer,
	"max_players" integer,
	"last_heartbeat_at" timestamp with time zone,
	"raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "ts_rank_tiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tier_kind" text DEFAULT 'level' NOT NULL,
	"sort_order" integer NOT NULL,
	"level_number" integer,
	"prestige_level" integer,
	"name" text NOT NULL,
	"min_total_seconds" integer NOT NULL,
	"server_group_id" integer NOT NULL,
	"remove_previous_group" boolean DEFAULT true NOT NULL,
	"prestige_flag" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ts_server_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"online_clients" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ts_users" (
	"uuid" text PRIMARY KEY NOT NULL,
	"client_db_id" integer DEFAULT 0 NOT NULL,
	"nickname" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"first_connected_at" timestamp with time zone,
	"total_online_seconds" integer DEFAULT 0 NOT NULL,
	"cycle_online_seconds" integer DEFAULT 0 NOT NULL,
	"prestige" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 0 NOT NULL,
	"period_online_seconds" integer DEFAULT 0 NOT NULL,
	"period_idle_seconds" integer DEFAULT 0 NOT NULL,
	"period_key" text NOT NULL,
	"week_online_seconds" integer DEFAULT 0 NOT NULL,
	"week_key" text DEFAULT '' NOT NULL,
	"year_online_seconds" integer DEFAULT 0 NOT NULL,
	"year_key" text DEFAULT '' NOT NULL,
	"current_tier_id" integer,
	"assigned_server_group_id" integer,
	"assigned_prestige_group_id" integer,
	"excepted" boolean DEFAULT false NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ts_worker_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"last_poll_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"status" text DEFAULT 'idle' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"discord_id" text,
	"tretu_sub" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"email" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"locale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_discord_id_unique" UNIQUE("discord_id"),
	CONSTRAINT "users_tretu_sub_unique" UNIQUE("tretu_sub"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "action_attempts" ADD CONSTRAINT "action_attempts_job_id_action_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."action_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_jobs" ADD CONSTRAINT "action_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backups" ADD CONSTRAINT "backups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_backups" ADD CONSTRAINT "game_backups_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_backups" ADD CONSTRAINT "game_backups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_servers" ADD CONSTRAINT "infra_servers_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_volumes" ADD CONSTRAINT "infra_volumes_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_ports" ADD CONSTRAINT "instance_ports_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_status_snapshots" ADD CONSTRAINT "instance_status_snapshots_instance_id_game_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."game_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ts_users" ADD CONSTRAINT "ts_users_current_tier_id_ts_rank_tiers_id_fk" FOREIGN KEY ("current_tier_id") REFERENCES "public"."ts_rank_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_attempts_job_created_idx" ON "action_attempts" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "action_jobs_idempotency_key_idx" ON "action_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "action_jobs_instance_created_idx" ON "action_jobs" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "action_jobs_status_idx" ON "action_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_events_user_created_idx" ON "audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_instance_created_idx" ON "audit_events" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_account_idx" ON "auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_accounts_user_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "game_backups_instance_created_idx" ON "game_backups" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "infra_servers_instance_idx" ON "infra_servers" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "instance_status_snapshots_instance_created_idx" ON "instance_status_snapshots" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ts_rank_tiers_kind_sort_idx" ON "ts_rank_tiers" USING btree ("tier_kind","sort_order");--> statement-breakpoint
CREATE INDEX "ts_rank_tiers_server_group_id_idx" ON "ts_rank_tiers" USING btree ("server_group_id");--> statement-breakpoint
CREATE INDEX "ts_server_snapshots_recorded_at_idx" ON "ts_server_snapshots" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "ts_users_period_leaderboard_idx" ON "ts_users" USING btree ("period_key","period_online_seconds");--> statement-breakpoint
CREATE INDEX "ts_users_week_leaderboard_idx" ON "ts_users" USING btree ("week_key","week_online_seconds");--> statement-breakpoint
CREATE INDEX "ts_users_year_leaderboard_idx" ON "ts_users" USING btree ("year_key","year_online_seconds");--> statement-breakpoint
CREATE INDEX "ts_users_last_seen_idx" ON "ts_users" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "ts_users_total_leaderboard_idx" ON "ts_users" USING btree ("total_online_seconds");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_idx" ON "user_roles" USING btree ("user_id","role_id");