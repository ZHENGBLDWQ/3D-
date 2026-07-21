CREATE TABLE `gateway_discoveries` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `gateway_id` integer NOT NULL,
  `device_id` text NOT NULL,
  `device_serial` text NOT NULL,
  `device_name` text DEFAULT 'Bambu Lab' NOT NULL,
  `device_model` text DEFAULT '' NOT NULL,
  `host` text DEFAULT '' NOT NULL,
  `source` text DEFAULT 'bambu_ssdp' NOT NULL,
  `last_seen_at` text NOT NULL,
  FOREIGN KEY (`gateway_id`) REFERENCES `local_gateways`(`id`) ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `gateway_discoveries_gateway_device_unique` ON `gateway_discoveries` (`gateway_id`,`device_id`);--> statement-breakpoint
ALTER TABLE `printer_commands` ADD `binding_id` integer REFERENCES `printer_bindings`(`id`);--> statement-breakpoint
ALTER TABLE `printer_commands` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `printer_commands` ADD `acknowledged_at` text;--> statement-breakpoint
ALTER TABLE `printer_commands` ADD `retryable` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `printer_commands_idempotency_unique` ON `printer_commands` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `bambu_ams_slots_printer_slot_unique` ON `bambu_ams_slots` (`printer_id`,`ams_unit`,`tray_index`);
