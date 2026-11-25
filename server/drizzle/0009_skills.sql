CREATE TABLE `member_skill` (
	`member_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`member_id`, `skill_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scope_skill` (
	`scope_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`scope_id`, `skill_id`),
	FOREIGN KEY (`scope_id`) REFERENCES `scope`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skill` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`slug` text NOT NULL,
	`active_version` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_project_slug_unique` ON `skill` (`project_id`,`slug`);--> statement-breakpoint
CREATE TABLE `skill_version` (
	`skill_id` text NOT NULL,
	`version` text NOT NULL,
	`seq` integer NOT NULL,
	`description` text NOT NULL,
	`body` text NOT NULL,
	`frontmatter_extra` text,
	`files` text NOT NULL,
	`changelog` text,
	`created_by` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`skill_id`, `version`),
	FOREIGN KEY (`skill_id`) REFERENCES `skill`(`id`) ON UPDATE no action ON DELETE cascade
);
