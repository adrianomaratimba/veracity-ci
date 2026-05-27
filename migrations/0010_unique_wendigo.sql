CREATE TABLE "custom_geofences" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"polygon" jsonb NOT NULL,
	"population_count" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "geofence_violations" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"organization_id" integer NOT NULL,
	"interviewer_id" varchar NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"neighborhood" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviewer_zone_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"survey_id" integer NOT NULL,
	"interviewer_id" varchar NOT NULL,
	"neighborhood" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "public_report_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"survey_id" integer NOT NULL,
	"token" varchar(64) NOT NULL,
	"label" text,
	"expires_at" timestamp,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "public_report_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" integer NOT NULL,
	"subscription" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "survey_commentaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"comment_text" text NOT NULL,
	"approved" boolean DEFAULT false,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "survey_commentaries_survey_id_question_id_unique" UNIQUE("survey_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "upload_ownership" (
	"object_id" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"subscription" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "whatsapp_phone" text;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "fraud_score" integer;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "geofence_neighborhood" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "geofence_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "geofence_blocking" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "geofence_custom_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "custom_geofence_id" integer;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "geofence_city" text;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "sampling_percentage" double precision;--> statement-breakpoint
ALTER TABLE "surveys" ADD COLUMN "wave_label" text;--> statement-breakpoint
ALTER TABLE "custom_geofences" ADD CONSTRAINT "custom_geofences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_violations" ADD CONSTRAINT "geofence_violations_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_violations" ADD CONSTRAINT "geofence_violations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_violations" ADD CONSTRAINT "geofence_violations_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviewer_zone_assignments" ADD CONSTRAINT "interviewer_zone_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviewer_zone_assignments" ADD CONSTRAINT "interviewer_zone_assignments_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviewer_zone_assignments" ADD CONSTRAINT "interviewer_zone_assignments_interviewer_id_users_id_fk" FOREIGN KEY ("interviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_report_tokens" ADD CONSTRAINT "public_report_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_report_tokens" ADD CONSTRAINT "public_report_tokens_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_report_tokens" ADD CONSTRAINT "public_report_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_ownership" ADD CONSTRAINT "upload_ownership_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_ownership" ADD CONSTRAINT "upload_ownership_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_push_subscriptions" ADD CONSTRAINT "user_push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;