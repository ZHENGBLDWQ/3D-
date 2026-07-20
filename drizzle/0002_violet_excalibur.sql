CREATE TABLE `print_job_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`action` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `print_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `priority` integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `material_deducted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `completed_at` text;