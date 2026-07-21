CREATE TABLE `invoices` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `invoice_no` text NOT NULL,
  `order_id` integer NOT NULL REFERENCES `orders`(`id`),
  `customer_name` text NOT NULL,
  `currency` text NOT NULL DEFAULT 'MYR' CHECK (`currency` = 'MYR'),
  `amount_cents` integer NOT NULL CHECK (`amount_cents` > 0),
  `paid_cents` integer NOT NULL DEFAULT 0 CHECK (`paid_cents` >= 0 AND `paid_cents` <= `amount_cents`),
  `status` text NOT NULL DEFAULT 'draft' CHECK (`status` IN ('draft','issued','partially_paid','paid','void','overdue')),
  `issued_at` text,
  `due_date` text NOT NULL,
  `voided_at` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`invoice_no`),
  UNIQUE (`organization_id`,`order_id`)
);--> statement-breakpoint
CREATE INDEX `invoices_org_status_due_idx` ON `invoices` (`organization_id`,`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `invoice_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `invoice_id` integer NOT NULL REFERENCES `invoices`(`id`) ON DELETE RESTRICT,
  `payment_reference` text NOT NULL,
  `amount_cents` integer NOT NULL CHECK (`amount_cents` > 0),
  `method` text NOT NULL DEFAULT 'bank_transfer',
  `paid_at` text NOT NULL,
  `note` text NOT NULL DEFAULT '',
  `recorded_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`payment_reference`)
);--> statement-breakpoint
CREATE INDEX `invoice_payments_org_invoice_idx` ON `invoice_payments` (`organization_id`,`invoice_id`,`paid_at`);--> statement-breakpoint
CREATE TABLE `receivable_alert_signals` (
  `invoice_id` integer PRIMARY KEY NOT NULL REFERENCES `invoices`(`id`) ON DELETE CASCADE,
  `organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  `signal_active` integer NOT NULL DEFAULT 1 CHECK (`signal_active` IN (0,1)),
  `first_detected_at` text NOT NULL,
  `last_detected_at` text NOT NULL,
  `cleared_at` text,
  UNIQUE (`organization_id`,`invoice_id`)
);--> statement-breakpoint
CREATE TRIGGER `invoice_payment_guard` BEFORE INSERT ON `invoice_payments`
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id
      AND i.status IN ('issued','partially_paid','overdue') AND i.paid_cents + NEW.amount_cents <= i.amount_cents
  ) THEN RAISE(ABORT,'INVALID_PAYMENT_OR_OVERPAYMENT') END;
END;--> statement-breakpoint
CREATE TRIGGER `invoice_payment_settle` AFTER INSERT ON `invoice_payments`
BEGIN
  UPDATE invoices SET paid_cents=paid_cents+NEW.amount_cents,
    status=CASE WHEN paid_cents+NEW.amount_cents=amount_cents THEN 'paid' ELSE 'partially_paid' END,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.invoice_id AND organization_id=NEW.organization_id;
END;--> statement-breakpoint
CREATE TRIGGER `invoice_payment_immutable_update` BEFORE UPDATE ON `invoice_payments` BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `invoice_payment_immutable_delete` BEFORE DELETE ON `invoice_payments` BEGIN SELECT RAISE(ABORT,'PAYMENT_IMMUTABLE'); END;
