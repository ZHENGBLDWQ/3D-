ALTER TABLE `supplier_invoices` ADD `payment_terms_days` integer NOT NULL DEFAULT 30 CHECK (`payment_terms_days` BETWEEN 0 AND 365);--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `due_date` text;--> statement-breakpoint
CREATE TABLE `supplier_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `supplier_invoice_id` integer NOT NULL,
  `payment_reference` text NOT NULL,
  `amount_cents` integer NOT NULL CHECK (`amount_cents` > 0),
  `method` text NOT NULL DEFAULT 'bank_transfer',
  `paid_at` text NOT NULL,
  `note` text NOT NULL DEFAULT '',
  `recorded_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (`organization_id`,`payment_reference`),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`supplier_invoice_id`) REFERENCES `supplier_invoices`(`id`) ON DELETE RESTRICT
);--> statement-breakpoint
CREATE INDEX `supplier_payments_invoice_idx` ON `supplier_payments` (`organization_id`,`supplier_invoice_id`,`paid_at` DESC);--> statement-breakpoint
CREATE TRIGGER `supplier_payment_guard` BEFORE INSERT ON `supplier_payments` WHEN NOT EXISTS (SELECT 1 FROM supplier_invoices i WHERE i.id=NEW.supplier_invoice_id AND i.organization_id=NEW.organization_id AND i.status IN ('matched','approved')) OR NEW.amount_cents+(SELECT COALESCE(SUM(p.amount_cents),0) FROM supplier_payments p WHERE p.organization_id=NEW.organization_id AND p.supplier_invoice_id=NEW.supplier_invoice_id)>(SELECT i.actual_total_cents FROM supplier_invoices i WHERE i.id=NEW.supplier_invoice_id AND i.organization_id=NEW.organization_id) BEGIN SELECT RAISE(ABORT,'SUPPLIER_PAYMENT_INVALID_OR_OVERPAYMENT'); END;--> statement-breakpoint
CREATE TRIGGER `supplier_payment_immutable_update` BEFORE UPDATE ON `supplier_payments` BEGIN SELECT RAISE(ABORT,'SUPPLIER_PAYMENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `supplier_payment_immutable_delete` BEFORE DELETE ON `supplier_payments` BEGIN SELECT RAISE(ABORT,'SUPPLIER_PAYMENT_IMMUTABLE'); END;
