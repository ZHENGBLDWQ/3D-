ALTER TABLE `orders` ADD `organization_id` integer REFERENCES `organizations`(`id`);--> statement-breakpoint
ALTER TABLE `print_jobs` ADD `organization_id` integer REFERENCES `organizations`(`id`);--> statement-breakpoint
UPDATE `orders` SET `organization_id`=(SELECT `id` FROM `organizations` ORDER BY `id` LIMIT 1) WHERE `organization_id` IS NULL;--> statement-breakpoint
UPDATE `print_jobs` SET `organization_id`=COALESCE((SELECT `organization_id` FROM `orders` WHERE `orders`.`id`=`print_jobs`.`order_id`),(SELECT `id` FROM `organizations` ORDER BY `id` LIMIT 1)) WHERE `organization_id` IS NULL;--> statement-breakpoint
CREATE INDEX `orders_organization_id_idx` ON `orders` (`organization_id`,`created_at` DESC);--> statement-breakpoint
CREATE INDEX `print_jobs_organization_id_idx` ON `print_jobs` (`organization_id`,`created_at` DESC);
