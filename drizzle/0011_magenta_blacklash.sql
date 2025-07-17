CREATE TABLE "search_ai_vector" (
	"app_id" integer NOT NULL,
	"product_id" varchar(255) NOT NULL,
	"product_name" varchar(255) NOT NULL,
	"embedding" real[] NOT NULL,
	"text_checksum" varchar(64) DEFAULT '' NOT NULL,
	"image_checksum" varchar(64) DEFAULT '' NOT NULL,
	"image_url" varchar(1024),
	"image_description" text,
	"date_created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"date_updated" timestamp with time zone,
	CONSTRAINT "search_ai_vector_app_id_product_id_pk" PRIMARY KEY("app_id","product_id")
);
--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD CONSTRAINT "search_ai_vector_app_id_search_ai_app_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."search_ai_app"("app_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vector_app_idx" ON "search_ai_vector" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "vector_text_checksum_idx" ON "search_ai_vector" USING btree ("text_checksum");--> statement-breakpoint
CREATE INDEX "vector_image_checksum_idx" ON "search_ai_vector" USING btree ("image_checksum");