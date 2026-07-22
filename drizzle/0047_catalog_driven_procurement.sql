ALTER TABLE `material_catalog_items` ADD `reorder_point_spools` integer NOT NULL DEFAULT 2 CHECK (`reorder_point_spools` >= 0);--> statement-breakpoint
ALTER TABLE `material_catalog_items` ADD `target_stock_spools` integer NOT NULL DEFAULT 5 CHECK (`target_stock_spools` >= `reorder_point_spools`);--> statement-breakpoint
ALTER TABLE `procurement_request_items` ADD `catalog_item_id` integer;--> statement-breakpoint
ALTER TABLE `procurement_request_items` ADD `requested_spools` integer NOT NULL DEFAULT 0 CHECK (`requested_spools` >= 0);--> statement-breakpoint
ALTER TABLE `procurement_request_items` ADD `per_spool_net_grams` real NOT NULL DEFAULT 0 CHECK (`per_spool_net_grams` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `catalog_item_id` integer;--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `ordered_spools` integer NOT NULL DEFAULT 0 CHECK (`ordered_spools` >= 0);--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `received_spools` integer NOT NULL DEFAULT 0 CHECK (`received_spools` >= 0 AND (`ordered_spools` = 0 OR `received_spools` <= `ordered_spools`));--> statement-breakpoint
ALTER TABLE `purchase_order_items` ADD `per_spool_net_grams` real NOT NULL DEFAULT 0 CHECK (`per_spool_net_grams` >= 0);--> statement-breakpoint
CREATE INDEX `procurement_request_items_catalog_idx` ON `procurement_request_items` (`organization_id`,`catalog_item_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_items_catalog_idx` ON `purchase_order_items` (`organization_id`,`catalog_item_id`);--> statement-breakpoint
CREATE TRIGGER `procurement_request_catalog_org_guard` BEFORE INSERT ON `procurement_request_items` WHEN NEW.catalog_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM material_catalog_items c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'PROCUREMENT_REQUEST_CATALOG_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_order_catalog_org_guard` BEFORE INSERT ON `purchase_order_items` WHEN NEW.catalog_item_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM material_catalog_items c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'PURCHASE_ORDER_CATALOG_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `purchase_order_item_spool_receipt_guard` BEFORE UPDATE OF `received_spools` ON `purchase_order_items` WHEN NEW.received_spools < OLD.received_spools OR (NEW.ordered_spools > 0 AND NEW.received_spools > NEW.ordered_spools) BEGIN SELECT RAISE(ABORT,'INVALID_RECEIVED_SPOOL_COUNT'); END;
