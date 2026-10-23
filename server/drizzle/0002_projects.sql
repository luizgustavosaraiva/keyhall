CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_slug_unique` ON `organization` (`slug`);--> statement-breakpoint
CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_org_slug_unique` ON `project` (`org_id`,`slug`);--> statement-breakpoint
DROP INDEX `connection_slug_unique`;--> statement-breakpoint
ALTER TABLE `connection` ADD `project_id` text REFERENCES project(id);--> statement-breakpoint
CREATE UNIQUE INDEX `connection_project_slug_unique` ON `connection` (`project_id`,`slug`);--> statement-breakpoint
DROP INDEX `scope_slug_unique`;--> statement-breakpoint
ALTER TABLE `scope` ADD `org_id` text REFERENCES organization(id);--> statement-breakpoint
ALTER TABLE `scope` ADD `project_id` text REFERENCES project(id);--> statement-breakpoint
CREATE UNIQUE INDEX `scope_org_slug_unique` ON `scope` (`org_id`,`slug`);--> statement-breakpoint
-- Default organization and project; existing rows move into the default project.
INSERT INTO `organization` (`id`, `slug`, `name`) VALUES ('org-default', 'default', 'Default');--> statement-breakpoint
INSERT INTO `project` (`id`, `org_id`, `slug`, `name`) VALUES ('prj-default', 'org-default', 'default', 'Default');--> statement-breakpoint
UPDATE `connection` SET `project_id` = 'prj-default' WHERE `project_id` IS NULL;--> statement-breakpoint
UPDATE `scope` SET `org_id` = 'org-default', `project_id` = 'prj-default' WHERE `org_id` IS NULL;
