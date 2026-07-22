CREATE TABLE `replenishment_forecast_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `procurement_request_id` integer NOT NULL,
  `catalog_item_id` integer NOT NULL,
  `idempotency_key` text NOT NULL,
  `suggested_spools` integer NOT NULL CHECK (`suggested_spools` > 0),
  `adjusted_spools` integer NOT NULL CHECK (`adjusted_spools` > 0),
  `forecast_cost_cents` integer NOT NULL DEFAULT 0 CHECK (`forecast_cost_cents` >= 0),
  `risk` text NOT NULL,
  `confidence` text NOT NULL,
  `forecast_json` text NOT NULL,
  `adjustment_reason` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`procurement_request_id`) REFERENCES `procurement_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`catalog_item_id`) REFERENCES `material_catalog_items`(`id`),
  UNIQUE (`organization_id`,`idempotency_key`),
  UNIQUE (`organization_id`,`procurement_request_id`)
);--> statement-breakpoint
CREATE INDEX `replenishment_forecast_snapshots_catalog_idx` ON `replenishment_forecast_snapshots` (`organization_id`,`catalog_item_id`,`created_at`);--> statement-breakpoint
CREATE TRIGGER `replenishment_forecast_snapshot_org_guard` BEFORE INSERT ON `replenishment_forecast_snapshots` WHEN NOT EXISTS (SELECT 1 FROM procurement_requests r WHERE r.id=NEW.procurement_request_id AND r.organization_id=NEW.organization_id) OR NOT EXISTS (SELECT 1 FROM material_catalog_items c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'REPLENISHMENT_FORECAST_SNAPSHOT_ORGANIZATION_MISMATCH'); END;
