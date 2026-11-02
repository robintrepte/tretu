CREATE TABLE "platform_admin_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_sub" text NOT NULL,
	"action" text NOT NULL,
	"target_sub" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_badge_revocations" (
	"sub" text NOT NULL,
	"badge_key" text NOT NULL,
	"actor_sub" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_badge_revocations_sub_badge_key_pk" PRIMARY KEY("sub","badge_key")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "source" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tretu_roles" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tretu_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tretu_locked_until" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "platform_admin_audit_created_idx" ON "platform_admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_audit_target_idx" ON "platform_admin_audit" USING btree ("target_sub","created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_audit_actor_idx" ON "platform_admin_audit" USING btree ("actor_sub","created_at");--> statement-breakpoint
CREATE INDEX "platform_admin_audit_action_idx" ON "platform_admin_audit" USING btree ("action","created_at");