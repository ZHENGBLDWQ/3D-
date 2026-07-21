CREATE TABLE `customers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `customer_no` text NOT NULL,
  `name` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `tax_id` text NOT NULL DEFAULT '',
  `billing_address` text NOT NULL DEFAULT '',
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`organization_id`,`customer_no`)
);
--> statement-breakpoint
CREATE TABLE `customer_contacts` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `email` text NOT NULL DEFAULT '',
  `phone` text NOT NULL DEFAULT '',
  `title` text NOT NULL DEFAULT '',
  `is_primary` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `quotes` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `quote_no` text NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`),
  `contact_id` integer REFERENCES `customer_contacts`(`id`),
  `status` text NOT NULL DEFAULT 'draft',
  `current_version` integer NOT NULL DEFAULT 1,
  `valid_until` text NOT NULL,
  `currency` text NOT NULL DEFAULT 'MYR',
  `accepted_order_id` integer REFERENCES `orders`(`id`),
  `accepted_at` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`organization_id`,`quote_no`),
  UNIQUE(`accepted_order_id`)
);
--> statement-breakpoint
CREATE TABLE `quote_versions` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `quote_id` integer NOT NULL REFERENCES `quotes`(`id`) ON DELETE CASCADE,
  `version_no` integer NOT NULL,
  `target_margin_basis_points` integer NOT NULL DEFAULT 3000,
  `subtotal_cents` integer NOT NULL DEFAULT 0,
  `cost_cents` integer NOT NULL DEFAULT 0,
  `notes` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(`quote_id`,`version_no`)
);
--> statement-breakpoint
CREATE TABLE `quote_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `quote_version_id` integer NOT NULL REFERENCES `quote_versions`(`id`) ON DELETE CASCADE,
  `item_id` integer NOT NULL REFERENCES `print_items`(`id`),
  `description` text NOT NULL DEFAULT '',
  `quantity` integer NOT NULL,
  `unit_cost_cents` integer NOT NULL,
  `suggested_unit_price_cents` integer NOT NULL,
  `unit_price_cents` integer NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `customers_org_name_idx` ON `customers` (`organization_id`,`name`);
--> statement-breakpoint
CREATE INDEX `quotes_org_status_idx` ON `quotes` (`organization_id`,`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `quote_items_version_idx` ON `quote_items` (`quote_version_id`);
--> statement-breakpoint
CREATE TABLE `quote_order_conversions` (
  `quote_id` integer PRIMARY KEY NOT NULL REFERENCES `quotes`(`id`) ON DELETE CASCADE,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `claim_token` text NOT NULL UNIQUE,
  `order_id` integer REFERENCES `orders`(`id`),
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
