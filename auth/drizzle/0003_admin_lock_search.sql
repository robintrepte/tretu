-- Trigram indexes for the admin search. pg_trgm is a trusted extension (PostgreSQL 13+): the database owner may create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
ALTER TABLE "passkey" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locked_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "account_account_id_idx" ON "account" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_log_event_created_idx" ON "audit_log" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "external_link_display_name_trgm_idx" ON "external_link" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_username_trgm_idx" ON "user" USING gin ("username" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_name_trgm_idx" ON "user" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_email_trgm_idx" ON "user" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "user_locked_idx" ON "user" USING btree ("locked_until") WHERE "user"."locked";