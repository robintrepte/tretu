CREATE TABLE `action_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`attempt_no` integer NOT NULL,
	`status` text NOT NULL,
	`error_code` text,
	`error_message` text,
	`log_excerpt` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `action_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `action_attempts_job_created_idx` ON `action_attempts` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `action_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`action_type` text NOT NULL,
	`requested_by_user_id` integer NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `action_jobs_idempotency_key_idx` ON `action_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `action_jobs_instance_created_idx` ON `action_jobs` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`instance_id` integer,
	`event_type` text NOT NULL,
	`meta_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_events_user_created_idx` ON `audit_events` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_instance_created_idx` ON `audit_events` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`hetzner_snapshot_id` text NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`size_gb` integer,
	`created_by_user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`restored_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_instances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`game_type` text NOT NULL,
	`region` text DEFAULT 'fsn1' NOT NULL,
	`desired_state` text DEFAULT 'offline' NOT NULL,
	`active_server_type` text NOT NULL,
	`config_profile` text DEFAULT '{}' NOT NULL,
	`idle_delete_after_minutes` integer DEFAULT 120 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_instances_slug_unique` ON `game_instances` (`slug`);--> statement-breakpoint
CREATE TABLE `infra_servers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`hetzner_server_id` text NOT NULL,
	`name` text NOT NULL,
	`ip_v4` text,
	`status` text DEFAULT 'provisioning' NOT NULL,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `infra_servers_instance_idx` ON `infra_servers` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `infra_volumes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`hetzner_volume_id` text NOT NULL,
	`linux_device` text,
	`mount_path` text NOT NULL,
	`size_gb` integer NOT NULL,
	`status` text DEFAULT 'attached' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `infra_volumes_hetzner_volume_id_unique` ON `infra_volumes` (`hetzner_volume_id`);--> statement-breakpoint
CREATE TABLE `instance_ports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`kind` text NOT NULL,
	`port` integer NOT NULL,
	`protocol` text NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `instance_status_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`infra_status` text NOT NULL,
	`game_status` text NOT NULL,
	`player_count` integer,
	`max_players` integer,
	`last_heartbeat_at` integer,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `instance_status_snapshots_instance_created_idx` ON `instance_status_snapshots` (`instance_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_key_unique` ON `roles` (`key`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_user_role_idx` ON `user_roles` (`user_id`,`role_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`discord_id` text NOT NULL,
	`display_name` text NOT NULL,
	`avatar_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_discord_id_unique` ON `users` (`discord_id`);