CREATE TABLE `production_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`plan_no` text NOT NULL UNIQUE,
	`status` text DEFAULT 'draft' NOT NULL,
	`mode` text DEFAULT 'recommend_only' NOT NULL,
	`created_by` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE `production_plan_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL REFERENCES `production_plans`(`id`) ON DELETE CASCADE,
	`print_job_id` integer NOT NULL REFERENCES `print_jobs`(`id`) ON DELETE CASCADE,
	`printer_id` integer NOT NULL REFERENCES `printers`(`id`),
	`score` real NOT NULL,
	`recommendation_reasons` text DEFAULT '[]' NOT NULL,
	`conflicts` text DEFAULT '[]' NOT NULL,
	`planned_start_at` text NOT NULL,
	`planned_end_at` text NOT NULL,
	`status` text DEFAULT 'recommended' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE `printer_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`organization_id` integer NOT NULL REFERENCES `organizations`(`id`) ON DELETE CASCADE,
	`plan_item_id` integer NOT NULL REFERENCES `production_plan_items`(`id`) ON DELETE CASCADE,
	`printer_id` integer NOT NULL REFERENCES `printers`(`id`),
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `printer_schedules_printer_time_idx` ON `printer_schedules` (`printer_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `schedule_conflicts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_item_id` integer NOT NULL REFERENCES `production_plan_items`(`id`) ON DELETE CASCADE,
	`code` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE TABLE `schedule_revisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL REFERENCES `production_plans`(`id`) ON DELETE CASCADE,
	`revision_no` integer NOT NULL,
	`snapshot` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
