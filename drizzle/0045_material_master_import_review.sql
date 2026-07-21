CREATE TABLE `material_catalog_import_batches` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `batch_key` text NOT NULL,
  `file_name` text NOT NULL,
  `status` text NOT NULL DEFAULT 'pending' CHECK (`status` IN ('pending','applied','cancelled')),
  `rows_json` text NOT NULL,
  `summary_json` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `applied_by` text,
  `applied_at` text,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`batch_key`)
);--> statement-breakpoint
CREATE INDEX `material_catalog_import_batches_org_idx` ON `material_catalog_import_batches` (`organization_id`,`created_at`);
