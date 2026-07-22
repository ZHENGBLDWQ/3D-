CREATE TABLE `cashflow_settings` (
  `organization_id` integer PRIMARY KEY NOT NULL,
  `available_cash_cents` integer NOT NULL DEFAULT 0 CHECK (`available_cash_cents` >= 0),
  `minimum_reserve_cents` integer NOT NULL DEFAULT 0 CHECK (`minimum_reserve_cents` >= 0),
  `balance_as_of` text NOT NULL,
  `notes` text NOT NULL DEFAULT '',
  `updated_by` text NOT NULL,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
);
