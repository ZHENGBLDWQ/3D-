CREATE TABLE `material_calibration_tasks` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `print_session_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `spool_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'planned' CHECK (`status` IN ('planned','in_progress','completed','cancelled')),
  `before_gross_grams` real CHECK (`before_gross_grams` IS NULL OR `before_gross_grams` >= 0),
  `after_gross_grams` real CHECK (`after_gross_grams` IS NULL OR `after_gross_grams` >= 0),
  `actual_consumed_grams` real CHECK (`actual_consumed_grams` IS NULL OR `actual_consumed_grams` >= 0),
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  `cancelled_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`print_session_id`) REFERENCES `print_sessions`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`spool_id`) REFERENCES `material_spools`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`print_session_id`,`spool_id`)
);--> statement-breakpoint
CREATE INDEX `material_calibration_status_idx` ON `material_calibration_tasks` (`organization_id`,`status`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `material_calibration_org_guard_insert` BEFORE INSERT ON `material_calibration_tasks` WHEN NOT EXISTS (SELECT 1 FROM `print_sessions` ps JOIN `print_material_usage_lines` u ON u.print_session_id=ps.id AND u.spool_id=NEW.spool_id JOIN `material_spools` s ON s.id=NEW.spool_id WHERE ps.id=NEW.print_session_id AND ps.organization_id=NEW.organization_id AND u.organization_id=NEW.organization_id AND ps.printer_id=NEW.printer_id AND s.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'MATERIAL_CALIBRATION_ORGANIZATION_MISMATCH'); END;
