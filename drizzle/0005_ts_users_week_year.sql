ALTER TABLE `ts_users` ADD `week_online_seconds` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ts_users` ADD `week_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `ts_users` ADD `year_online_seconds` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `ts_users` ADD `year_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX `ts_users_week_leaderboard_idx` ON `ts_users` (`week_key`,`week_online_seconds`);
--> statement-breakpoint
CREATE INDEX `ts_users_year_leaderboard_idx` ON `ts_users` (`year_key`,`year_online_seconds`);
