ALTER TABLE "search_ai_vector" ADD COLUMN "first_image_url" varchar(1024);--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD COLUMN "image_url_checksum" varchar(64);--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD COLUMN "image_description" text;