CREATE TABLE `ts_rank_tiers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sort_order` integer NOT NULL,
	`name` text NOT NULL,
	`min_total_seconds` integer NOT NULL,
	`server_group_id` integer NOT NULL,
	`remove_previous_group` integer DEFAULT true NOT NULL,
	`prestige_flag` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ts_rank_tiers_sort_order_idx` ON `ts_rank_tiers` (`sort_order`);--> statement-breakpoint
CREATE INDEX `ts_rank_tiers_server_group_id_idx` ON `ts_rank_tiers` (`server_group_id`);--> statement-breakpoint
CREATE TABLE `ts_users` (
	`uuid` text PRIMARY KEY NOT NULL,
	`client_db_id` integer DEFAULT 0 NOT NULL,
	`nickname` text NOT NULL,
	`last_seen_at` integer NOT NULL,
	`first_connected_at` integer,
	`total_online_seconds` integer DEFAULT 0 NOT NULL,
	`period_online_seconds` integer DEFAULT 0 NOT NULL,
	`period_idle_seconds` integer DEFAULT 0 NOT NULL,
	`period_key` text NOT NULL,
	`current_tier_id` integer,
	`assigned_server_group_id` integer,
	`excepted` integer DEFAULT false NOT NULL,
	`is_online` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`current_tier_id`) REFERENCES `ts_rank_tiers`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ts_users_period_leaderboard_idx` ON `ts_users` (`period_key`,`period_online_seconds`);--> statement-breakpoint
CREATE INDEX `ts_users_last_seen_idx` ON `ts_users` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `ts_users_total_leaderboard_idx` ON `ts_users` (`total_online_seconds`);--> statement-breakpoint
CREATE TABLE `ts_worker_state` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`last_poll_at` integer,
	`last_success_at` integer,
	`status` text DEFAULT 'idle' NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
