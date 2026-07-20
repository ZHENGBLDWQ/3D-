CREATE TABLE `print_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`kind` text NOT NULL,
	`version` text DEFAULT 'v1' NOT NULL,
	`size_bytes` integer NOT NULL,
	`content_type` text NOT NULL,
	`printer_profile` text DEFAULT '' NOT NULL,
	`layer_height` real,
	`infill_percent` real,
	`estimated_minutes` integer,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `print_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `print_files_object_key_unique` ON `print_files` (`object_key`);