ALTER TABLE "search_ai_organisation" RENAME TO "search_ai_user";--> statement-breakpoint
ALTER TABLE "search_ai_app" RENAME COLUMN "organisation_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "search_ai_user" RENAME COLUMN "organisation_id" TO "user_id";--> statement-breakpoint
ALTER TABLE "search_ai_user" RENAME COLUMN "clerk_org_id" TO "clerk_user_id";--> statement-breakpoint
ALTER TABLE "search_ai_user" RENAME COLUMN "organisation_name" TO "user_name";--> statement-breakpoint
ALTER TABLE "search_ai_user" DROP CONSTRAINT "search_ai_organisation_clerk_org_id_unique";--> statement-breakpoint
ALTER TABLE "search_ai_app" DROP CONSTRAINT "search_ai_app_organisation_id_search_ai_organisation_organisation_id_fk";
--> statement-breakpoint
DROP INDEX "app_organisation_idx";--> statement-breakpoint
DROP INDEX "vector_text_checksum_idx";--> statement-breakpoint
DROP INDEX "vector_image_checksum_idx";--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD COLUMN "full_text" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD COLUMN "image_urls" varchar(64) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "search_ai_app" ADD CONSTRAINT "search_ai_app_user_id_search_ai_user_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."search_ai_user"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_user_idx" ON "search_ai_app" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vector_full_text_idx" ON "search_ai_vector" USING btree ("full_text");--> statement-breakpoint
CREATE INDEX "vector_image_urls_idx" ON "search_ai_vector" USING btree ("image_urls");--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP COLUMN "text_checksum";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP COLUMN "image_checksum";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP COLUMN "image_url";--> statement-breakpoint
ALTER TABLE "search_ai_user" ADD CONSTRAINT "search_ai_user_clerk_user_id_unique" UNIQUE("clerk_user_id");