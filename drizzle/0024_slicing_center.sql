CREATE TABLE `slicer_profiles` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`organization_id` integer NOT NULL,`profile_type` text NOT NULL,`name` text NOT NULL,`version` text NOT NULL,`config_json` text DEFAULT '{}' NOT NULL,`sha256` text DEFAULT '' NOT NULL,`active` integer DEFAULT true NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade,UNIQUE(`organization_id`,`profile_type`,`name`,`version`));
--> statement-breakpoint
CREATE INDEX `slicer_profiles_org_type_idx` ON `slicer_profiles` (`organization_id`,`profile_type`,`active`);
--> statement-breakpoint
CREATE TABLE `slicing_jobs` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`organization_id` integer NOT NULL,`job_key` text NOT NULL UNIQUE,`input_file_id` integer NOT NULL,`gateway_id` integer,`status` text DEFAULT 'queued' NOT NULL,`request_json` text NOT NULL,`result_json` text,`error_code` text,`error_message` text,`timeout_seconds` integer DEFAULT 1800 NOT NULL,`cancel_requested_at` text,`claimed_at` text,`started_at` text,`completed_at` text,`created_by` text NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade,FOREIGN KEY (`input_file_id`) REFERENCES `model_files`(`id`) ON DELETE restrict,FOREIGN KEY (`gateway_id`) REFERENCES `local_gateways`(`id`) ON DELETE set null);
--> statement-breakpoint
CREATE INDEX `slicing_jobs_org_created_idx` ON `slicing_jobs` (`organization_id`,`created_at` DESC);
--> statement-breakpoint
CREATE INDEX `slicing_jobs_gateway_status_idx` ON `slicing_jobs` (`gateway_id`,`status`,`created_at`);
