CREATE TABLE "search_ai_plugin_config_shopcada_webhook" (
	"app_id" integer PRIMARY KEY NOT NULL,
	"webhook_secret" varchar(255) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "search_ai_vector" ADD COLUMN "is_published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "search_ai_plugin_config_shopcada_webhook" ADD CONSTRAINT "search_ai_plugin_config_shopcada_webhook_app_id_search_ai_app_app_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."search_ai_app"("app_id") ON DELETE no action ON UPDATE no action;