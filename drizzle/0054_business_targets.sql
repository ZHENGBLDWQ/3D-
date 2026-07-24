CREATE TABLE `monthly_business_targets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `target_month` text NOT NULL,
  `revenue_target_cents` integer NOT NULL DEFAULT 0 CHECK (`revenue_target_cents` >= 0),
  `gross_margin_target_bps` integer NOT NULL DEFAULT 0 CHECK (`gross_margin_target_bps` BETWEEN -10000 AND 10000),
  `operating_cashflow_target_cents` integer NOT NULL DEFAULT 0,
  `material_loss_target_bps` integer NOT NULL DEFAULT 0 CHECK (`material_loss_target_bps` BETWEEN 0 AND 10000),
  `utilization_target_bps` integer NOT NULL DEFAULT 0 CHECK (`utilization_target_bps` BETWEEN 0 AND 10000),
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`target_month`),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);
