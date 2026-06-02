CREATE TABLE `ts_server_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recorded_at` integer NOT NULL,
	`online_clients` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ts_server_snapshots_recorded_at_idx` ON `ts_server_snapshots` (`recorded_at`);
