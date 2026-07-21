CREATE TABLE `material_catalog_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `catalog_code` text NOT NULL,
  `brand` text NOT NULL DEFAULT '',
  `series` text NOT NULL DEFAULT '',
  `material` text NOT NULL,
  `color_name` text NOT NULL DEFAULT '',
  `color_name_en` text NOT NULL DEFAULT '',
  `color_code` text NOT NULL DEFAULT '',
  `color_hex` text NOT NULL DEFAULT '',
  `density_g_cm3` real NOT NULL DEFAULT 1.24 CHECK (`density_g_cm3` > 0),
  `default_net_grams` real NOT NULL DEFAULT 1000 CHECK (`default_net_grams` > 0),
  `default_tare_grams` real NOT NULL DEFAULT 0 CHECK (`default_tare_grams` >= 0),
  `ams_compatibility` text NOT NULL DEFAULT 'unknown' CHECK (`ams_compatibility` IN ('compatible','incompatible','conditional','unknown')),
  `tags` text NOT NULL DEFAULT '[]',
  `legacy_batch_id` integer,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`legacy_batch_id`) REFERENCES `material_batches`(`id`) ON DELETE SET NULL,
  UNIQUE (`organization_id`,`catalog_code`),
  UNIQUE (`organization_id`,`legacy_batch_id`)
);--> statement-breakpoint
CREATE INDEX `material_catalog_org_material_idx` ON `material_catalog_items` (`organization_id`,`material`,`brand`);--> statement-breakpoint
CREATE TABLE `material_purchase_lots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `catalog_item_id` integer NOT NULL,
  `lot_no` text NOT NULL,
  `supplier_id` integer,
  `purchase_order_item_id` integer,
  `unit_cost_cents_per_kg` integer NOT NULL DEFAULT 0 CHECK (`unit_cost_cents_per_kg` >= 0),
  `received_at` text,
  `expires_at` text,
  `legacy_batch_id` integer,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`catalog_item_id`) REFERENCES `material_catalog_items`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`purchase_order_item_id`) REFERENCES `purchase_order_items`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`legacy_batch_id`) REFERENCES `material_batches`(`id`) ON DELETE SET NULL,
  UNIQUE (`organization_id`,`lot_no`)
);--> statement-breakpoint
CREATE TABLE `inventory_locations_v2` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `code` text NOT NULL,
  `name` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('warehouse','open_storage','printer_feed','scrap','consumed')),
  `printer_id` integer,
  `active` integer NOT NULL DEFAULT 1 CHECK (`active` IN (0,1)),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`code`)
);--> statement-breakpoint
CREATE TABLE `material_spools` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `spool_code` text NOT NULL,
  `catalog_item_id` integer NOT NULL,
  `purchase_lot_id` integer,
  `current_location_id` integer NOT NULL,
  `state` text NOT NULL DEFAULT 'sealed' CHECK (`state` IN ('sealed','open_storage','in_use','empty','scrapped','needs_count')),
  `initial_net_grams` real NOT NULL CHECK (`initial_net_grams` >= 0),
  `remaining_net_grams` real NOT NULL CHECK (`remaining_net_grams` >= 0),
  `tare_grams` real NOT NULL DEFAULT 0 CHECK (`tare_grams` >= 0),
  `last_gross_grams` real CHECK (`last_gross_grams` IS NULL OR `last_gross_grams` >= 0),
  `rfid_uid` text NOT NULL DEFAULT '',
  `qr_token` text NOT NULL,
  `legacy_batch_id` integer,
  `opened_at` text,
  `last_weighed_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`catalog_item_id`) REFERENCES `material_catalog_items`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`purchase_lot_id`) REFERENCES `material_purchase_lots`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`current_location_id`) REFERENCES `inventory_locations_v2`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`legacy_batch_id`) REFERENCES `material_batches`(`id`) ON DELETE SET NULL,
  UNIQUE (`organization_id`,`spool_code`),
  UNIQUE (`qr_token`)
);--> statement-breakpoint
CREATE UNIQUE INDEX `material_spools_org_rfid_unique` ON `material_spools` (`organization_id`,`rfid_uid`) WHERE `rfid_uid`<>'';--> statement-breakpoint
CREATE INDEX `material_spools_org_state_location_idx` ON `material_spools` (`organization_id`,`state`,`current_location_id`);--> statement-breakpoint
CREATE TABLE `printer_feed_positions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `feed_kind` text NOT NULL CHECK (`feed_kind` IN ('ams','ams_lite','ams_ht','external')),
  `ams_unit` integer,
  `slot_index` integer,
  `toolhead` text NOT NULL DEFAULT 'main' CHECK (`toolhead` IN ('main','auxiliary','left','right','unknown')),
  `label` text NOT NULL DEFAULT '',
  `active` integer NOT NULL DEFAULT 1 CHECK (`active` IN (0,1)),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`printer_id`,`feed_kind`,`ams_unit`,`slot_index`,`toolhead`)
);--> statement-breakpoint
CREATE TABLE `spool_bindings` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `spool_id` integer NOT NULL,
  `feed_position_id` integer NOT NULL,
  `binding_source` text NOT NULL CHECK (`binding_source` IN ('scan','rfid','manual','agent','legacy')),
  `status` text NOT NULL DEFAULT 'active' CHECK (`status` IN ('active','released','conflict')),
  `detected_snapshot` text NOT NULL DEFAULT '{}',
  `bound_by` text NOT NULL DEFAULT '',
  `bound_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unbound_at` text,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`feed_position_id`) REFERENCES `printer_feed_positions`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE UNIQUE INDEX `spool_bindings_active_spool_unique` ON `spool_bindings` (`spool_id`) WHERE `status`='active';--> statement-breakpoint
CREATE UNIQUE INDEX `spool_bindings_active_position_unique` ON `spool_bindings` (`feed_position_id`) WHERE `status`='active';--> statement-breakpoint
CREATE TABLE `print_sessions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `job_id` integer,
  `external_print_job_id` integer,
  `source` text NOT NULL DEFAULT 'bambu_studio' CHECK (`source` IN ('bambu_studio','printer_reprint','manual','unknown')),
  `external_session_key` text NOT NULL,
  `filename` text NOT NULL DEFAULT '',
  `status` text NOT NULL DEFAULT 'observed' CHECK (`status` IN ('observed','printing','paused','completed','failed','cancelled','unmatched')),
  `started_at` text,
  `completed_at` text,
  `last_observed_at` text NOT NULL,
  `telemetry_snapshot` text NOT NULL DEFAULT '{}',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`external_print_job_id`) REFERENCES `external_print_jobs`(`id`) ON DELETE SET NULL,
  UNIQUE (`organization_id`,`external_session_key`)
);--> statement-breakpoint
CREATE INDEX `print_sessions_org_status_idx` ON `print_sessions` (`organization_id`,`status`,`last_observed_at` DESC);--> statement-breakpoint
CREATE TABLE `print_material_usage_lines` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `print_session_id` integer NOT NULL,
  `spool_id` integer,
  `feed_position_id` integer,
  `toolhead` text NOT NULL DEFAULT 'unknown' CHECK (`toolhead` IN ('main','auxiliary','left','right','unknown')),
  `purpose` text NOT NULL CHECK (`purpose` IN ('model','support','support_interface','purge','wipe_tower','brim','calibration','unknown')),
  `estimate_source` text NOT NULL DEFAULT 'unknown' CHECK (`estimate_source` IN ('3mf','gcode','telemetry','scale','manual','unknown')),
  `estimated_grams` real NOT NULL DEFAULT 0 CHECK (`estimated_grams` >= 0),
  `settled_grams` real CHECK (`settled_grams` IS NULL OR `settled_grams` >= 0),
  `measured_grams` real CHECK (`measured_grams` IS NULL OR `measured_grams` >= 0),
  `cost_cents` integer NOT NULL DEFAULT 0 CHECK (`cost_cents` >= 0),
  `settled_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`print_session_id`) REFERENCES `print_sessions`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`feed_position_id`) REFERENCES `printer_feed_positions`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE INDEX `print_material_usage_session_purpose_idx` ON `print_material_usage_lines` (`print_session_id`,`purpose`,`toolhead`);--> statement-breakpoint
CREATE TABLE `material_spool_movements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `spool_id` integer NOT NULL,
  `movement_type` text NOT NULL CHECK (`movement_type` IN ('receipt','issue','transfer','return','consume','loss','scrap','adjust')),
  `from_location_id` integer,
  `to_location_id` integer,
  `usage_line_id` integer,
  `net_grams_delta` real NOT NULL DEFAULT 0,
  `idempotency_key` text NOT NULL,
  `operator_email` text NOT NULL DEFAULT '',
  `note` text NOT NULL DEFAULT '',
  `occurred_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`from_location_id`) REFERENCES `inventory_locations_v2`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`to_location_id`) REFERENCES `inventory_locations_v2`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`usage_line_id`) REFERENCES `print_material_usage_lines`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`idempotency_key`)
);--> statement-breakpoint
CREATE INDEX `material_spool_movements_spool_time_idx` ON `material_spool_movements` (`spool_id`,`occurred_at` DESC);--> statement-breakpoint
CREATE TABLE `spool_weight_checks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `spool_id` integer NOT NULL,
  `gross_grams` real NOT NULL CHECK (`gross_grams` >= 0),
  `tare_grams` real NOT NULL CHECK (`tare_grams` >= 0),
  `measured_net_grams` real NOT NULL CHECK (`measured_net_grams` >= 0),
  `book_net_grams` real NOT NULL CHECK (`book_net_grams` >= 0),
  `variance_grams` real NOT NULL,
  `adjustment_movement_id` integer,
  `measured_by` text NOT NULL,
  `measured_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`adjustment_movement_id`) REFERENCES `material_spool_movements`(`id`) ON DELETE RESTRICT,
  UNIQUE (`adjustment_movement_id`)
);--> statement-breakpoint
CREATE TRIGGER `material_spool_movements_immutable_update` BEFORE UPDATE ON `material_spool_movements` BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_MOVEMENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `material_spool_movements_immutable_delete` BEFORE DELETE ON `material_spool_movements` BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_MOVEMENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `spool_weight_checks_immutable_update` BEFORE UPDATE ON `spool_weight_checks` BEGIN SELECT RAISE(ABORT,'SPOOL_WEIGHT_CHECK_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `spool_weight_checks_immutable_delete` BEFORE DELETE ON `spool_weight_checks` BEGIN SELECT RAISE(ABORT,'SPOOL_WEIGHT_CHECK_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `print_material_usage_settled_immutable_update` BEFORE UPDATE ON `print_material_usage_lines` WHEN OLD.`settled_at` IS NOT NULL BEGIN SELECT RAISE(ABORT,'PRINT_MATERIAL_USAGE_SETTLED_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `print_material_usage_settled_immutable_delete` BEFORE DELETE ON `print_material_usage_lines` WHEN OLD.`settled_at` IS NOT NULL BEGIN SELECT RAISE(ABORT,'PRINT_MATERIAL_USAGE_SETTLED_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `material_spools_org_guard_insert` BEFORE INSERT ON `material_spools` WHEN NOT EXISTS (SELECT 1 FROM `material_catalog_items` c JOIN `inventory_locations_v2` l ON l.id=NEW.current_location_id WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id AND l.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `material_spools_org_guard_update` BEFORE UPDATE OF `organization_id`,`catalog_item_id`,`current_location_id` ON `material_spools` WHEN NOT EXISTS (SELECT 1 FROM `material_catalog_items` c JOIN `inventory_locations_v2` l ON l.id=NEW.current_location_id WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id AND l.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `material_purchase_lots_org_guard_insert` BEFORE INSERT ON `material_purchase_lots` WHEN NOT EXISTS (SELECT 1 FROM `material_catalog_items` c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_PURCHASE_LOT_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `material_purchase_lots_org_guard_update` BEFORE UPDATE OF `organization_id`,`catalog_item_id` ON `material_purchase_lots` WHEN NOT EXISTS (SELECT 1 FROM `material_catalog_items` c WHERE c.id=NEW.catalog_item_id AND c.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_PURCHASE_LOT_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `spool_bindings_org_guard_insert` BEFORE INSERT ON `spool_bindings` WHEN NOT EXISTS (SELECT 1 FROM `material_spools` s JOIN `printer_feed_positions` p ON p.id=NEW.feed_position_id WHERE s.id=NEW.spool_id AND s.organization_id=NEW.organization_id AND p.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SPOOL_BINDING_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `spool_bindings_org_guard_update` BEFORE UPDATE OF `organization_id`,`spool_id`,`feed_position_id` ON `spool_bindings` WHEN NOT EXISTS (SELECT 1 FROM `material_spools` s JOIN `printer_feed_positions` p ON p.id=NEW.feed_position_id WHERE s.id=NEW.spool_id AND s.organization_id=NEW.organization_id AND p.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SPOOL_BINDING_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `print_material_usage_org_guard_insert` BEFORE INSERT ON `print_material_usage_lines` WHEN NOT EXISTS (SELECT 1 FROM `print_sessions` s WHERE s.id=NEW.print_session_id AND s.organization_id=NEW.organization_id) OR (NEW.spool_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `material_spools` p WHERE p.id=NEW.spool_id AND p.organization_id=NEW.organization_id)) BEGIN SELECT RAISE(ABORT,'PRINT_MATERIAL_USAGE_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `print_material_usage_org_guard_update` BEFORE UPDATE OF `organization_id`,`print_session_id`,`spool_id` ON `print_material_usage_lines` WHEN NOT EXISTS (SELECT 1 FROM `print_sessions` s WHERE s.id=NEW.print_session_id AND s.organization_id=NEW.organization_id) OR (NEW.spool_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `material_spools` p WHERE p.id=NEW.spool_id AND p.organization_id=NEW.organization_id)) BEGIN SELECT RAISE(ABORT,'PRINT_MATERIAL_USAGE_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `material_spool_movements_org_guard_insert` BEFORE INSERT ON `material_spool_movements` WHEN NOT EXISTS (SELECT 1 FROM `material_spools` s WHERE s.id=NEW.spool_id AND s.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_MOVEMENT_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
CREATE TRIGGER `material_spool_movements_direction_guard` BEFORE INSERT ON `material_spool_movements` WHEN (NEW.movement_type IN ('consume','loss','scrap') AND NEW.net_grams_delta>0) OR (NEW.movement_type='receipt' AND NEW.net_grams_delta<0) BEGIN SELECT RAISE(ABORT,'MATERIAL_SPOOL_MOVEMENT_DIRECTION_INVALID'); END;--> statement-breakpoint
CREATE TRIGGER `spool_weight_checks_org_guard_insert` BEFORE INSERT ON `spool_weight_checks` WHEN NOT EXISTS (SELECT 1 FROM `material_spools` s WHERE s.id=NEW.spool_id AND s.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SPOOL_WEIGHT_CHECK_ORGANIZATION_MISMATCH'); END;--> statement-breakpoint
INSERT OR IGNORE INTO `inventory_locations_v2` (`organization_id`,`code`,`name`,`kind`) SELECT `id`,'MAIN','主仓','warehouse' FROM `organizations`;--> statement-breakpoint
INSERT OR IGNORE INTO `inventory_locations_v2` (`organization_id`,`code`,`name`,`kind`) SELECT `id`,'OPEN','已开封周转','open_storage' FROM `organizations`;--> statement-breakpoint
INSERT OR IGNORE INTO `material_catalog_items` (`organization_id`,`catalog_code`,`brand`,`material`,`color_name`,`legacy_batch_id`,`default_net_grams`) SELECT mbo.organization_id,'LEGACY-'||b.id,b.brand,b.material,b.color,b.id,CASE WHEN COALESCE(m.spool_weight_grams,0)>0 THEN m.spool_weight_grams ELSE 1000 END FROM `material_batch_organizations` mbo JOIN `material_batches` b ON b.id=mbo.batch_id LEFT JOIN `material_inventory_meta` m ON m.batch_id=b.id;--> statement-breakpoint
INSERT OR IGNORE INTO `material_purchase_lots` (`organization_id`,`catalog_item_id`,`lot_no`,`unit_cost_cents_per_kg`,`received_at`,`legacy_batch_id`) SELECT c.organization_id,c.id,'LEGACY-'||c.legacy_batch_id,CAST(ROUND(b.cost_per_kg*100) AS INTEGER),m.received_at,c.legacy_batch_id FROM `material_catalog_items` c JOIN `material_batches` b ON b.id=c.legacy_batch_id LEFT JOIN `material_inventory_meta` m ON m.batch_id=b.id WHERE c.legacy_batch_id IS NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `material_spools` (`organization_id`,`spool_code`,`catalog_item_id`,`purchase_lot_id`,`current_location_id`,`state`,`initial_net_grams`,`remaining_net_grams`,`tare_grams`,`qr_token`,`legacy_batch_id`) SELECT c.organization_id,'LEGACY-'||c.legacy_batch_id,c.id,l.id,loc.id,'needs_count',b.initial_grams,b.remaining_grams,0,'legacy:'||c.organization_id||':'||c.legacy_batch_id,c.legacy_batch_id FROM `material_catalog_items` c JOIN `material_batches` b ON b.id=c.legacy_batch_id JOIN `material_purchase_lots` l ON l.organization_id=c.organization_id AND l.legacy_batch_id=c.legacy_batch_id JOIN `inventory_locations_v2` loc ON loc.organization_id=c.organization_id AND loc.code='MAIN' WHERE c.legacy_batch_id IS NOT NULL;--> statement-breakpoint
CREATE VIEW `material_inventory_v2_compat` AS SELECT s.organization_id,s.legacy_batch_id batch_id,c.catalog_code sku,c.material,c.color_name color,c.brand,s.remaining_net_grams remaining_grams,s.state,l.code location_code FROM material_spools s JOIN material_catalog_items c ON c.id=s.catalog_item_id JOIN inventory_locations_v2 l ON l.id=s.current_location_id WHERE s.legacy_batch_id IS NOT NULL;
