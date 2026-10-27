ALTER TABLE `game_instances` ADD `subdomain` text;
--> statement-breakpoint
ALTER TABLE `game_instances` ADD `dns_record_id` text;
--> statement-breakpoint
ALTER TABLE `game_instances` ADD `hetzner_firewall_id` text;
--> statement-breakpoint
ALTER TABLE `game_instances` ADD `last_activity_at` integer;
--> statement-breakpoint
ALTER TABLE `game_instances` ADD `backup_retention` integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE `game_instances` ADD `backup_on_hibernate` integer DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `progress` text;
--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `log` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `action_jobs` ADD `error` text;
--> statement-breakpoint
CREATE TABLE `game_backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`instance_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`size_bytes` integer,
	`kind` text DEFAULT 'manual' NOT NULL,
	`created_by_user_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`instance_id`) REFERENCES `game_instances`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `game_backups_instance_created_idx` ON `game_backups` (`instance_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `dashboard_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`encrypted` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
