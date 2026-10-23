ALTER TABLE `connection` ADD `kind` text DEFAULT 'mcp' NOT NULL;--> statement-breakpoint
ALTER TABLE `connection` ADD `auth_header` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `auth_prefix` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `secret_enc` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `spec_url` text;--> statement-breakpoint
ALTER TABLE `connection` ADD `spec` text;