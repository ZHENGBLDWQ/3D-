CREATE TABLE `bambu_ams_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`ams_unit` integer DEFAULT 0 NOT NULL,
	`tray_index` integer NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`color_hex` text DEFAULT '' NOT NULL,
	`remaining_percent` real,
	`tag_uid` text DEFAULT '' NOT NULL,
	`mapped_spool_external_id` integer,
	`active` integer DEFAULT false NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE no action
);
