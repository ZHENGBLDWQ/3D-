CREATE TABLE `supplier_material_offers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `supplier_id` integer NOT NULL,
  `catalog_item_id` integer NOT NULL,
  `currency` text NOT NULL DEFAULT 'MYR',
  `unit_price_cents_per_spool` integer NOT NULL CHECK (`unit_price_cents_per_spool` >= 0),
  `tax_rate_bps` integer NOT NULL DEFAULT 0 CHECK (`tax_rate_bps` >= 0 AND `tax_rate_bps` <= 10000),
  `freight_cents_per_order` integer NOT NULL DEFAULT 0 CHECK (`freight_cents_per_order` >= 0),
  `min_order_spools` integer NOT NULL DEFAULT 1 CHECK (`min_order_spools` > 0),
  `lead_time_days` integer NOT NULL DEFAULT 0 CHECK (`lead_time_days` >= 0),
  `valid_from` text NOT NULL,
  `valid_until` text,
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active','expired','disabled')),
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`catalog_item_id`) REFERENCES `material_catalog_items`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`supplier_id`,`catalog_item_id`,`valid_from`)
);--> statement-breakpoint
CREATE INDEX `supplier_material_offers_lookup_idx` ON `supplier_material_offers` (`organization_id`,`catalog_item_id`,`status`,`valid_until`);--> statement-breakpoint
CREATE TRIGGER `supplier_material_offer_org_guard` BEFORE INSERT ON `supplier_material_offers` WHEN NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.id=NEW.supplier_id AND s.organization_id=NEW.organization_id) OR NOT EXISTS (SELECT 1 FROM material_catalog_items c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SUPPLIER_MATERIAL_OFFER_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `selected_offer_id` integer;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cost_status` text NOT NULL DEFAULT 'legacy' CHECK (`cost_status` IN ('legacy','pending','approved'));--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `subtotal_cents` integer NOT NULL DEFAULT 0 CHECK (`subtotal_cents` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `tax_cents` integer NOT NULL DEFAULT 0 CHECK (`tax_cents` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `freight_cents` integer NOT NULL DEFAULT 0 CHECK (`freight_cents` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `landed_total_cents` integer NOT NULL DEFAULT 0 CHECK (`landed_total_cents` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cost_approved_by` text;--> statement-breakpoint
ALTER TABLE `purchase_orders` ADD `cost_approved_at` text;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `offer_id` integer;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `unit_cost_cents_per_spool` integer NOT NULL DEFAULT 0 CHECK (`unit_cost_cents_per_spool` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `landed_cost_cents_per_spool` integer NOT NULL DEFAULT 0 CHECK (`landed_cost_cents_per_spool` >= 0);
