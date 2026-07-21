CREATE TABLE `production_outcomes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `workflow_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `successful_quantity` integer NOT NULL DEFAULT 0 CHECK (`successful_quantity` >= 0),
  `failed_quantity` integer NOT NULL DEFAULT 0 CHECK (`failed_quantity` >= 0),
  `failure_reason` text NOT NULL DEFAULT '',
  `notes` text NOT NULL DEFAULT '',
  `photo_metadata` text NOT NULL DEFAULT '[]',
  `reported_by` text NOT NULL,
  `reported_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`workflow_id`) REFERENCES `dispatch_workflows`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT,
  UNIQUE (`workflow_id`)
);--> statement-breakpoint
CREATE INDEX `production_outcomes_org_reported_idx` ON `production_outcomes` (`organization_id`,`reported_at` DESC);--> statement-breakpoint
CREATE TABLE `quality_inspections` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `outcome_id` integer NOT NULL,
  `result` text NOT NULL CHECK (`result` IN ('passed','partial','failed')),
  `checklist` text NOT NULL DEFAULT '[]',
  `notes` text NOT NULL DEFAULT '',
  `photo_metadata` text NOT NULL DEFAULT '[]',
  `inspected_by` text NOT NULL,
  `inspected_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outcome_id`) REFERENCES `production_outcomes`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `quality_inspections_outcome_idx` ON `quality_inspections` (`outcome_id`,`inspected_at` DESC);--> statement-breakpoint
CREATE TABLE `scrap_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `outcome_id` integer NOT NULL,
  `batch_id` integer,
  `quantity` integer NOT NULL DEFAULT 0 CHECK (`quantity` >= 0),
  `grams` real NOT NULL DEFAULT 0 CHECK (`grams` >= 0),
  `reason` text NOT NULL,
  `photo_metadata` text NOT NULL DEFAULT '[]',
  `recorded_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outcome_id`) REFERENCES `production_outcomes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE TABLE `material_settlements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `outcome_id` integer NOT NULL,
  `workflow_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `reservation_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `reserved_grams` real NOT NULL CHECK (`reserved_grams` > 0),
  `actual_grams` real NOT NULL CHECK (`actual_grams` >= 0),
  `variance_grams` real NOT NULL,
  `inventory_transaction_id` integer,
  `settled_by` text NOT NULL,
  `settled_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outcome_id`) REFERENCES `production_outcomes`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`workflow_id`) REFERENCES `dispatch_workflows`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`reservation_id`) REFERENCES `material_reservations`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`inventory_transaction_id`) REFERENCES `inventory_transactions`(`id`) ON DELETE RESTRICT,
  UNIQUE (`workflow_id`,`reservation_id`),
  UNIQUE (`inventory_transaction_id`)
);--> statement-breakpoint
CREATE INDEX `material_settlements_org_workflow_idx` ON `material_settlements` (`organization_id`,`workflow_id`);--> statement-breakpoint
CREATE TRIGGER `material_settlements_validate_stock`
BEFORE INSERT ON `material_settlements`
WHEN NEW.actual_grams > (
  SELECT `remaining_grams` - COALESCE((
    SELECT SUM(`grams`) FROM `material_reservations`
    WHERE `batch_id`=NEW.`batch_id`
      AND `workflow_id`<>NEW.`workflow_id`
      AND `status` IN ('reserved','allocated','issued')
  ),0) FROM `material_batches` WHERE `id`=NEW.`batch_id`
)
BEGIN
  SELECT RAISE(ABORT, 'MATERIAL_SETTLEMENT_INSUFFICIENT_STOCK');
END;--> statement-breakpoint
CREATE TRIGGER `material_settlements_apply_inventory`
AFTER INSERT ON `material_settlements`
BEGIN
  UPDATE `material_batches` SET `remaining_grams`=`remaining_grams`-NEW.`actual_grams` WHERE `id`=NEW.`batch_id`;
  INSERT INTO `inventory_transactions` (`batch_id`,`job_id`,`type`,`grams`,`note`)
  VALUES (NEW.`batch_id`,NEW.`job_id`,'打印消耗',-NEW.`actual_grams`,'生产工作流结算 #'||NEW.`workflow_id`);
  UPDATE `material_settlements` SET `inventory_transaction_id`=last_insert_rowid() WHERE `id`=NEW.`id`;
END;--> statement-breakpoint
CREATE TRIGGER `quality_inventory_transactions_immutable_update`
BEFORE UPDATE ON `inventory_transactions`
WHEN EXISTS (SELECT 1 FROM `material_settlements` WHERE `inventory_transaction_id`=OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'QUALITY_INVENTORY_TRANSACTION_IMMUTABLE');
END;--> statement-breakpoint
CREATE TRIGGER `quality_inventory_transactions_immutable_delete`
BEFORE DELETE ON `inventory_transactions`
WHEN EXISTS (SELECT 1 FROM `material_settlements` WHERE `inventory_transaction_id`=OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'QUALITY_INVENTORY_TRANSACTION_IMMUTABLE');
END;
