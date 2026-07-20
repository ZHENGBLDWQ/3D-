CREATE TABLE `inventory_stocktakes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`book_grams` real NOT NULL,
	`counted_grams` real NOT NULL,
	`variance_grams` real NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inventory_transaction_meta` (
	`transaction_id` integer PRIMARY KEY NOT NULL,
	`document_no` text DEFAULT '' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`warehouse` text DEFAULT '主仓' NOT NULL,
	`source` text DEFAULT '人工' NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `inventory_transactions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `material_inventory_meta` (
	`batch_id` integer PRIMARY KEY NOT NULL,
	`sku` text NOT NULL,
	`specification` text DEFAULT '' NOT NULL,
	`spool_weight_grams` real DEFAULT 1000 NOT NULL,
	`spool_count` real DEFAULT 1 NOT NULL,
	`supplier` text DEFAULT '' NOT NULL,
	`warehouse` text DEFAULT '主仓' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`lot_no` text DEFAULT '' NOT NULL,
	`received_at` text,
	`expiry_at` text,
	`status` text DEFAULT '在库' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_inventory_meta_sku_unique` ON `material_inventory_meta` (`sku`);