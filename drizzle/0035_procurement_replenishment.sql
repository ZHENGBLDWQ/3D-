CREATE TABLE `material_batch_organizations` (
  `organization_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`organization_id`,`batch_id`),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `suppliers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `contact` text NOT NULL DEFAULT '',
  `phone` text NOT NULL DEFAULT '',
  `email` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active','inactive')),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`code`)
);--> statement-breakpoint
CREATE TABLE `procurement_requests` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `request_no` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft' CHECK (`status` IN ('draft','pending','approved','ordered','cancelled')),
  `reason` text NOT NULL DEFAULT '',
  `requested_by` text NOT NULL,
  `approved_by` text,
  `approved_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`request_no`)
);--> statement-breakpoint
CREATE TABLE `procurement_request_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `request_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `requested_grams` real NOT NULL CHECK (`requested_grams` > 0),
  `suggested_grams` real NOT NULL DEFAULT 0 CHECK (`suggested_grams` >= 0),
  `note` text NOT NULL DEFAULT '',
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_id`) REFERENCES `procurement_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`),
  UNIQUE (`request_id`,`batch_id`)
);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `request_id` integer NOT NULL,
  `supplier_id` integer NOT NULL,
  `purchase_no` text NOT NULL,
  `status` text NOT NULL DEFAULT 'approved' CHECK (`status` IN ('approved','ordered','partially_received','completed','cancelled')),
  `ordered_at` text,
  `cancelled_at` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_id`) REFERENCES `procurement_requests`(`id`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`),
  UNIQUE (`organization_id`,`purchase_no`),
  UNIQUE (`request_id`)
);--> statement-breakpoint
CREATE TABLE `purchase_order_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `purchase_order_id` integer NOT NULL,
  `request_item_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `ordered_grams` real NOT NULL CHECK (`ordered_grams` > 0),
  `received_grams` real NOT NULL DEFAULT 0 CHECK (`received_grams` >= 0 AND `received_grams` <= `ordered_grams`),
  `unit_cost_per_kg` real NOT NULL DEFAULT 0 CHECK (`unit_cost_per_kg` >= 0),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_item_id`) REFERENCES `procurement_request_items`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`),
  UNIQUE (`purchase_order_id`,`request_item_id`)
);--> statement-breakpoint
CREATE TABLE `goods_receipts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `purchase_order_id` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `receipt_no` text NOT NULL,
  `received_by` text NOT NULL,
  `received_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`),
  UNIQUE (`organization_id`,`idempotency_key`),
  UNIQUE (`organization_id`,`receipt_no`)
);--> statement-breakpoint
CREATE TABLE `goods_receipt_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `receipt_id` integer NOT NULL,
  `purchase_order_item_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `received_grams` real NOT NULL CHECK (`received_grams` > 0),
  `inventory_transaction_id` integer NOT NULL UNIQUE,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`receipt_id`) REFERENCES `goods_receipts`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items`(`id`),
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`),
  FOREIGN KEY (`inventory_transaction_id`) REFERENCES `inventory_transactions`(`id`)
);--> statement-breakpoint
CREATE INDEX `procurement_requests_org_status_idx` ON `procurement_requests` (`organization_id`,`status`,`created_at` DESC);--> statement-breakpoint
CREATE INDEX `purchase_orders_org_status_idx` ON `purchase_orders` (`organization_id`,`status`,`created_at` DESC);--> statement-breakpoint
CREATE INDEX `goods_receipts_org_order_idx` ON `goods_receipts` (`organization_id`,`purchase_order_id`,`received_at` DESC);--> statement-breakpoint
CREATE TRIGGER `purchase_order_item_receipt_guard` BEFORE UPDATE OF `received_grams` ON `purchase_order_items`
WHEN NEW.`received_grams` < OLD.`received_grams` OR NEW.`received_grams` > NEW.`ordered_grams`
BEGIN SELECT RAISE(ABORT,'invalid receipt quantity'); END;
--> statement-breakpoint
INSERT OR IGNORE INTO `material_batch_organizations` (`organization_id`,`batch_id`)
SELECT DISTINCT `organization_id`,`batch_id` FROM `material_reservations`;
--> statement-breakpoint
INSERT OR IGNORE INTO `material_batch_organizations` (`organization_id`,`batch_id`)
SELECT (SELECT MIN(`id`) FROM `organizations`),b.`id` FROM `material_batches` b
WHERE (SELECT COUNT(*) FROM `organizations`)=1;
