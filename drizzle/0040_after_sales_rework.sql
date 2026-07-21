CREATE TABLE `customer_cases` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `case_no` text NOT NULL,
  `customer_id` integer NOT NULL REFERENCES `customers`(`id`),
  `order_id` integer REFERENCES `orders`(`id`),
  `shipment_id` integer,
  `item_id` integer REFERENCES `print_items`(`id`),
  `status` text NOT NULL DEFAULT 'opened' CHECK (`status` IN ('opened','triaged','in_progress','resolved','closed','reopened')),
  `priority` text NOT NULL DEFAULT 'normal' CHECK (`priority` IN ('low','normal','high','critical')),
  `subject` text NOT NULL,
  `description` text NOT NULL DEFAULT '',
  `responsibility` text NOT NULL DEFAULT '',
  `root_cause` text NOT NULL DEFAULT '',
  `disposition` text NOT NULL DEFAULT '',
  `refund_cents` integer NOT NULL DEFAULT 0 CHECK (`refund_cents` >= 0),
  `sla_due_at` text NOT NULL,
  `resolved_at` text,
  `closed_at` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`case_no`)
);--> statement-breakpoint
CREATE INDEX `customer_cases_org_status_sla_idx` ON `customer_cases` (`organization_id`,`status`,`sla_due_at`);--> statement-breakpoint
CREATE TABLE `case_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `case_id` integer NOT NULL REFERENCES `customer_cases`(`id`) ON DELETE CASCADE,
  `event_type` text NOT NULL,
  `from_status` text NOT NULL DEFAULT '',
  `to_status` text NOT NULL DEFAULT '',
  `note` text NOT NULL DEFAULT '',
  `detail` text NOT NULL DEFAULT '{}',
  `actor_email` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);--> statement-breakpoint
CREATE INDEX `case_events_case_created_idx` ON `case_events` (`organization_id`,`case_id`,`created_at` DESC);--> statement-breakpoint
CREATE TABLE `rework_orders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `case_id` integer NOT NULL REFERENCES `customer_cases`(`id`),
  `order_id` integer REFERENCES `orders`(`id`),
  `item_id` integer NOT NULL REFERENCES `print_items`(`id`),
  `quantity` integer NOT NULL CHECK (`quantity` > 0),
  `reason` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `claim_token` text NOT NULL,
  `job_id` integer REFERENCES `print_jobs`(`id`),
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`idempotency_key`),
  UNIQUE (`job_id`)
);--> statement-breakpoint
CREATE INDEX `rework_orders_org_case_idx` ON `rework_orders` (`organization_id`,`case_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `customer_cases_scope_insert` BEFORE INSERT ON `customer_cases` BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM `customers` WHERE `id`=NEW.`customer_id` AND `organization_id`=NEW.`organization_id`) THEN RAISE(ABORT,'AFTER_SALES_CUSTOMER_SCOPE') END;
  SELECT CASE WHEN NEW.`order_id` IS NOT NULL AND NOT EXISTS(SELECT 1 FROM `orders` WHERE `id`=NEW.`order_id` AND `organization_id`=NEW.`organization_id`) THEN RAISE(ABORT,'AFTER_SALES_ORDER_SCOPE') END;
END;--> statement-breakpoint
CREATE TRIGGER `rework_orders_scope_insert` BEFORE INSERT ON `rework_orders` BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM `customer_cases` WHERE `id`=NEW.`case_id` AND `organization_id`=NEW.`organization_id`) THEN RAISE(ABORT,'REWORK_CASE_SCOPE') END;
  SELECT CASE WHEN NEW.`order_id` IS NOT NULL AND NOT EXISTS(SELECT 1 FROM `orders` WHERE `id`=NEW.`order_id` AND `organization_id`=NEW.`organization_id`) THEN RAISE(ABORT,'REWORK_ORDER_SCOPE') END;
END;
