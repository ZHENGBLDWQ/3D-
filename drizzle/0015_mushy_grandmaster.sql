CREATE TABLE `cost_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`electricity_rate` real DEFAULT 0.8 NOT NULL,
	`labor_rate` real DEFAULT 0 NOT NULL,
	`labor_minutes_per_job` real DEFAULT 0 NOT NULL,
	`overhead_percent` real DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `printers` ADD `power_watts` real DEFAULT 1000 NOT NULL;