CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`invite_hash` text,
	`invite_expires` integer,
	`invited_by` text NOT NULL,
	`joined_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_invite_hash_unique` ON `member` (`invite_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_org_email_unique` ON `member` (`org_id`,`email`);--> statement-breakpoint
CREATE TABLE `member_connection` (
	`member_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`allowed_tools` text,
	PRIMARY KEY(`member_id`, `connection_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connection`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `member_scope` (
	`member_id` text NOT NULL,
	`scope_id` text NOT NULL,
	PRIMARY KEY(`member_id`, `scope_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scope_id`) REFERENCES `scope`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `member_secret` (
	`member_id` text NOT NULL,
	`secret_id` text NOT NULL,
	PRIMARY KEY(`member_id`, `secret_id`),
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`secret_id`) REFERENCES `secret`(`id`) ON UPDATE no action ON DELETE cascade
);
