CREATE TABLE `spoolman_spools` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` integer NOT NULL,
	`filament_name` text DEFAULT '' NOT NULL,
	`vendor` text DEFAULT '' NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`color_hex` text DEFAULT '' NOT NULL,
	`initial_weight` real,
	`remaining_weight` real,
	`used_weight` real,
	`location` text DEFAULT '' NOT NULL,
	`lot_nr` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`last_used` text,
	`synced_by_printer_id` integer,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`synced_by_printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spoolman_spools_external_id_unique` ON `spoolman_spools` (`external_id`);