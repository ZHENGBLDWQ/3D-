ALTER TABLE `material_catalog_items` ADD `source_type` text NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `material_catalog_items` ADD `source_url` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `material_catalog_items` ADD `source_checked_at` text;--> statement-breakpoint
ALTER TABLE `material_catalog_items` ADD `official_verified` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE `material_catalog_aliases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `catalog_item_id` integer NOT NULL,
  `alias_type` text NOT NULL CHECK (`alias_type` IN ('material','color_name','color_code','color_hex','rfid_material')),
  `alias_value` text NOT NULL,
  `source` text NOT NULL DEFAULT 'manual',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`catalog_item_id`) REFERENCES `material_catalog_items`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`catalog_item_id`,`alias_type`,`alias_value`)
);--> statement-breakpoint
CREATE INDEX `material_catalog_alias_lookup_idx` ON `material_catalog_aliases` (`organization_id`,`alias_type`,`alias_value`);--> statement-breakpoint
CREATE TRIGGER `material_catalog_alias_org_guard` BEFORE INSERT ON `material_catalog_aliases` WHEN NOT EXISTS (SELECT 1 FROM `material_catalog_items` c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_CATALOG_ALIAS_ORGANIZATION_MISMATCH'); END;
