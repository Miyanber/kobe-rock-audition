CREATE TABLE `audition_voters` (
	`id` text PRIMARY KEY NOT NULL,
	`audition_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permission_type` text DEFAULT 'SCORE_AND_COMMENT' NOT NULL,
	`is_submitted` integer DEFAULT false NOT NULL,
	`submitted_at` integer,
	FOREIGN KEY (`audition_id`) REFERENCES `auditions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_audition_voters_audition_user` ON `audition_voters` (`audition_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `auditions` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`event_date` text NOT NULL,
	`deadline` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`is_penalty_enabled` integer DEFAULT true NOT NULL,
	`aggregation_method` text DEFAULT 'DIFF_CORRECTION' NOT NULL,
	`standard_diff` real DEFAULT 10 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auditions_event_date` ON `auditions` (`event_date`);--> statement-breakpoint
CREATE INDEX `idx_auditions_status` ON `auditions` (`status`);--> statement-breakpoint
CREATE TABLE `band_members` (
	`id` text PRIMARY KEY NOT NULL,
	`band_id` text NOT NULL,
	`user_id` text NOT NULL,
	`instrument` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_band_members_band_user` ON `band_members` (`band_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_band_members_user` ON `band_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `bands` (
	`id` text PRIMARY KEY NOT NULL,
	`audition_id` text NOT NULL,
	`name` text NOT NULL,
	`performance_order` integer NOT NULL,
	`penalty_deduction` real DEFAULT 0 NOT NULL,
	`updated_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`audition_id`) REFERENCES `auditions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_bands_audition_order` ON `bands` (`audition_id`,`performance_order`);--> statement-breakpoint
CREATE TABLE `scores` (
	`id` text PRIMARY KEY NOT NULL,
	`audition_id` text NOT NULL,
	`band_id` text NOT NULL,
	`evaluator_user_id` text NOT NULL,
	`tech_score` real,
	`charm_score` real,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`audition_id`) REFERENCES `auditions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`band_id`) REFERENCES `bands`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evaluator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scores_audition_band_evaluator` ON `scores` (`audition_id`,`band_id`,`evaluator_user_id`);--> statement-breakpoint
CREATE INDEX `idx_scores_audition_evaluator` ON `scores` (`audition_id`,`evaluator_user_id`);--> statement-breakpoint
CREATE INDEX `idx_scores_audition_band` ON `scores` (`audition_id`,`band_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`google_sub` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'VOTER' NOT NULL,
	`enrollment_year` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);--> statement-breakpoint
CREATE INDEX `idx_users_enrollment_year` ON `users` (`enrollment_year`);