CREATE TABLE `finished_goods_lots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `outcome_id` integer NOT NULL,
  `job_id` integer NOT NULL,
  `lot_no` text NOT NULL,
  `total_quantity` integer NOT NULL CHECK (`total_quantity` > 0),
  `available_quantity` integer NOT NULL CHECK (`available_quantity` >= 0 AND `available_quantity` <= `total_quantity`),
  `received_by` text NOT NULL,
  `received_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`outcome_id`) REFERENCES `production_outcomes`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`lot_no`),
  UNIQUE (`organization_id`,`outcome_id`)
);--> statement-breakpoint
CREATE INDEX `finished_goods_lots_org_available_idx` ON `finished_goods_lots` (`organization_id`,`available_quantity`);--> statement-breakpoint
CREATE TRIGGER `finished_goods_lot_quality_guard`
BEFORE INSERT ON `finished_goods_lots`
WHEN NOT EXISTS (
  SELECT 1 FROM `production_outcomes` o JOIN `quality_inspections` q ON q.outcome_id=o.id AND q.organization_id=o.organization_id
  WHERE o.id=NEW.outcome_id AND o.organization_id=NEW.organization_id AND o.job_id=NEW.job_id
    AND o.successful_quantity=NEW.total_quantity AND o.successful_quantity>0 AND q.result IN ('passed','partial')
)
BEGIN SELECT RAISE(ABORT, 'FINISHED_GOODS_QUALITY_NOT_SETTLED'); END;--> statement-breakpoint

CREATE TABLE `shipments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `order_id` integer,
  `shipment_no` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `status` text NOT NULL DEFAULT 'draft' CHECK (`status` IN ('draft','picking','partially_shipped','shipped','delivered','cancelled')),
  `recipient_name` text NOT NULL,
  `address` text NOT NULL DEFAULT '',
  `created_by` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `shipped_at` text,
  `delivered_at` text,
  `cancelled_at` text,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`shipment_no`)
  ,UNIQUE (`organization_id`,`idempotency_key`)
);--> statement-breakpoint
CREATE INDEX `shipments_org_status_idx` ON `shipments` (`organization_id`,`status`,`created_at` DESC);--> statement-breakpoint
CREATE TABLE `shipment_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `shipment_id` integer NOT NULL,
  `action` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `actor_email` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`idempotency_key`)
);--> statement-breakpoint
CREATE TRIGGER `shipments_order_scope_guard` BEFORE INSERT ON `shipments`
WHEN NEW.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `orders` WHERE id=NEW.order_id AND organization_id=NEW.organization_id)
BEGIN SELECT RAISE(ABORT, 'SHIPMENT_ORDER_SCOPE_MISMATCH'); END;--> statement-breakpoint

CREATE TABLE `shipment_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `shipment_id` integer NOT NULL,
  `lot_id` integer NOT NULL,
  `requested_quantity` integer NOT NULL CHECK (`requested_quantity` > 0),
  `picked_quantity` integer NOT NULL DEFAULT 0 CHECK (`picked_quantity` >= 0),
  `shipped_quantity` integer NOT NULL DEFAULT 0 CHECK (`shipped_quantity` >= 0),
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `finished_goods_lots`(`id`) ON DELETE RESTRICT,
  UNIQUE (`shipment_id`,`lot_id`),
  CHECK (`shipped_quantity` <= `picked_quantity` AND `picked_quantity` <= `requested_quantity`)
);--> statement-breakpoint
CREATE TRIGGER `shipment_items_scope_guard` BEFORE INSERT ON `shipment_items`
WHEN NOT EXISTS (SELECT 1 FROM shipments s JOIN finished_goods_lots l ON l.organization_id=s.organization_id WHERE s.id=NEW.shipment_id AND l.id=NEW.lot_id AND s.organization_id=NEW.organization_id)
BEGIN SELECT RAISE(ABORT, 'SHIPMENT_ITEM_SCOPE_MISMATCH'); END;--> statement-breakpoint

CREATE TABLE `shipment_packages` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `shipment_id` integer NOT NULL,
  `package_no` text NOT NULL,
  `carrier` text NOT NULL DEFAULT '',
  `tracking_no` text NOT NULL DEFAULT '',
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`shipment_id`) REFERENCES `shipments`(`id`) ON DELETE CASCADE,
  UNIQUE (`organization_id`,`package_no`)
);--> statement-breakpoint

CREATE TABLE `finished_goods_movements` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `organization_id` integer NOT NULL,
  `lot_id` integer NOT NULL,
  `shipment_item_id` integer,
  `type` text NOT NULL CHECK (`type` IN ('receipt','pick','release','ship')),
  `quantity` integer NOT NULL CHECK (`quantity` > 0),
  `idempotency_key` text NOT NULL,
  `actor_email` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lot_id`) REFERENCES `finished_goods_lots`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`shipment_item_id`) REFERENCES `shipment_items`(`id`) ON DELETE RESTRICT,
  UNIQUE (`organization_id`,`idempotency_key`)
);--> statement-breakpoint
CREATE INDEX `finished_goods_movements_org_created_idx` ON `finished_goods_movements` (`organization_id`,`created_at` DESC);--> statement-breakpoint
CREATE TRIGGER `finished_goods_movement_guard` BEFORE INSERT ON `finished_goods_movements`
WHEN NOT EXISTS (SELECT 1 FROM finished_goods_lots WHERE id=NEW.lot_id AND organization_id=NEW.organization_id)
 OR (NEW.type<>'receipt' AND NOT EXISTS (SELECT 1 FROM shipment_items i WHERE i.id=NEW.shipment_item_id AND i.lot_id=NEW.lot_id AND i.organization_id=NEW.organization_id))
 OR (NEW.type='pick' AND NEW.quantity>(SELECT available_quantity FROM finished_goods_lots WHERE id=NEW.lot_id))
 OR (NEW.type='pick' AND NEW.quantity>(SELECT requested_quantity-picked_quantity FROM shipment_items WHERE id=NEW.shipment_item_id))
 OR (NEW.type='release' AND NEW.quantity>(SELECT picked_quantity-shipped_quantity FROM shipment_items WHERE id=NEW.shipment_item_id))
 OR (NEW.type='ship' AND NEW.quantity>(SELECT picked_quantity-shipped_quantity FROM shipment_items WHERE id=NEW.shipment_item_id))
BEGIN SELECT RAISE(ABORT, 'FINISHED_GOODS_MOVEMENT_REJECTED'); END;--> statement-breakpoint
CREATE TRIGGER `finished_goods_movement_apply` AFTER INSERT ON `finished_goods_movements`
BEGIN
  UPDATE finished_goods_lots SET available_quantity=available_quantity-CASE WHEN NEW.type='pick' THEN NEW.quantity WHEN NEW.type='release' THEN -NEW.quantity ELSE 0 END WHERE id=NEW.lot_id;
  UPDATE shipment_items SET picked_quantity=picked_quantity+CASE WHEN NEW.type='pick' THEN NEW.quantity WHEN NEW.type='release' THEN -NEW.quantity ELSE 0 END,
    shipped_quantity=shipped_quantity+CASE WHEN NEW.type='ship' THEN NEW.quantity ELSE 0 END WHERE id=NEW.shipment_item_id;
END;--> statement-breakpoint
CREATE TRIGGER `finished_goods_movements_immutable_update` BEFORE UPDATE ON `finished_goods_movements` BEGIN SELECT RAISE(ABORT, 'FINISHED_GOODS_MOVEMENT_IMMUTABLE'); END;--> statement-breakpoint
CREATE TRIGGER `finished_goods_movements_immutable_delete` BEFORE DELETE ON `finished_goods_movements` BEGIN SELECT RAISE(ABORT, 'FINISHED_GOODS_MOVEMENT_IMMUTABLE'); END;
