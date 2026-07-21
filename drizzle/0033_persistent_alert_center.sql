CREATE TABLE `alerts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `fingerprint` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('printer_offline','command_timeout','command_failed','low_stock','maintenance_due')),
  `severity` text NOT NULL CHECK (`severity` IN ('info','warning','critical')),
  `status` text NOT NULL DEFAULT 'open' CHECK (`status` IN ('open','acknowledged','resolved')),
  `title` text NOT NULL,
  `detail` text NOT NULL DEFAULT '',
  `resource_type` text NOT NULL,
  `resource_id` text NOT NULL,
  `assigned_to` text,
  `signal_active` integer NOT NULL DEFAULT 1 CHECK (`signal_active` IN (0,1)),
  `occurrence_count` integer NOT NULL DEFAULT 1 CHECK (`occurrence_count` > 0),
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL,
  `cleared_at` text,
  `acknowledged_at` text,
  `acknowledged_by` text,
  `resolved_at` text,
  `resolved_by` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`fingerprint`)
);--> statement-breakpoint
CREATE INDEX `alerts_org_status_detected_idx` ON `alerts` (`organization_id`,`status`,`last_detected_at` DESC);--> statement-breakpoint
CREATE INDEX `alerts_org_active_type_idx` ON `alerts` (`organization_id`,`signal_active`,`type`);--> statement-breakpoint
CREATE TABLE `alert_actions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `alert_id` integer NOT NULL,
  `actor_email` text NOT NULL,
  `action` text NOT NULL CHECK (`action` IN ('detected','cleared','acknowledge','assign','resolve','reopen')),
  `from_status` text NOT NULL DEFAULT '',
  `to_status` text NOT NULL DEFAULT '',
  `assigned_to` text,
  `note` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `alert_actions_org_alert_created_idx` ON `alert_actions` (`organization_id`,`alert_id`,`created_at` DESC);
