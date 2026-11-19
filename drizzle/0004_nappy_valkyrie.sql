DROP INDEX `users_email_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `student_id_hash` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_student_id_hash_unique` ON `users` (`student_id_hash`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `email`;