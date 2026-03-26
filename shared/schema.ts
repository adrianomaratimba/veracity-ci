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

// Subscription plan configurations (editable by platform admins)
export const subscriptionPlans = pgTable("subscription_plans", {
  id: text("id").primaryKey(), // 'basic', 'pro', 'enterprise'
  name: text("name").notNull(),
  description: text("description"),
  priceMonthly: integer("price_monthly").default(0), // in cents
  priceYearly: integer("price_yearly").default(0), // in cents
  maxSurveys: integer("max_surveys").default(1),
  maxInterviews: integer("max_interviews").default(100),
  maxUsers: integer("max_users").default(5),
  features: jsonb("features").default([]), // array of feature strings
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  stripePriceId: text("stripe_price_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const organizationMembers = pgTable("organization_members", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  role: text("role").default("viewer").notNull(),
  dashboardWidgets: jsonb("dashboard_widgets"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Widget types for dashboard customization
export const widgetTypeEnum = z.enum([
  "active_surveys",
  "draft_surveys", 
  "total_interviews",
  "suspicious_alerts",
  "recent_surveys",
  "survey_progress",
  "interviews_chart",
  "team_activity"
]);

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  type: widgetTypeEnum,
  order: z.number(),
  visible: z.boolean().default(true),
  size: z.enum(["small", "medium", "large"]).default("medium"),
});

export type DashboardWidget = z.infer<typeof dashboardWidgetSchema>;
export type WidgetType = z.infer<typeof widgetTypeEnum>;

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
  shuffleQuestions: boolean("shuffle_questions").default(false),
  requireGps: boolean("require_gps").default(true),
  requireAudio: boolean("require_audio").default(true),
  geofenceNeighborhood: text("geofence_neighborhood"),
  geofenceBlocking: boolean("geofence_blocking").default(false),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
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
  shuffleOptions: boolean("shuffle_options").default(false),
  showOptionImages: boolean("show_option_images").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const responses = pgTable("responses", {
  id: serial("id").primaryKey(),
  clientId: varchar("client_id", { length: 64 }),
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

// Survey Coordinator assignments - which coordinators can manage this survey
export const surveyCoordinators = pgTable("survey_coordinators", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  coordinatorId: varchar("coordinator_id").references(() => users.id).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

// Survey Viewer assignments - which viewers can see this survey's results
export const surveyViewers = pgTable("survey_viewers", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  viewerId: varchar("viewer_id").references(() => users.id).notNull(),
  assignedBy: varchar("assigned_by").references(() => users.id).notNull(),
  assignedAt: timestamp("assigned_at").defaultNow(),
});

// Survey Viewer Settings - controls what viewers can see in survey results
export const surveyViewerSettings = pgTable("survey_viewer_settings", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull().unique(),
  
  // Filters visibility (all disabled by default for viewers)
  showFilters: boolean("show_filters").default(false),
  filterAgeGroup: boolean("filter_age_group").default(false),
  filterGender: boolean("filter_gender").default(false),
  filterNeighborhood: boolean("filter_neighborhood").default(false),
  filterInterviewer: boolean("filter_interviewer").default(false),
  
  // Tabs visibility
  showIntentionTab: boolean("show_intention_tab").default(true),
  showEvolutionTab: boolean("show_evolution_tab").default(false),
  showCrossingsTab: boolean("show_crossings_tab").default(false),
  showProfileTab: boolean("show_profile_tab").default(false),
  showReportTab: boolean("show_report_tab").default(false),
  
  // Cards visibility (beyond the fixed ones)
  showMainResult: boolean("show_main_result").default(true),
  showDemographicBreakdowns: boolean("show_demographic_breakdowns").default(false),
  showGenderBreakdown: boolean("show_gender_breakdown").default(false),
  showAgeBreakdown: boolean("show_age_breakdown").default(false),
  showNeighborhoodBreakdown: boolean("show_neighborhood_breakdown").default(false),
  showInterviewerStats: boolean("show_interviewer_stats").default(false),
  
  // Export options
  allowExcelExport: boolean("allow_excel_export").default(false),
  allowPdfExport: boolean("allow_pdf_export").default(false),
  
  // Question-level visibility (null = all questions visible)
  visibleQuestionIds: integer("visible_question_ids").array(),
  
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// === QUESTION MODULES (Reusable question templates) ===

export const questionModules = pgTable("question_modules", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  questions: jsonb("questions").notNull().default([]),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// === RELATIONS ===

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(organizationMembers),
  surveys: many(surveys),
  pendingInvitations: many(pendingInvitations),
  domains: many(organizationDomains),
  questionModules: many(questionModules),
}));

export const questionModulesRelations = relations(questionModules, ({ one }) => ({
  organization: one(organizations, {
    fields: [questionModules.organizationId],
    references: [organizations.id],
  }),
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
  coordinators: many(surveyCoordinators),
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

export const surveyCoordinatorsRelations = relations(surveyCoordinators, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyCoordinators.surveyId],
    references: [surveys.id],
  }),
  coordinator: one(users, {
    fields: [surveyCoordinators.coordinatorId],
    references: [users.id],
  }),
  assigner: one(users, {
    fields: [surveyCoordinators.assignedBy],
    references: [users.id],
  }),
}));

export const surveyViewersRelations = relations(surveyViewers, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyViewers.surveyId],
    references: [surveys.id],
  }),
  viewer: one(users, {
    fields: [surveyViewers.viewerId],
    references: [users.id],
  }),
  assigner: one(users, {
    fields: [surveyViewers.assignedBy],
    references: [users.id],
  }),
}));

export const surveyViewerSettingsRelations = relations(surveyViewerSettings, ({ one }) => ({
  survey: one(surveys, {
    fields: [surveyViewerSettings.surveyId],
    references: [surveys.id],
  }),
  updater: one(users, {
    fields: [surveyViewerSettings.updatedBy],
    references: [users.id],
  }),
}));

// Insert/Select schemas for surveyViewerSettings
export const insertSurveyViewerSettingsSchema = createInsertSchema(surveyViewerSettings).omit({ id: true, updatedAt: true });
export type InsertSurveyViewerSettings = z.infer<typeof insertSurveyViewerSettingsSchema>;
export type SurveyViewerSettings = typeof surveyViewerSettings.$inferSelect;

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

// === ACCESS CONTROL TABLES ===

export const memberPermissionOverrides = pgTable("member_permission_overrides", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => organizationMembers.id).notNull(),
  permission: text("permission").notNull(),
  allowed: boolean("allowed").notNull(),
  grantedBy: varchar("granted_by").references(() => users.id).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});

export const accessAuditLog = pgTable("access_audit_log", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: integer("resource_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const memberPermissionOverridesRelations = relations(memberPermissionOverrides, ({ one }) => ({
  member: one(organizationMembers, {
    fields: [memberPermissionOverrides.memberId],
    references: [organizationMembers.id],
  }),
  grantedByUser: one(users, {
    fields: [memberPermissionOverrides.grantedBy],
    references: [users.id],
  }),
}));

export const accessAuditLogRelations = relations(accessAuditLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [accessAuditLog.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [accessAuditLog.userId],
    references: [users.id],
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
export const insertSurveyCoordinatorSchema = createInsertSchema(surveyCoordinators).omit({ id: true, assignedAt: true });
export const insertSurveyViewerSchema = createInsertSchema(surveyViewers).omit({ id: true, assignedAt: true });
export const insertMemberPermissionOverrideSchema = createInsertSchema(memberPermissionOverrides).omit({ id: true, createdAt: true });
export const insertAccessAuditLogSchema = createInsertSchema(accessAuditLog).omit({ id: true, createdAt: true });
export const insertQuestionModuleSchema = createInsertSchema(questionModules).omit({ id: true, createdAt: true, updatedAt: true });

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

export type SurveyCoordinator = typeof surveyCoordinators.$inferSelect;
export type InsertSurveyCoordinator = z.infer<typeof insertSurveyCoordinatorSchema>;

export type SurveyViewer = typeof surveyViewers.$inferSelect;
export type InsertSurveyViewer = z.infer<typeof insertSurveyViewerSchema>;

export type MemberPermissionOverride = typeof memberPermissionOverrides.$inferSelect;
export type InsertMemberPermissionOverride = z.infer<typeof insertMemberPermissionOverrideSchema>;

export type AccessAuditLog = typeof accessAuditLog.$inferSelect;
export type InsertAccessAuditLog = z.infer<typeof insertAccessAuditLogSchema>;

export type QuestionModule = typeof questionModules.$inferSelect;
export type InsertQuestionModule = z.infer<typeof insertQuestionModuleSchema>;

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type InsertSubscriptionPlan = Omit<SubscriptionPlan, 'updatedAt'>;

export type SurveyWithQuestions = Survey & { questions: Question[] };
export type FullResponse = Response & { answers: Answer[], interviewer: typeof users.$inferSelect };

// === QUOTA SYSTEM TYPES ===

export const quotaCategoryEnum = z.enum(["age", "gender", "neighborhood", "education", "income"]);
export type QuotaCategory = z.infer<typeof quotaCategoryEnum>;

export const quotaTargetSchema = z.object({
  id: z.string(),
  value: z.string(),
  targetCount: z.number().min(0),
  targetPercentage: z.number().min(0).max(100).optional(),
  currentCount: z.number().default(0),
});
export type QuotaTarget = z.infer<typeof quotaTargetSchema>;

export const quotaGroupSchema = z.object({
  id: z.string(),
  category: quotaCategoryEnum,
  name: z.string(),
  questionId: z.number().optional(),
  enabled: z.boolean().default(true),
  hardLimit: z.boolean().default(false),
  targets: z.array(quotaTargetSchema),
});
export type QuotaGroup = z.infer<typeof quotaGroupSchema>;

export const surveyQuotasSchema = z.object({
  enabled: z.boolean().default(false),
  groups: z.array(quotaGroupSchema).default([]),
});
export type SurveyQuotas = z.infer<typeof surveyQuotasSchema>;

// === SKIP LOGIC TYPES ===

export const skipLogicOperatorEnum = z.enum(["equals", "not_equals", "contains", "any"]);
export type SkipLogicOperator = z.infer<typeof skipLogicOperatorEnum>;

export const skipLogicActionTypeEnum = z.enum(["skip_to_question", "skip_to_end"]);
export type SkipLogicActionType = z.infer<typeof skipLogicActionTypeEnum>;

export const skipLogicRuleSchema = z.object({
  id: z.string(),
  condition: z.object({
    operator: skipLogicOperatorEnum,
    value: z.union([z.string(), z.array(z.string())]),
  }),
  action: z.object({
    type: skipLogicActionTypeEnum,
    targetQuestionId: z.number().optional(),
  }),
});
export type SkipLogicRule = z.infer<typeof skipLogicRuleSchema>;

export const questionLogicSchema = z.object({
  rules: z.array(skipLogicRuleSchema).default([]),
});
export type QuestionLogic = z.infer<typeof questionLogicSchema>;

// === LANDING PAGE CMS ===

export const landingPageConfig = pgTable("landing_page_config", {
  id: text("id").primaryKey().default("default"),
  
  // SEO Configuration
  seoTitle: text("seo_title").default("Veracity - Plataforma de Pesquisas Eleitorais"),
  seoDescription: text("seo_description").default("Sistema profissional para gestão de pesquisas eleitorais com GPS, gravação de áudio e detecção de fraudes em tempo real."),
  seoKeywords: text("seo_keywords").default("pesquisa eleitoral, coleta de dados, GPS, anti-fraude, LGPD"),
  ogImage: text("og_image"),
  
  // Hero Section
  heroHeadline: text("hero_headline").default("Pesquisas Eleitorais com Credibilidade Total"),
  heroSubheadline: text("hero_subheadline").default("Sistema profissional de coleta de dados com GPS, gravação de áudio e detecção de fraudes em tempo real. Utilizado pelos principais institutos de pesquisa do Brasil."),
  heroCta: text("hero_cta").default("Começar Agora"),
  heroCtaSecondary: text("hero_cta_secondary").default("Ver Demonstração"),
  heroImage: text("hero_image"),
  
  // Stats Section (JSON array)
  statsEnabled: boolean("stats_enabled").default(true),
  stats: jsonb("stats").default([
    { value: "+500K", label: "Entrevistas Realizadas" },
    { value: "99.8%", label: "Precisão GPS" },
    { value: "24/7", label: "Monitoramento" },
    { value: "<1%", label: "Taxa de Fraude" }
  ]),
  
  // Features Section
  featuresTitle: text("features_title").default("Por que escolher o Veracity?"),
  featuresSubtitle: text("features_subtitle").default("Tecnologia de ponta para pesquisas confiáveis"),
  features: jsonb("features").default([]),
  
  // Testimonials Section
  testimonialsTitle: text("testimonials_title").default("O que nossos clientes dizem"),
  testimonials: jsonb("testimonials").default([]),
  testimonialsEnabled: boolean("testimonials_enabled").default(true),
  
  // FAQ Section
  faqTitle: text("faq_title").default("Perguntas Frequentes"),
  faqs: jsonb("faqs").default([]),
  faqEnabled: boolean("faq_enabled").default(true),
  
  // CTA Section
  ctaTitle: text("cta_title").default("Pronto para revolucionar suas pesquisas?"),
  ctaSubtitle: text("cta_subtitle").default("Comece gratuitamente e descubra como o Veracity pode transformar sua operação de campo."),
  ctaButton: text("cta_button").default("Criar conta grátis"),
  
  // Theme Colors (override defaults)
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  accentColor: text("accent_color"),
  
  // Footer
  footerText: text("footer_text").default("Desenvolvido no Brasil para institutos de pesquisa exigentes."),
  footerLinks: jsonb("footer_links").default([]),
  
  // Analytics & Scripts
  googleAnalyticsId: text("google_analytics_id"),
  customHeadScripts: text("custom_head_scripts"),
  customBodyScripts: text("custom_body_scripts"),
  
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertLandingPageConfigSchema = createInsertSchema(landingPageConfig);
export type InsertLandingPageConfig = z.infer<typeof insertLandingPageConfigSchema>;
export type LandingPageConfig = typeof landingPageConfig.$inferSelect;

// Zod schemas for structured JSON fields
export const landingStatSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type LandingStat = z.infer<typeof landingStatSchema>;

export const landingFeatureSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});
export type LandingFeature = z.infer<typeof landingFeatureSchema>;

export const landingTestimonialSchema = z.object({
  quote: z.string(),
  author: z.string(),
  role: z.string(),
  company: z.string(),
  avatar: z.string().optional(),
});
export type LandingTestimonial = z.infer<typeof landingTestimonialSchema>;

export const landingFaqSchema = z.object({
  question: z.string(),
  answer: z.string(),
});
export type LandingFaq = z.infer<typeof landingFaqSchema>;

export const landingFooterLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});
export type LandingFooterLink = z.infer<typeof landingFooterLinkSchema>;

// === REAL-TIME INTERVIEWER TRACKING ===

export const interviewerLocations = pgTable("interviewer_locations", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  surveyId: integer("survey_id").references(() => surveys.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: doublePrecision("accuracy"),
  speed: doublePrecision("speed"),
  heading: doublePrecision("heading"),
  isOnline: boolean("is_online").default(true),
  sessionId: text("session_id"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const dailyDistanceSummary = pgTable("daily_distance_summary", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  surveyId: integer("survey_id").references(() => surveys.id),
  userId: varchar("user_id").references(() => users.id).notNull(),
  date: timestamp("date").notNull(),
  distanceMeters: doublePrecision("distance_meters").default(0).notNull(),
  pointsCount: integer("points_count").default(0),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertInterviewerLocationSchema = createInsertSchema(interviewerLocations).omit({ id: true, recordedAt: true });
export type InsertInterviewerLocation = z.infer<typeof insertInterviewerLocationSchema>;
export type InterviewerLocation = typeof interviewerLocations.$inferSelect;

export const insertDailyDistanceSummarySchema = createInsertSchema(dailyDistanceSummary).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyDistanceSummary = z.infer<typeof insertDailyDistanceSummarySchema>;
export type DailyDistanceSummary = typeof dailyDistanceSummary.$inferSelect;

export const geofenceViolations = pgTable("geofence_violations", {
  id: serial("id").primaryKey(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  interviewerId: varchar("interviewer_id").references(() => users.id).notNull(),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  neighborhood: text("neighborhood").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGeofenceViolationSchema = createInsertSchema(geofenceViolations).omit({ id: true, createdAt: true });
export type InsertGeofenceViolation = z.infer<typeof insertGeofenceViolationSchema>;
export type GeofenceViolation = typeof geofenceViolations.$inferSelect;

// Push subscriptions for web push notifications
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  subscription: jsonb("subscription").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;

// Interviewer zone assignments (per survey, per neighborhood)
export const interviewerZoneAssignments = pgTable("interviewer_zone_assignments", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id").references(() => organizations.id).notNull(),
  surveyId: integer("survey_id").references(() => surveys.id).notNull(),
  interviewerId: varchar("interviewer_id").references(() => users.id).notNull(),
  neighborhood: text("neighborhood").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertInterviewerZoneAssignmentSchema = createInsertSchema(interviewerZoneAssignments).omit({ id: true, createdAt: true });
export type InsertInterviewerZoneAssignment = z.infer<typeof insertInterviewerZoneAssignmentSchema>;
export type InterviewerZoneAssignment = typeof interviewerZoneAssignments.$inferSelect;
