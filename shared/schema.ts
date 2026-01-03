import { pgTable, text, serial, integer, boolean, timestamp, jsonb, doublePrecision, varchar } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// === ENUMS (English internally, Portuguese in UI via translation layer) ===
export const planTypeEnum = z.enum(["basic", "pro", "enterprise"]);
export const userRoleEnum = z.enum(["owner", "admin", "coordinator", "interviewer", "viewer"]);
export const surveyTypeEnum = z.enum(["electoral", "opinion", "market", "census"]);
export const surveyStatusEnum = z.enum(["draft", "active", "paused", "completed", "archived"]);
export const questionTypeEnum = z.enum(["single_choice", "multiple_choice", "text", "number", "scale", "date", "boolean"]);
export const responseStatusEnum = z.enum(["valid", "suspicious", "invalid"]);
export const invitationStatusEnum = z.enum(["pending", "accepted", "revoked", "expired"]);

// === TABLES ===

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  plan: text("plan").default("basic").notNull(),
  maxInterviews: integer("max_interviews").default(100),
  maxSurveys: integer("max_surveys").default(1),
  maxUsers: integer("max_users").default(5),
  settings: jsonb("settings").default({}),
  logoUrl: text("logo_url"),
  primaryColor: text("primary_color").default("#1e3a5f"),
  secondaryColor: text("secondary_color").default("#2563eb"),
  brandingName: text("branding_name"),
  hideVotoAuditBrand: boolean("hide_votoaudit_brand").default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  billingStatus: text("billing_status").default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationDomains = pgTable("organization_domains", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  domain: text("domain").unique().notNull(),
  isSubdomain: boolean("is_subdomain").default(false),
  dnsStatus: text("dns_status").default("pending"),
  sslStatus: text("ssl_status").default("pending"),
  verificationToken: text("verification_token"),
  isPrimary: boolean("is_primary").default(false),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("viewer").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const pendingInvitations = pgTable("pending_invitations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  email: text("email").notNull(),
  role: text("role").default("viewer").notNull(),
  invitedBy: varchar("invited_by").references(() => users.id).notNull(),
  status: text("status").default("pending").notNull(),
  invitedAt: timestamp("invited_at").defaultNow(),
  respondedAt: timestamp("responded_at"),
});

export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(),
  status: text("status").default("draft").notNull(),
  location: text("location"),
  targetSample: integer("target_sample"),
  marginOfError: doublePrecision("margin_of_error"),
  quotas: jsonb("quotas"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  text: text("text").notNull(),
  type: text("type").notNull(),
  options: jsonb("options"),
  order: integer("order").notNull(),
  required: boolean("required").default(true),
  logic: jsonb("logic"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const responses = pgTable("responses", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  interviewerId: varchar("interviewer_id").references(() => users.id).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: doublePrecision("accuracy").notNull(),
  gpsTimestamp: timestamp("gps_timestamp").notNull(),
  audioUrl: text("audio_url").notNull(),
  audioHash: text("audio_hash").notNull(),
  audioDuration: integer("audio_duration"),
  deviceInfo: jsonb("device_info"),
  status: text("status").default("valid").notNull(),
  flagReason: text("flag_reason"),
  reviewNote: text("review_note"),
  reviewedAt: timestamp("reviewed_at"),
  duration: integer("duration"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const answers = pgTable("answers", {
  id: serial("id").primaryKey(),
  responseId: integer("response_id").references(() => responses.id).notNull(),
  questionId: integer("question_id").references(() => questions.id).notNull(),
  value: jsonb("value").notNull(),
});

export const surveyAssignments = pgTable("survey_assignments", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  interviewerId: varchar("interviewer_id").references(() => users.id).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

// === RELATIONS ===

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  surveys: many(surveys),
  pendingInvitations: many(pendingInvitations),
  domains: many(organizationDomains),
}));

export const organizationDomainsRelations = relations(organizationDomains, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationDomains.organizationId],
    references: [organizations.id],
  }),
}));

export const organizationMembersRelations = relations(organizationMembers, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationMembers.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [organizationMembers.userId],
    references: [users.id],
  }),
}));

export const pendingInvitationsRelations = relations(pendingInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [pendingInvitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [pendingInvitations.invitedBy],
    references: [users.id],
  }),
}));

export const surveysRelations = relations(surveys, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [surveys.organizationId],
    references: [organizations.id],
  }),
  questions: many(questions),
  responses: many(responses),
  assignments: many(surveyAssignments),
}));

export const surveyAssignmentsRelations = relations(surveyAssignments, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyAssignments.surveyId],
    references: [surveys.id],
  }),
  interviewer: one(users, {
    fields: [surveyAssignments.interviewerId],
    references: [users.id],
  }),
  assigner: one(users, {
    fields: [surveyAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const questionsRelations = relations(questions, ({ one }) => ({
  survey: one(surveys, {
    fields: [questions.surveyId],
    references: [surveys.id],
  }),
}));

export const responsesRelations = relations(responses, ({ one, many }) => ({
  survey: one(surveys, {
    fields: [responses.surveyId],
    references: [surveys.id],
  }),
  interviewer: one(users, {
    fields: [responses.interviewerId],
    references: [users.id],
  }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  response: one(responses, {
    fields: [answers.responseId],
    references: [responses.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

// === SCHEMAS ===

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertOrganizationDomainSchema = createInsertSchema(organizationDomains).omit({ id: true, createdAt: true, verifiedAt: true });
export const insertSurveySchema = createInsertSchema(surveys).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuestionSchema = createInsertSchema(questions).omit({ id: true, createdAt: true });
export const insertResponseSchema = createInsertSchema(responses).omit({ id: true, createdAt: true, status: true, flagReason: true });
export const insertAnswerSchema = createInsertSchema(answers).omit({ id: true });
export const insertMemberSchema = createInsertSchema(organizationMembers).omit({ id: true, joinedAt: true });
export const insertPendingInvitationSchema = createInsertSchema(pendingInvitations).omit({ id: true, invitedAt: true, respondedAt: true, status: true });
export const insertSurveyAssignmentSchema = createInsertSchema(surveyAssignments).omit({ id: true, assignedAt: true });

// === TYPES ===

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

export type OrganizationDomain = typeof organizationDomains.$inferSelect;
export type InsertOrganizationDomain = z.infer<typeof insertOrganizationDomainSchema>;

export type Member = typeof organizationMembers.$inferSelect;
export type InsertMember = z.infer<typeof insertMemberSchema>;

export type PendingInvitation = typeof pendingInvitations.$inferSelect;
export type InsertPendingInvitation = z.infer<typeof insertPendingInvitationSchema>;

export type Survey = typeof surveys.$inferSelect;
export type InsertSurvey = z.infer<typeof insertSurveySchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export type Response = typeof responses.$inferSelect;
export type InsertResponse = z.infer<typeof insertResponseSchema>;

export type Answer = typeof answers.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;

export type SurveyAssignment = typeof surveyAssignments.$inferSelect;
export type InsertSurveyAssignment = z.infer<typeof insertSurveyAssignmentSchema>;

export type SurveyWithQuestions = Survey & { questions: Question[] };
export type FullResponse = Response & { answers: Answer[], interviewer: typeof users.$inferSelect };
