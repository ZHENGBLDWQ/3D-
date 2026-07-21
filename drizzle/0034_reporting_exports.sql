CREATE TABLE `report_exports` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `actor_email` text NOT NULL,
  `date_from` text NOT NULL,
  `date_to` text NOT NULL,
  `format` text NOT NULL DEFAULT 'csv' CHECK (`format` IN ('csv')),
  `row_count` integer NOT NULL DEFAULT 0 CHECK (`row_count` >= 0),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `report_exports_org_created_idx` ON `report_exports` (`organization_id`,`created_at` DESC);
