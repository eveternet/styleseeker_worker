ALTER TABLE "search_ai_vector" DROP CONSTRAINT "unique_app_product";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP CONSTRAINT "search_ai_vector_pkey";--> statement-breakpoint
ALTER TABLE "search_ai_vector" DROP COLUMN "vector_id";--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD CONSTRAINT "search_ai_vector_app_id_product_id_pk" PRIMARY KEY("app_id","product_id");