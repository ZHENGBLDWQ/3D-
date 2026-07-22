CREATE TABLE `procurement_monthly_budgets` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `budget_month` text NOT NULL,
  `budget_cents` integer NOT NULL CHECK (`budget_cents` >= 0),
  `warning_bps` integer NOT NULL DEFAULT 8000 CHECK (`warning_bps` BETWEEN 0 AND 10000),
  `notes` text,
  `created_by` text NOT NULL,
  `updated_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`budget_month`),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `procurement_budget_overrides` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `request_id` integer NOT NULL,
  `offer_id` integer NOT NULL,
  `budget_month` text NOT NULL,
  `projected_commitment_cents` integer NOT NULL CHECK (`projected_commitment_cents` >= 0),
  `budget_cents` integer NOT NULL CHECK (`budget_cents` >= 0),
  `reason` text NOT NULL,
  `approved_by` text NOT NULL,
  `approved_at` text NOT NULL,
  UNIQUE (`organization_id`,`request_id`,`offer_id`,`budget_month`),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`request_id`) REFERENCES `procurement_requests`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`offer_id`) REFERENCES `supplier_material_offers`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX `procurement_budgets_org_month_idx` ON `procurement_monthly_budgets` (`organization_id`,`budget_month`);--> statement-breakpoint
CREATE INDEX `procurement_budget_overrides_org_month_idx` ON `procurement_budget_overrides` (`organization_id`,`budget_month`,`approved_at` DESC);--> statement-breakpoint
CREATE TRIGGER `procurement_budget_override_org_guard` BEFORE INSERT ON `procurement_budget_overrides` WHEN NOT EXISTS (SELECT 1 FROM procurement_requests r JOIN supplier_material_offers o ON o.id=NEW.offer_id WHERE r.id=NEW.request_id AND r.organization_id=NEW.organization_id AND o.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'PROCUREMENT_BUDGET_OVERRIDE_ORGANIZATION_MISMATCH'); END;
