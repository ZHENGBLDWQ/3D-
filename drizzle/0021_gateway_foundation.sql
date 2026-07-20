CREATE TABLE `local_gateways` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`gateway_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'registering' NOT NULL,
	`version` text DEFAULT '' NOT NULL,
	`platform` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_gateways_gateway_id_unique` ON `local_gateways` (`gateway_id`);--> statement-breakpoint
CREATE INDEX `local_gateways_organization_status_idx` ON `local_gateways` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `gateway_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`gateway_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`last_used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`gateway_id`) REFERENCES `local_gateways`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gateway_tokens_token_hash_unique` ON `gateway_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `gateway_tokens_gateway_active_idx` ON `gateway_tokens` (`gateway_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `printer_bindings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`gateway_id` integer NOT NULL,
	`printer_id` integer NOT NULL,
	`device_serial` text NOT NULL,
	`device_model` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`capabilities` text DEFAULT '{}' NOT NULL,
	`bound_at` text,
	`last_seen_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gateway_id`) REFERENCES `local_gateways`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_bindings_device_serial_unique` ON `printer_bindings` (`device_serial`);--> statement-breakpoint
CREATE UNIQUE INDEX `printer_bindings_printer_id_unique` ON `printer_bindings` (`printer_id`);--> statement-breakpoint
CREATE INDEX `printer_bindings_gateway_status_idx` ON `printer_bindings` (`gateway_id`,`status`);--> statement-breakpoint
CREATE TABLE `printer_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`binding_id` integer NOT NULL,
	`printer_id` integer NOT NULL,
	`event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`binding_id`) REFERENCES `printer_bindings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `printer_events_event_id_unique` ON `printer_events` (`event_id`);--> statement-breakpoint
CREATE INDEX `printer_events_printer_occurred_idx` ON `printer_events` (`printer_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `background_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL,
	`job_key` text NOT NULL,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`run_after` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `background_jobs_job_key_unique` ON `background_jobs` (`job_key`);--> statement-breakpoint
CREATE INDEX `background_jobs_status_run_after_idx` ON `background_jobs` (`status`,`run_after`);
