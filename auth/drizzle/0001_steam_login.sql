CREATE TABLE "openid_nonce" (
	"nonce" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "display_name" text;--> statement-breakpoint
CREATE INDEX "openid_nonce_expires_idx" ON "openid_nonce" USING btree ("expires_at");--> statement-breakpoint
-- Steam IDs linked through the admin API so far become sign-in identities (provider "steam" in "account").
INSERT INTO "account" ("id", "account_id", "provider_id", "user_id", "display_name", "created_at", "updated_at")
SELECT gen_random_uuid()::text, l."provider_account_id", 'steam', l."user_id", l."display_name", l."created_at", now()
FROM "external_link" l
WHERE l."provider" = 'steam'
  AND NOT EXISTS (SELECT 1 FROM "account" a WHERE a."provider_id" = 'steam' AND (a."account_id" = l."provider_account_id" OR a."user_id" = l."user_id"))
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "external_link" l
WHERE l."provider" = 'steam'
  AND EXISTS (SELECT 1 FROM "account" a WHERE a."provider_id" = 'steam' AND a."account_id" = l."provider_account_id" AND a."user_id" = l."user_id");
