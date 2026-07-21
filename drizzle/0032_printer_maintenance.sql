CREATE TABLE `maintenance_plans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'scheduled' CHECK (`status` IN ('scheduled','due','overdue','in_progress','completed','cancelled')),
  `due_at` text,
  `due_hours` real CHECK (`due_hours` IS NULL OR `due_hours` >= 0),
  `items` text NOT NULL DEFAULT '[]',
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `started_at` text,
  `completed_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `maintenance_plans_org_status_due_idx` ON `maintenance_plans` (`organization_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `maintenance_plans_printer_due_idx` ON `maintenance_plans` (`printer_id`,`due_hours`);--> statement-breakpoint
CREATE TABLE `maintenance_records` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `plan_id` integer NOT NULL UNIQUE,
  `printer_id` integer NOT NULL,
  `items` text NOT NULL DEFAULT '[]',
  `cost_cents` integer NOT NULL DEFAULT 0 CHECK (`cost_cents` >= 0),
  `downtime_minutes` integer NOT NULL DEFAULT 0 CHECK (`downtime_minutes` >= 0),
  `operator_email` text NOT NULL,
  `meter_hours` real NOT NULL DEFAULT 0 CHECK (`meter_hours` >= 0),
  `notes` text NOT NULL DEFAULT '',
  `completed_at` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`plan_id`) REFERENCES `maintenance_plans`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `maintenance_records_org_completed_idx` ON `maintenance_records` (`organization_id`,`completed_at`);--> statement-breakpoint
CREATE TRIGGER `maintenance_record_scope_guard`
BEFORE INSERT ON `maintenance_records`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `maintenance_plans` p
    WHERE p.id=NEW.plan_id AND p.organization_id=NEW.organization_id AND p.printer_id=NEW.printer_id
  ) THEN RAISE(ABORT,'MAINTENANCE_PLAN_SCOPE_MISMATCH') END;
END;
