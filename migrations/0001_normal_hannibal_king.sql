CREATE TABLE "subscription_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_monthly" integer DEFAULT 0,
	"price_yearly" integer DEFAULT 0,
	"max_surveys" integer DEFAULT 1,
	"max_interviews" integer DEFAULT 100,
	"max_users" integer DEFAULT 5,
	"features" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"stripe_price_id" text,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "survey_coordinators" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"coordinator_id" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"assigned_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "shuffle_options" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "shuffle_questions" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "deleted_by" varchar;--> statement-breakpoint
ALTER TABLE "survey_coordinators" ADD CONSTRAINT "survey_coordinators_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_coordinators" ADD CONSTRAINT "survey_coordinators_coordinator_id_users_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_coordinators" ADD CONSTRAINT "survey_coordinators_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;