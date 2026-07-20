ALTER TABLE `printers` ADD `connector_type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `printers` ADD `connector_token_hash` text;--> statement-breakpoint
ALTER TABLE `printers` ADD `connection_state` text DEFAULT '未连接' NOT NULL;--> statement-breakpoint
ALTER TABLE `printers` ADD `last_seen_at` text;--> statement-breakpoint
ALTER TABLE `printers` ADD `nozzle_temp` real;--> statement-breakpoint
ALTER TABLE `printers` ADD `bed_temp` real;--> statement-breakpoint
ALTER TABLE `printers` ADD `current_file` text;--> statement-breakpoint
ALTER TABLE `printers` ADD `remote_progress` real;