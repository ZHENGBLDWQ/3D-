CREATE TABLE `material_variance_cases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `spool_id` integer NOT NULL,
  `weight_check_id` integer NOT NULL,
  `book_net_grams` real NOT NULL CHECK (`book_net_grams` >= 0),
  `measured_net_grams` real NOT NULL CHECK (`measured_net_grams` >= 0),
  `variance_grams` real NOT NULL,
  `status` text NOT NULL DEFAULT 'open' CHECK (`status` IN ('open','resolved','rejected')),
  `reason` text CHECK (`reason` IS NULL OR `reason` IN ('print_consumption','loss','moisture','scale_error','stocktake_adjustment','other')),
  `resolution_note` text NOT NULL DEFAULT '',
  `adjustment_movement_id` integer,
  `created_by` text NOT NULL,
  `resolved_by` text,
  `resolved_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`weight_check_id`) REFERENCES `spool_weight_checks`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`adjustment_movement_id`) REFERENCES `material_spool_movements`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`weight_check_id`)
);--> statement-breakpoint
CREATE INDEX `material_variance_status_idx` ON `material_variance_cases` (`organization_id`,`status`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `material_variance_org_guard_insert` BEFORE INSERT ON `material_variance_cases` WHEN NOT EXISTS (SELECT 1 FROM `material_spools` s JOIN `spool_weight_checks` w ON w.spool_id=s.id AND w.organization_id=s.organization_id WHERE s.id=NEW.spool_id AND s.organization_id=NEW.organization_id AND w.id=NEW.weight_check_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_VARIANCE_ORGANIZATION_MISMATCH'); END;
