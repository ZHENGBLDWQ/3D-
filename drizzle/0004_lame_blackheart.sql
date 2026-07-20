CREATE TABLE `printers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`technology` text DEFAULT 'FDM' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`nozzle_diameter` real DEFAULT 0.4 NOT NULL,
	`build_volume` text DEFAULT '' NOT NULL,
	`status` text DEFAULT '空闲' NOT NULL,
	`total_hours` real DEFAULT 0 NOT NULL,
	`maintenance_due_at` text,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printers_name_unique` ON `printers` (`name`);