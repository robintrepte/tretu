CREATE TABLE "platform_status_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"state" text NOT NULL,
	"response_ms" integer,
	"http_status" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "platform_status_rollups" (
	"service" text NOT NULL,
	"period" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"checks" integer DEFAULT 0 NOT NULL,
	"up" integer DEFAULT 0 NOT NULL,
	"degraded" integer DEFAULT 0 NOT NULL,
	"down" integer DEFAULT 0 NOT NULL,
	"response_ms_sum" bigint DEFAULT 0 NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "platform_status_rollups_service_period_bucket_start_pk" PRIMARY KEY("service","period","bucket_start")
);
--> statement-breakpoint
CREATE TABLE "platform_status_services" (
	"service" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"since" timestamp with time zone NOT NULL,
	"consecutive" integer DEFAULT 1 NOT NULL,
	"alerted_state" text DEFAULT 'up' NOT NULL,
	"alerted_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone NOT NULL,
	"last_response_ms" integer,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "platform_status_checks_service_idx" ON "platform_status_checks" USING btree ("service","checked_at");--> statement-breakpoint
CREATE INDEX "platform_status_checks_checked_at_idx" ON "platform_status_checks" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "platform_status_rollups_period_idx" ON "platform_status_rollups" USING btree ("period","bucket_start");