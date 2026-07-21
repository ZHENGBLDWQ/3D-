CREATE TABLE `dispatch_workflows` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `workflow_key` text NOT NULL,
  `preflight_run_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `command_id` integer,
  `status` text NOT NULL DEFAULT 'reserved',
  `preflight_level` text NOT NULL,
  `override_id` integer,
  `actor_email` text NOT NULL,
  `error_code` text,
  `error_message` text,
  `started_at` text,
  `completed_at` text,
  `cancelled_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`preflight_run_id`) REFERENCES `preflight_runs`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`command_id`) REFERENCES `printer_commands`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`override_id`) REFERENCES `preflight_overrides`(`id`) ON DELETE SET NULL,
  UNIQUE (`workflow_key`),
  UNIQUE (`command_id`)
);--> statement-breakpoint
CREATE INDEX `dispatch_workflows_org_status_idx` ON `dispatch_workflows` (`organization_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `material_reservations` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `workflow_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `printer_id` integer NOT NULL,
  `batch_id` integer NOT NULL,
  `slot` text NOT NULL,
  `material` text NOT NULL,
  `grams` real NOT NULL CHECK (`grams` > 0),
  `status` text NOT NULL DEFAULT 'reserved' CHECK (`status` IN ('reserved','allocated','issued','released')),
  `released_reason` text NOT NULL DEFAULT '',
  `allocated_at` text,
  `issued_at` text,
  `released_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`workflow_id`) REFERENCES `dispatch_workflows`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`batch_id`) REFERENCES `material_batches`(`id`) ON DELETE RESTRICT,
  UNIQUE (`workflow_id`,`batch_id`,`slot`)
);--> statement-breakpoint
CREATE INDEX `material_reservations_batch_status_idx` ON `material_reservations` (`batch_id`,`status`);--> statement-breakpoint
CREATE INDEX `material_reservations_org_job_idx` ON `material_reservations` (`organization_id`,`job_id`);--> statement-breakpoint
CREATE TRIGGER `material_reservations_prevent_overbooking`
BEFORE INSERT ON `material_reservations`
WHEN NEW.status IN ('reserved','allocated','issued') AND (
  SELECT `remaining_grams` - COALESCE((
    SELECT SUM(`grams`) FROM `material_reservations`
    WHERE `batch_id`=NEW.`batch_id` AND `status` IN ('reserved','allocated','issued')
  ),0) FROM `material_batches` WHERE `id`=NEW.`batch_id`
) < NEW.`grams`
BEGIN
  SELECT RAISE(ABORT, 'MATERIAL_RESERVATION_INSUFFICIENT');
END;--> statement-breakpoint
ALTER TABLE `dispatch_attempts` ADD `workflow_id` integer REFERENCES `dispatch_workflows`(`id`);--> statement-breakpoint
CREATE INDEX `dispatch_attempts_workflow_idx` ON `dispatch_attempts` (`workflow_id`);
