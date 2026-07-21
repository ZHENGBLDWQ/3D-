ALTER TABLE `dispatch_workflows` ADD `last_event_at` text;--> statement-breakpoint
ALTER TABLE `dispatch_workflows` ADD `settled_at` text;--> statement-breakpoint
ALTER TABLE `dispatch_workflows` ADD `settlement_event_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_workflows_settlement_event_unique` ON `dispatch_workflows` (`settlement_event_id`);--> statement-breakpoint
CREATE TABLE `execution_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `workflow_id` integer,
  `printer_event_id` integer NOT NULL,
  `event_id` text NOT NULL,
  `printer_id` integer NOT NULL,
  `binding_id` integer NOT NULL,
  `device_status` text NOT NULL,
  `occurred_at` text NOT NULL,
  `outcome` text NOT NULL,
  `details` text NOT NULL DEFAULT '{}',
  `processed_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`workflow_id`) REFERENCES `dispatch_workflows`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`printer_event_id`) REFERENCES `printer_events`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`binding_id`) REFERENCES `printer_bindings`(`id`) ON DELETE CASCADE,
  UNIQUE (`printer_event_id`),
  UNIQUE (`event_id`)
);--> statement-breakpoint
CREATE INDEX `execution_events_workflow_time_idx` ON `execution_events` (`workflow_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `execution_events_org_time_idx` ON `execution_events` (`organization_id`,`processed_at`);
