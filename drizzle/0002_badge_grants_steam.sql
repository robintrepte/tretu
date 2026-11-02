ALTER TABLE "platform_badge_sync" ADD COLUMN "granted_to" text;--> statement-breakpoint
ALTER TABLE "platform_badge_sync" ADD COLUMN "granted_ref" text;--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "steam_id" text;--> statement-breakpoint
CREATE INDEX "platform_badge_sync_granted_idx" ON "platform_badge_sync" USING btree ("target","granted_to","granted_ref");--> statement-breakpoint
-- Backfill from the links already stored (validated again in the app before it renders a link).
UPDATE "platform_users" SET "steam_id" = "links"->>'steam' WHERE "steam_id" IS NULL AND ("links"->>'steam') ~ '^7656[0-9]{13}$';
