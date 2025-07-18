CREATE TABLE "search_ai_import_job" (
	"job_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total_products" integer DEFAULT 0,
	"message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"date_created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"date_updated" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "search_ai_query" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_ai_query_result" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_ai_usage_summary" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_ai_user" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "search_ai_query" CASCADE;--> statement-breakpoint
DROP TABLE "search_ai_query_result" CASCADE;--> statement-breakpoint
DROP TABLE "search_ai_usage_summary" CASCADE;--> statement-breakpoint
DROP TABLE "search_ai_user" CASCADE;--> statement-breakpoint
ALTER TABLE "search_ai_app" DROP CONSTRAINT "search_ai_app_user_id_search_ai_user_user_id_fk";
--> statement-breakpoint
DROP INDEX "app_user_idx";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP CONSTRAINT "search_ai_vector_app_id_product_id_pk";--> statement-breakpoint
ALTER TABLE "search_ai_app" ALTER COLUMN "webhook_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "search_ai_import_job" ADD CONSTRAINT "search_ai_import_job_app_id_search_ai_app_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."search_ai_app"("app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_job_app_idx" ON "search_ai_import_job" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "import_job_status_idx" ON "search_ai_import_job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "vector_pk_idx" ON "search_ai_vector" USING btree ("app_id","product_id");--> statement-breakpoint
ALTER TABLE "search_ai_app" DROP COLUMN "user_id";