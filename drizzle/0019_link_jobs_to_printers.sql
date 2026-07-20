ALTER TABLE `print_jobs` ADD `printer_id` integer REFERENCES `printers`(`id`);
