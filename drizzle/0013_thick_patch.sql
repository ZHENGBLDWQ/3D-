CREATE TABLE `bambu_material_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`filename` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`ams_unit` integer,
	`tray_index` integer,
	`estimated_grams` real DEFAULT 0 NOT NULL,
	`consumed_grams` real DEFAULT 0 NOT NULL,
	`result` text DEFAULT '完成' NOT NULL,
	`started_at` text,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
