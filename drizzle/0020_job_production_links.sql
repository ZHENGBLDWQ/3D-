ALTER TABLE `print_jobs` ADD `file_id` integer REFERENCES `print_files`(`id`);--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `planned_start_at` text;--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `expected_complete_at` text;
