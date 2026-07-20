CREATE TABLE `inventory_in_transit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`grams` real NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`purchase_no` text DEFAULT '' NOT NULL,
	`eta` text,
	`status` text DEFAULT '在途' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`received_at` text,
	FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_printer_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`printer_id` integer NOT NULL,
	`batch_id` integer NOT NULL,
	`ams_unit` integer,
	`tray_index` integer,
	`allocated_grams` real NOT NULL,
	`remaining_grams` real NOT NULL,
	`status` text DEFAULT '使用中' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON UPDATE no action ON DELETE no action
);
