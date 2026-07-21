CREATE TABLE `recovery_backups` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `status` text NOT NULL DEFAULT 'generating' CHECK (`status` IN ('generating','ready','corrupt','failed','expired')),
  `schema_version` integer NOT NULL DEFAULT 1,
  `checksum` text NOT NULL DEFAULT '',
  `payload_json` text NOT NULL DEFAULT '',
  `row_count` integer NOT NULL DEFAULT 0 CHECK (`row_count` >= 0),
  `retention_days` integer NOT NULL DEFAULT 30 CHECK (`retention_days` BETWEEN 1 AND 365),
  `expires_at` text NOT NULL,
  `created_by` text NOT NULL,
  `verified_at` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `recovery_backups_org_created_idx` ON `recovery_backups` (`organization_id`,`created_at` DESC);--> statement-breakpoint
CREATE TABLE `recovery_drills` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `backup_id` integer,
  `source_checksum` text NOT NULL,
  `status` text NOT NULL CHECK (`status` IN ('passed','rejected')),
  `difference_report` text NOT NULL DEFAULT '{}',
  `requested_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`backup_id`) REFERENCES `recovery_backups`(`id`) ON DELETE SET NULL
);--> statement-breakpoint
CREATE INDEX `recovery_drills_org_created_idx` ON `recovery_drills` (`organization_id`,`created_at` DESC);--> statement-breakpoint
CREATE TABLE `recovery_approvals` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `drill_id` integer NOT NULL,
  `decision` text NOT NULL CHECK (`decision` IN ('approved','rejected')),
  `note` text NOT NULL DEFAULT '',
  `decided_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`drill_id`) REFERENCES `recovery_drills`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE UNIQUE INDEX `recovery_approvals_drill_unique` ON `recovery_approvals` (`drill_id`);
