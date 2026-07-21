CREATE TABLE `profit_settings` (
  `organization_id` integer PRIMARY KEY NOT NULL,
  `electricity_rate_cents_per_kwh` integer NOT NULL DEFAULT 80 CHECK (`electricity_rate_cents_per_kwh` >= 0),
  `labor_rate_cents_per_hour` integer NOT NULL DEFAULT 0 CHECK (`labor_rate_cents_per_hour` >= 0),
  `labor_minutes_per_job` integer NOT NULL DEFAULT 0 CHECK (`labor_minutes_per_job` >= 0),
  `packaging_cents_per_order` integer NOT NULL DEFAULT 0 CHECK (`packaging_cents_per_order` >= 0),
  `overhead_basis_points` integer NOT NULL DEFAULT 0 CHECK (`overhead_basis_points` >= 0),
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
CREATE TABLE `profit_cost_entries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `order_id` integer,
  `job_id` integer,
  `category` text NOT NULL CHECK (`category` IN ('labor','packaging','overhead','scrap','other','revenue_adjustment')),
  `basis` text NOT NULL CHECK (`basis` IN ('estimated','actual')),
  `amount_cents` integer NOT NULL,
  `occurred_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `note` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE INDEX `profit_cost_entries_org_date_idx` ON `profit_cost_entries` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `profit_cost_entries_org_order_idx` ON `profit_cost_entries` (`organization_id`,`order_id`,`basis`);
