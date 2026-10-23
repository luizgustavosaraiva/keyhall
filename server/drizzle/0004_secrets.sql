CREATE TABLE `scope_secret` (
	`scope_id` text NOT NULL,
	`secret_id` text NOT NULL,
	PRIMARY KEY(`scope_id`, `secret_id`),
	FOREIGN KEY (`scope_id`) REFERENCES `scope`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `secret`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `secret` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`agent_access` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `secret_project_name_unique` ON `secret` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `secret_access` (
	`id` text PRIMARY KEY NOT NULL,
	`secret_id` text NOT NULL,
	`version` integer NOT NULL,
	`via` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`secret_id`) REFERENCES `secret`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `secret_version` (
	`secret_id` text NOT NULL,
	`version` integer NOT NULL,
	`value_enc` text NOT NULL,
	`key_enc` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`secret_id`, `version`),
	FOREIGN KEY (`secret_id`) REFERENCES `secret`(`id`) ON UPDATE no action ON DELETE cascade
);
