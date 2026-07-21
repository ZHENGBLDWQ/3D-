ALTER TABLE `material_purchase_lots` ADD `goods_receipt_id` integer;--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `purchase_lot_id` integer;--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `spool_count` integer NOT NULL DEFAULT 0 CHECK (`spool_count` >= 0);--> statement-breakpoint
ALTER TABLE `goods_receipt_items` ADD `per_spool_net_grams` real NOT NULL DEFAULT 0 CHECK (`per_spool_net_grams` >= 0);--> statement-breakpoint
CREATE UNIQUE INDEX `material_purchase_lots_receipt_item_unique` ON `material_purchase_lots` (`organization_id`,`goods_receipt_id`,`purchase_order_item_id`) WHERE `goods_receipt_id` IS NOT NULL;--> statement-breakpoint
CREATE TRIGGER `material_purchase_lot_receipt_org_guard` BEFORE INSERT ON `material_purchase_lots` WHEN NEW.goods_receipt_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM goods_receipts r WHERE r.id=NEW.goods_receipt_id AND r.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_PURCHASE_LOT_RECEIPT_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `goods_receipt_item_lot_org_guard` BEFORE UPDATE OF `purchase_lot_id` ON `goods_receipt_items` WHEN NEW.purchase_lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM material_purchase_lots l WHERE l.id=NEW.purchase_lot_id AND l.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'GOODS_RECEIPT_ITEM_LOT_ORGANIZATION_MISMATCH'); END;
