CREATE TABLE `agent_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`description` text,
	`raw_payload` text,
	`status` text DEFAULT 'received',
	`created_at` text,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` integer,
	`agent_id_on_chain` integer,
	`name` text NOT NULL,
	`model_type` text,
	`public_key` text NOT NULL,
	`status` text DEFAULT 'active',
	`created_at` text,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer,
	`agent_id` integer NOT NULL,
	`vendor_id` integer NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'USDC',
	`storage_root` text,
	`tx_hash` text,
	`status` text DEFAULT 'pending',
	`created_at` text,
	FOREIGN KEY (`event_id`) REFERENCES `agent_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`agent_id` integer NOT NULL,
	`vendor_id` integer,
	`max_amount` real NOT NULL,
	`timeframe` text DEFAULT 'per_transaction',
	`condition` text,
	`is_active` integer DEFAULT true,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`name` text,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_address_unique` ON `users` (`address`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`address` text NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`is_whitelisted` integer DEFAULT false,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vendors_address_unique` ON `vendors` (`address`);