CREATE TABLE IF NOT EXISTS "platform_app_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar REFERENCES "users"("id")
);
