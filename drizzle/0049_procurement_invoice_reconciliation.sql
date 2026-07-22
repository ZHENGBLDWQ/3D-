ALTER TABLE `purchase_orders` ADD `reconciliation_status` text NOT NULL DEFAULT 'not_submitted' CHECK (`reconciliation_status` IN ('not_submitted','pending_review','matched','approved','rejected'));--> statement-breakpoint
ALTER TABLE `material_purchase_lots` ADD `original_unit_cost_cents_per_kg` integer;--> statement-breakpoint
ALTER TABLE `material_purchase_lots` ADD `reconciled_invoice_id` integer;--> statement-breakpoint
CREATE TABLE `supplier_invoices` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `purchase_order_id` integer NOT NULL,
  `invoice_no` text NOT NULL,
  `invoice_date` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending_review' CHECK (`status` IN ('pending_review','matched','approved','rejected')),
  `actual_subtotal_cents` integer NOT NULL CHECK (`actual_subtotal_cents` >= 0),
  `actual_tax_cents` integer NOT NULL DEFAULT 0 CHECK (`actual_tax_cents` >= 0),
  `actual_freight_cents` integer NOT NULL DEFAULT 0 CHECK (`actual_freight_cents` >= 0),
  `actual_total_cents` integer NOT NULL CHECK (`actual_total_cents` >= 0),
  `approved_total_cents` integer NOT NULL CHECK (`approved_total_cents` >= 0),
  `variance_cents` integer NOT NULL,
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_by` text,
  `reviewed_at` text,
  `review_note` text NOT NULL DEFAULT '',
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`purchase_order_id`),
  UNIQUE (`organization_id`,`invoice_no`)
);--> statement-breakpoint
CREATE INDEX `supplier_invoices_review_idx` ON `supplier_invoices` (`organization_id`,`status`,`invoice_date`);--> statement-breakpoint
CREATE TRIGGER `supplier_invoice_org_guard` BEFORE INSERT ON `supplier_invoices` WHEN NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id=NEW.purchase_order_id AND p.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SUPPLIER_INVOICE_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TABLE `material_cost_adjustments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `supplier_invoice_id` integer NOT NULL,
  `purchase_lot_id` integer NOT NULL,
  `old_unit_cost_cents_per_kg` integer NOT NULL,
  `new_unit_cost_cents_per_kg` integer NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('applied','skipped_settled')),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`supplier_invoice_id`) REFERENCES `supplier_invoices`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`purchase_lot_id`) REFERENCES `material_purchase_lots`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`supplier_invoice_id`,`purchase_lot_id`)
);--> statement-breakpoint
CREATE TRIGGER `material_cost_adjustment_org_guard` BEFORE INSERT ON `material_cost_adjustments` WHEN NOT EXISTS (SELECT 1 FROM supplier_invoices i WHERE i.id=NEW.supplier_invoice_id AND i.organization_id=NEW.organization_id) OR NOT EXISTS (SELECT 1 FROM material_purchase_lots l WHERE l.id=NEW.purchase_lot_id AND l.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_COST_ADJUSTMENT_ORGANIZATION_MISMATCH'); END;
