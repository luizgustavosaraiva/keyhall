CREATE TABLE `notification_channel` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config_enc` text NOT NULL,
	`include_args` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_sent_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
