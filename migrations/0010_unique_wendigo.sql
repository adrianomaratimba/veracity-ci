CREATE TABLE IF NOT EXISTS "survey_commentaries" (
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
DO $$ BEGIN
 ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "survey_commentaries" ADD CONSTRAINT "survey_commentaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
