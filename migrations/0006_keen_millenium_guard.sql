CREATE TABLE "survey_viewer_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"survey_id" integer NOT NULL,
	"show_filters" boolean DEFAULT false,
	"filter_age_group" boolean DEFAULT false,
	"filter_gender" boolean DEFAULT false,
	"filter_neighborhood" boolean DEFAULT false,
	"filter_interviewer" boolean DEFAULT false,
	"show_intention_tab" boolean DEFAULT true,
	"show_evolution_tab" boolean DEFAULT false,
	"show_crossings_tab" boolean DEFAULT false,
	"show_profile_tab" boolean DEFAULT false,
	"show_report_tab" boolean DEFAULT false,
	"show_main_result" boolean DEFAULT true,
	"show_demographic_breakdowns" boolean DEFAULT false,
	"show_gender_breakdown" boolean DEFAULT false,
	"show_age_breakdown" boolean DEFAULT false,
	"show_neighborhood_breakdown" boolean DEFAULT false,
	"show_interviewer_stats" boolean DEFAULT false,
	"allow_excel_export" boolean DEFAULT false,
	"allow_pdf_export" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar,
	CONSTRAINT "survey_viewer_settings_survey_id_unique" UNIQUE("survey_id")
);
--> statement-breakpoint
ALTER TABLE "survey_viewer_settings" ADD CONSTRAINT "survey_viewer_settings_survey_id_surveys_id_fk" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_viewer_settings" ADD CONSTRAINT "survey_viewer_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;