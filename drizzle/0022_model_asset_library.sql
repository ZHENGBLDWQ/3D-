CREATE TABLE `model_assets` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`organization_id` integer NOT NULL,`name` text NOT NULL,`category` text DEFAULT '未分类' NOT NULL,`description` text DEFAULT '' NOT NULL,`status` text DEFAULT 'active' NOT NULL,`created_by` text NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade);
--> statement-breakpoint
CREATE INDEX `model_assets_org_updated_idx` ON `model_assets` (`organization_id`,`updated_at` DESC);
--> statement-breakpoint
CREATE TABLE `model_files` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`organization_id` integer NOT NULL,`asset_id` integer NOT NULL,`asset_layer` text NOT NULL,`format` text NOT NULL,`filename` text NOT NULL,`object_key` text NOT NULL UNIQUE,`sha256` text NOT NULL,`size_bytes` integer NOT NULL,`content_type` text NOT NULL,`version` text DEFAULT 'v1' NOT NULL,`source_platform` text DEFAULT '本地上传' NOT NULL,`source_url` text DEFAULT '' NOT NULL,`source_author` text DEFAULT '' NOT NULL,`license_name` text DEFAULT '' NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade,FOREIGN KEY (`asset_id`) REFERENCES `model_assets`(`id`) ON DELETE cascade,UNIQUE(`organization_id`,`sha256`));
--> statement-breakpoint
CREATE INDEX `model_files_asset_created_idx` ON `model_files` (`asset_id`,`created_at` DESC);
--> statement-breakpoint
CREATE TABLE `model_tags` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,`organization_id` integer NOT NULL,`name` text NOT NULL,`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade,UNIQUE(`organization_id`,`name`));
--> statement-breakpoint
CREATE TABLE `model_tag_links` (`asset_id` integer NOT NULL,`tag_id` integer NOT NULL,PRIMARY KEY(`asset_id`,`tag_id`),FOREIGN KEY (`asset_id`) REFERENCES `model_assets`(`id`) ON DELETE cascade,FOREIGN KEY (`tag_id`) REFERENCES `model_tags`(`id`) ON DELETE cascade);
