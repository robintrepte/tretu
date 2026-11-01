DROP INDEX `ts_rank_tiers_sort_order_idx`;--> statement-breakpoint
ALTER TABLE `ts_rank_tiers` ADD `tier_kind` text DEFAULT 'level' NOT NULL;--> statement-breakpoint
ALTER TABLE `ts_rank_tiers` ADD `level_number` integer;--> statement-breakpoint
ALTER TABLE `ts_rank_tiers` ADD `prestige_level` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `ts_rank_tiers_kind_sort_idx` ON `ts_rank_tiers` (`tier_kind`,`sort_order`);--> statement-breakpoint
ALTER TABLE `ts_users` ADD `cycle_online_seconds` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ts_users` ADD `prestige` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ts_users` ADD `current_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ts_users` ADD `assigned_prestige_group_id` integer;