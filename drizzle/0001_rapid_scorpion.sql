PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auditions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`event_date` text NOT NULL,
	`deadline` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`is_penalty_enabled` integer DEFAULT false NOT NULL,
	`aggregation_method` text DEFAULT 'DIFF_CORRECTION' NOT NULL,
	`standard_diff` real DEFAULT 10 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_auditions`("id", "title", "event_date", "deadline", "status", "is_penalty_enabled", "aggregation_method", "standard_diff", "created_at", "updated_at") SELECT "id", "title", "event_date", "deadline", "status", "is_penalty_enabled", "aggregation_method", "standard_diff", "created_at", "updated_at" FROM `auditions`;--> statement-breakpoint
DROP TABLE `auditions`;--> statement-breakpoint
ALTER TABLE `__new_auditions` RENAME TO `auditions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_auditions_event_date` ON `auditions` (`event_date`);--> statement-breakpoint
CREATE INDEX `idx_auditions_status` ON `auditions` (`status`);