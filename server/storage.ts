import { 
  users, User, UpsertUser,
  organizations, Organization, InsertOrganization,
  organizationMembers, Member, InsertMember,
  pendingInvitations, PendingInvitation, InsertPendingInvitation,
  surveys, Survey, InsertSurvey,
  questions, Question, InsertQuestion,
  responses, Response, InsertResponse,
  answers, Answer, InsertAnswer,
  surveyAssignments, SurveyAssignment, InsertSurveyAssignment,
  surveyCoordinators, SurveyCoordinator, InsertSurveyCoordinator,
  memberPermissionOverrides, MemberPermissionOverride, InsertMemberPermissionOverride,
  accessAuditLog, AccessAuditLog, InsertAccessAuditLog,
  questionModules, QuestionModule, InsertQuestionModule,
  organizationDomains, OrganizationDomain, InsertOrganizationDomain,
  subscriptionPlans, SubscriptionPlan
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, ilike } from "drizzle-orm";

export interface IStorage {
  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganizationsByUserId(userId: string): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization>;
  isUserMemberOfOrg(userId: string, orgId: number): Promise<boolean>;
  
  // Users
  getUserById(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUserByEmail(email: string, firstName?: string, lastName?: string): Promise<User>;
  updateUserName(userId: string, firstName: string, lastName: string | null): Promise<void>;

  // Members
  getOrganizationMembers(orgId: number): Promise<(Member & { user: User })[]>;
  addMember(member: InsertMember): Promise<Member>;
  getMemberByUserId(userId: string, orgId: number): Promise<Member | undefined>;
  getMemberById(memberId: number): Promise<Member | undefined>;
  updateMemberRole(memberId: number, role: string): Promise<Member>;
  removeMember(memberId: number): Promise<void>;

  // Pending Invitations
  createPendingInvitation(invitation: InsertPendingInvitation): Promise<PendingInvitation>;
  getPendingInvitationsByOrg(orgId: number): Promise<(PendingInvitation & { inviter: User })[]>;
  getPendingInvitationById(id: number): Promise<PendingInvitation | undefined>;
  getPendingInvitationByEmail(orgId: number, email: string): Promise<PendingInvitation | undefined>;
  cancelPendingInvitation(id: number): Promise<void>;
  getPendingInvitationsByEmail(email: string): Promise<PendingInvitation[]>;
  acceptPendingInvitation(id: number): Promise<void>;

  // Surveys
  getSurveys(orgId: number): Promise<Survey[]>;
  getTrashedSurveys(orgId: number): Promise<Survey[]>;
  getSurvey(id: number): Promise<(Survey & { questions: Question[] }) | undefined>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: number, survey: Partial<InsertSurvey>): Promise<Survey>;
  softDeleteSurvey(id: number, deletedBy: string): Promise<Survey>;
  restoreSurvey(id: number): Promise<Survey>;
  permanentlyDeleteSurvey(id: number): Promise<void>;
  duplicateSurvey(id: number, newTitle: string, userId: string): Promise<Survey>;

  // Questions
  getQuestion(id: number): Promise<Question | undefined>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuestion(id: number, question: Partial<InsertQuestion>): Promise<Question>;
  deleteQuestion(id: number): Promise<void>;

  // Responses
  createResponse(response: InsertResponse, answers: Omit<InsertAnswer, 'responseId'>[]): Promise<Response>;
  getResponses(surveyId: number): Promise<Response[]>;
  getResponse(id: number): Promise<(Response & { answers: Answer[] }) | undefined>;
  getResponsesWithAnswers(surveyId: number): Promise<(Response & { answers: Answer[] })[]>;
  
  // Analytics
  getSurveyAnalytics(surveyId: number): Promise<any>;
  getOrganizationStats(orgId: number): Promise<{
    totalInterviews: number;
    interviewsThisMonth: number;
    activeSurveys: number;
    draftSurveys: number;
  }>;
  
  // Results Dashboard (Aggregated Data)
  getSurveyAggregatedResults(surveyId: number, filters?: {
    interviewerId?: string;
    neighborhood?: string;
    ageRange?: string;
    gender?: string;
    education?: string;
  }): Promise<{
    survey: Survey & { questions: Question[] };
    totalResponses: number;
    validResponses: number;
    questionResults: Array<{
      questionId: number;
      questionText: string;
      questionType: string;
      results: Array<{ option: string; count: number; percentage: number }>;
    }>;
  }>;
  getSurveyTimeline(surveyId: number): Promise<Array<{
    date: string;
    total: number;
    questionSnapshots: Array<{
      questionId: number;
      results: Array<{ option: string; count: number; percentage: number }>;
    }>;
  }>>;

  // Interviewers for filter
  getSurveyInterviewers(surveyId: number): Promise<Array<{ id: string; name: string }>>;

  // Interviewer Comparison (Audit)
  getInterviewerComparison(orgId: number, filters: {
    surveyId?: number;
    questionId?: number;
    interviewerIds?: string[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    interviewers: Array<{
      id: string;
      name: string;
      totalResponses: number;
    }>;
    questions: Array<{
      id: number;
      text: string;
      options: string[];
    }>;
    comparison: Array<{
      questionId: number;
      questionText: string;
      byInterviewer: Array<{
        interviewerId: string;
        interviewerName: string;
        totalForQuestion: number;
        distribution: Array<{ option: string; count: number; percentage: number }>;
      }>;
      groupAverage: Array<{ option: string; avgPercentage: number }>;
      discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }>;
    }>;
  }>;

  // Survey Assignments (Interviewers)
  getSurveyAssignments(surveyId: number): Promise<(SurveyAssignment & { interviewer: User })[]>;
  getAssignedSurveys(interviewerId: string, orgId: number): Promise<Survey[]>;
  assignInterviewer(data: InsertSurveyAssignment): Promise<SurveyAssignment>;
  unassignInterviewer(surveyId: number, interviewerId: string): Promise<void>;
  isInterviewerAssigned(surveyId: number, interviewerId: string): Promise<boolean>;

  // Survey Coordinators
  getSurveyCoordinators(surveyId: number): Promise<(SurveyCoordinator & { coordinator: User })[]>;
  getCoordinatorAssignedSurveys(coordinatorId: string, orgId: number): Promise<Survey[]>;
  assignCoordinator(data: InsertSurveyCoordinator): Promise<SurveyCoordinator>;
  unassignCoordinator(surveyId: number, coordinatorId: string): Promise<void>;
  isCoordinatorAssigned(surveyId: number, coordinatorId: string): Promise<boolean>;

  // Permission Overrides
  getMemberPermissionOverrides(memberId: number): Promise<MemberPermissionOverride[]>;
  getOrgPermissionOverrides(orgId: number): Promise<(MemberPermissionOverride & { member: Member & { user: User } })[]>;
  addPermissionOverride(data: InsertMemberPermissionOverride): Promise<MemberPermissionOverride>;
  removePermissionOverride(id: number): Promise<void>;
  hasEffectivePermission(memberId: number, baseRole: string, permission: string): Promise<boolean>;

  // Access Audit Log
  logAccess(data: InsertAccessAuditLog): Promise<AccessAuditLog>;
  getAccessLogs(orgId: number, limit?: number): Promise<(AccessAuditLog & { user: User })[]>;

  // Question Modules
  getQuestionModules(orgId: number): Promise<QuestionModule[]>;
  getQuestionModule(id: number): Promise<QuestionModule | undefined>;
  createQuestionModule(data: InsertQuestionModule): Promise<QuestionModule>;
  updateQuestionModule(id: number, data: Partial<InsertQuestionModule>): Promise<QuestionModule>;
  deleteQuestionModule(id: number): Promise<void>;

  // Organization Domains
  getOrganizationDomains(orgId: number): Promise<OrganizationDomain[]>;
  addOrganizationDomain(data: InsertOrganizationDomain): Promise<OrganizationDomain>;
  removeOrganizationDomain(id: number): Promise<void>;
  verifyOrganizationDomain(id: number): Promise<OrganizationDomain>;

  // Platform Admin - Global Operations
  listAllOrganizations(): Promise<(Organization & { memberCount: number; ownerEmail: string | null })[]>;
  deleteOrganizationHard(id: number): Promise<void>;
  listAllUsersWithMemberships(): Promise<(User & { 
    memberships: { organizationId: number; organizationName: string; role: string }[] 
  })[]>;
}

export class DatabaseStorage implements IStorage {
  // --- ORGANIZATIONS ---
  async getOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
  }

  async getOrganizationsByUserId(userId: string): Promise<Organization[]> {
    // Get organizations where the user is a member
    const memberOrgs = await db.select({
      organization: organizations
    })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
      .where(eq(organizationMembers.userId, userId));
    
    return memberOrgs.map(m => m.organization);
  }

  async isUserMemberOfOrg(userId: string, orgId: number): Promise<boolean> {
    const member = await this.getMemberByUserId(userId, orgId);
    return !!member;
  }

  async getOrganization(id: number): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [newOrg] = await db.insert(organizations).values(org).returning();
    return newOrg;
  }

  async updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization> {
    const [updated] = await db.update(organizations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(organizations.id, id))
      .returning();
    return updated;
  }

  // --- USERS ---
  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(ilike(users.email, email));
    return user;
  }

  async createUserByEmail(email: string, firstName?: string, lastName?: string): Promise<User> {
    // Create user with pending status - they can login via password reset or Replit Auth
    const [user] = await db.insert(users).values({
      email: email.toLowerCase(),
      firstName: firstName || null,
      lastName: lastName || null,
      authProvider: 'pending', // User needs to complete setup via password reset or Replit Auth
      emailVerified: false,
    }).returning();
    return user;
  }

  async updateUserName(userId: string, firstName: string, lastName: string | null): Promise<void> {
    await db.update(users).set({
      firstName,
      lastName,
    }).where(eq(users.id, userId));
  }

  // --- MEMBERS ---
  async getOrganizationMembers(orgId: number): Promise<(Member & { user: User })[]> {
    // Join with users table from auth schema
    // Note: Drizzle join syntax might vary depending on setup, using manual join approach or query builder
    const members = await db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, orgId),
      with: {
        user: true // Assuming relation is set up in schema
      }
    });
    return members as (Member & { user: User })[];
  }

  async addMember(member: InsertMember): Promise<Member> {
    const [newMember] = await db.insert(organizationMembers).values(member).returning();
    return newMember;
  }

  async getMemberByUserId(userId: string, orgId: number): Promise<Member | undefined> {
    const [member] = await db.select()
      .from(organizationMembers)
      .where(and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.organizationId, orgId)
      ));
    return member;
  }

  async getMemberById(memberId: number): Promise<Member | undefined> {
    const [member] = await db.select()
      .from(organizationMembers)
      .where(eq(organizationMembers.id, memberId));
    return member;
  }

  async updateMemberRole(memberId: number, role: string): Promise<Member> {
    const [updated] = await db.update(organizationMembers)
      .set({ role })
      .where(eq(organizationMembers.id, memberId))
      .returning();
    return updated;
  }

  async removeMember(memberId: number): Promise<void> {
    await db.delete(organizationMembers).where(eq(organizationMembers.id, memberId));
  }

  // --- PENDING INVITATIONS ---
  async createPendingInvitation(invitation: InsertPendingInvitation): Promise<PendingInvitation> {
    const [newInvitation] = await db.insert(pendingInvitations).values(invitation).returning();
    return newInvitation;
  }

  async getPendingInvitationsByOrg(orgId: number): Promise<(PendingInvitation & { inviter: User })[]> {
    const invitations = await db.query.pendingInvitations.findMany({
      where: and(
        eq(pendingInvitations.organizationId, orgId),
        eq(pendingInvitations.status, 'pending')
      ),
      with: {
        inviter: true
      },
      orderBy: desc(pendingInvitations.invitedAt)
    });
    return invitations as (PendingInvitation & { inviter: User })[];
  }

  async getPendingInvitationById(id: number): Promise<PendingInvitation | undefined> {
    const [invitation] = await db.select().from(pendingInvitations).where(eq(pendingInvitations.id, id));
    return invitation;
  }

  async getPendingInvitationByEmail(orgId: number, email: string): Promise<PendingInvitation | undefined> {
    const [invitation] = await db.select()
      .from(pendingInvitations)
      .where(and(
        eq(pendingInvitations.organizationId, orgId),
        ilike(pendingInvitations.email, email),
        eq(pendingInvitations.status, 'pending')
      ));
    return invitation;
  }

  async cancelPendingInvitation(id: number): Promise<void> {
    await db.update(pendingInvitations)
      .set({ status: 'revoked', respondedAt: new Date() })
      .where(eq(pendingInvitations.id, id));
  }

  async getPendingInvitationsByEmail(email: string): Promise<PendingInvitation[]> {
    return await db.select()
      .from(pendingInvitations)
      .where(and(
        ilike(pendingInvitations.email, email),
        eq(pendingInvitations.status, 'pending')
      ));
  }

  async acceptPendingInvitation(id: number): Promise<void> {
    await db.update(pendingInvitations)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(pendingInvitations.id, id));
  }

  // --- SURVEYS ---
  async getSurveys(orgId: number): Promise<Survey[]> {
    return await db.select().from(surveys).where(and(eq(surveys.organizationId, orgId), sql`${surveys.deletedAt} IS NULL`)).orderBy(desc(surveys.createdAt));
  }

  async getTrashedSurveys(orgId: number): Promise<Survey[]> {
    return await db.select().from(surveys).where(and(eq(surveys.organizationId, orgId), sql`${surveys.deletedAt} IS NOT NULL`)).orderBy(desc(surveys.deletedAt));
  }

  async softDeleteSurvey(id: number, deletedBy: string): Promise<Survey> {
    const [updated] = await db.update(surveys)
      .set({ deletedAt: new Date(), deletedBy })
      .where(eq(surveys.id, id))
      .returning();
    return updated;
  }

  async restoreSurvey(id: number): Promise<Survey> {
    const [updated] = await db.update(surveys)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(surveys.id, id))
      .returning();
    return updated;
  }

  async permanentlyDeleteSurvey(id: number): Promise<void> {
    // Delete in order of dependencies
    // 1. Delete answers (via responses)
    const surveyResponses = await db.select({ id: responses.id }).from(responses).where(eq(responses.surveyId, id));
    const responseIds = surveyResponses.map(r => r.id);
    if (responseIds.length > 0) {
      await db.delete(answers).where(sql`${answers.responseId} IN (${sql.join(responseIds, sql`, `)})`);
    }
    // 2. Delete responses
    await db.delete(responses).where(eq(responses.surveyId, id));
    // 3. Delete questions
    await db.delete(questions).where(eq(questions.surveyId, id));
    // 4. Delete survey assignments
    await db.delete(surveyAssignments).where(eq(surveyAssignments.surveyId, id));
    // 5. Delete survey coordinators
    await db.delete(surveyCoordinators).where(eq(surveyCoordinators.surveyId, id));
    // 6. Finally delete the survey
    await db.delete(surveys).where(eq(surveys.id, id));
  }

  async duplicateSurvey(id: number, newTitle: string, userId: string): Promise<Survey> {
    // Get the original survey with questions
    const original = await this.getSurvey(id);
    if (!original) throw new Error("Survey not found");

    // Create a copy of the survey
    const [newSurvey] = await db.insert(surveys).values({
      organizationId: original.organizationId,
      title: newTitle,
      description: original.description,
      type: original.type,
      status: "draft",
      location: original.location,
      targetSample: original.targetSample,
      marginOfError: original.marginOfError,
      quotas: original.quotas,
    }).returning();

    // Duplicate questions
    for (const question of original.questions) {
      await db.insert(questions).values({
        surveyId: newSurvey.id,
        text: question.text,
        type: question.type,
        options: question.options,
        order: question.order,
        required: question.required,
        logic: question.logic,
      });
    }

    return newSurvey;
  }

  async getSurvey(id: number): Promise<(Survey & { questions: Question[] }) | undefined> {
    const survey = await db.query.surveys.findFirst({
      where: eq(surveys.id, id),
      with: {
        questions: {
          orderBy: (questions, { asc }) => [asc(questions.order)],
        }
      }
    });
    return survey;
  }

  async createSurvey(survey: InsertSurvey): Promise<Survey> {
    const [newSurvey] = await db.insert(surveys).values(survey).returning();
    return newSurvey;
  }

  async updateSurvey(id: number, surveyData: Partial<InsertSurvey>): Promise<Survey> {
    const [updated] = await db.update(surveys)
      .set({ ...surveyData, updatedAt: new Date() })
      .where(eq(surveys.id, id))
      .returning();
    return updated;
  }

  // --- QUESTIONS ---
  async getQuestion(id: number): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question;
  }

  async createQuestion(question: InsertQuestion): Promise<Question> {
    const [newQuestion] = await db.insert(questions).values(question).returning();
    return newQuestion;
  }

  async updateQuestion(id: number, questionData: Partial<InsertQuestion>): Promise<Question> {
    const [updated] = await db.update(questions)
      .set(questionData)
      .where(eq(questions.id, id))
      .returning();
    return updated;
  }

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
  }

  // --- RESPONSES ---
  async createResponse(responseData: InsertResponse & { status?: string; flagReason?: string | null }, answersData: Omit<InsertAnswer, 'responseId'>[]): Promise<Response> {
    return await db.transaction(async (tx) => {
      // 1. Create Response Header
      const [response] = await tx.insert(responses).values(responseData).returning();
      
      // 2. Create Answers
      if (answersData.length > 0) {
        const answersWithId = answersData.map(a => ({ ...a, responseId: response.id }));
        await tx.insert(answers).values(answersWithId);
      }
      
      return response;
    });
  }

  async getResponses(surveyId: number): Promise<Response[]> {
    return await db.select().from(responses)
      .where(eq(responses.surveyId, surveyId))
      .orderBy(desc(responses.createdAt));
  }

  async getResponse(id: number): Promise<(Response & { answers: Answer[] }) | undefined> {
    const response = await db.query.responses.findFirst({
      where: eq(responses.id, id),
      with: {
        answers: true
      }
    });
    return response;
  }

  async getResponsesWithAnswers(surveyId: number): Promise<(Response & { answers: Answer[] })[]> {
    const result = await db.query.responses.findMany({
      where: eq(responses.surveyId, surveyId),
      with: {
        answers: true
      },
      orderBy: (responses, { desc }) => [desc(responses.createdAt)]
    });
    return result;
  }

  async updateResponseStatus(id: number, status: string, reviewNote?: string): Promise<Response | undefined> {
    const [updated] = await db.update(responses)
      .set({ status, reviewNote, reviewedAt: new Date() })
      .where(eq(responses.id, id))
      .returning();
    return updated;
  }

  async getResponsesByOrg(orgId: number): Promise<(Response & { survey: { id: number; title: string } })[]> {
    const orgSurveys = await db.select().from(surveys).where(eq(surveys.organizationId, orgId));
    const surveyIds = orgSurveys.map(s => s.id);
    
    if (surveyIds.length === 0) return [];
    
    const allResponses = await db.select().from(responses).where(
      sql`${responses.surveyId} IN (${sql.join(surveyIds.map(id => sql`${id}`), sql`, `)})`
    ).orderBy(desc(responses.createdAt));
    
    const surveyMap = new Map(orgSurveys.map(s => [s.id, { id: s.id, title: s.title }]));
    
    return allResponses.map(r => ({
      ...r,
      survey: surveyMap.get(r.surveyId) || { id: r.surveyId, title: 'Desconhecida' }
    }));
  }

  // --- ANALYTICS ---
  async getSurveyAnalytics(surveyId: number): Promise<any> {
    const allResponses = await db.select().from(responses).where(eq(responses.surveyId, surveyId));
    
    const valid = allResponses.filter(r => r.status === 'valid').length;
    const suspicious = allResponses.filter(r => r.status === 'suspicious').length;
    const avgDuration = allResponses.reduce((acc, r) => acc + (r.duration || 0), 0) / (allResponses.length || 1);

    const locations = allResponses.map(r => ({
      lat: r.latitude,
      lng: r.longitude,
      status: r.status
    }));

    return {
      totalResponses: allResponses.length,
      validResponses: valid,
      suspiciousResponses: suspicious,
      averageDuration: Math.round(avgDuration),
      locations
    };
  }

  async getOrganizationStats(orgId: number): Promise<{
    totalInterviews: number;
    interviewsThisMonth: number;
    activeSurveys: number;
    draftSurveys: number;
  }> {
    const orgSurveys = await db.select().from(surveys).where(eq(surveys.organizationId, orgId));
    const surveyIds = orgSurveys.map(s => s.id);
    
    let allResponses: Response[] = [];
    if (surveyIds.length > 0) {
      allResponses = await db.select().from(responses).where(
        sql`${responses.surveyId} IN (${sql.join(surveyIds.map(id => sql`${id}`), sql`, `)})`
      );
    }
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const interviewsThisMonth = allResponses.filter(r => 
      r.createdAt && new Date(r.createdAt) >= startOfMonth
    ).length;
    
    const activeSurveys = orgSurveys.filter(s => s.status === 'active').length;
    const draftSurveys = orgSurveys.filter(s => s.status === 'draft').length;
    
    return {
      totalInterviews: allResponses.length,
      interviewsThisMonth,
      activeSurveys,
      draftSurveys,
    };
  }

  // --- SURVEY ASSIGNMENTS ---
  async getSurveyAssignments(surveyId: number): Promise<(SurveyAssignment & { interviewer: User })[]> {
    const result = await db.select({
      assignment: surveyAssignments,
      interviewer: users
    })
      .from(surveyAssignments)
      .innerJoin(users, eq(surveyAssignments.interviewerId, users.id))
      .where(eq(surveyAssignments.surveyId, surveyId));
    
    return result.map(r => ({ ...r.assignment, interviewer: r.interviewer }));
  }

  async getAssignedSurveys(interviewerId: string, orgId: number): Promise<Survey[]> {
    const result = await db.select({
      survey: surveys
    })
      .from(surveyAssignments)
      .innerJoin(surveys, eq(surveyAssignments.surveyId, surveys.id))
      .where(and(
        eq(surveyAssignments.interviewerId, interviewerId),
        eq(surveys.organizationId, orgId)
      ));
    
    return result.map(r => r.survey);
  }

  async assignInterviewer(data: InsertSurveyAssignment): Promise<SurveyAssignment> {
    const [assignment] = await db.insert(surveyAssignments).values(data).returning();
    return assignment;
  }

  async unassignInterviewer(surveyId: number, interviewerId: string): Promise<void> {
    await db.delete(surveyAssignments).where(and(
      eq(surveyAssignments.surveyId, surveyId),
      eq(surveyAssignments.interviewerId, interviewerId)
    ));
  }

  async isInterviewerAssigned(surveyId: number, interviewerId: string): Promise<boolean> {
    const [assignment] = await db.select()
      .from(surveyAssignments)
      .where(and(
        eq(surveyAssignments.surveyId, surveyId),
        eq(surveyAssignments.interviewerId, interviewerId)
      ))
      .limit(1);
    return !!assignment;
  }

  // --- SURVEY COORDINATORS ---
  async getSurveyCoordinators(surveyId: number): Promise<(SurveyCoordinator & { coordinator: User })[]> {
    const result = await db.select({
      assignment: surveyCoordinators,
      coordinator: users
    })
      .from(surveyCoordinators)
      .innerJoin(users, eq(surveyCoordinators.coordinatorId, users.id))
      .where(eq(surveyCoordinators.surveyId, surveyId));
    
    return result.map(r => ({ ...r.assignment, coordinator: r.coordinator }));
  }

  async getCoordinatorAssignedSurveys(coordinatorId: string, orgId: number): Promise<Survey[]> {
    const result = await db.select({
      survey: surveys
    })
      .from(surveyCoordinators)
      .innerJoin(surveys, eq(surveyCoordinators.surveyId, surveys.id))
      .where(and(
        eq(surveyCoordinators.coordinatorId, coordinatorId),
        eq(surveys.organizationId, orgId)
      ));
    
    return result.map(r => r.survey);
  }

  async assignCoordinator(data: InsertSurveyCoordinator): Promise<SurveyCoordinator> {
    const [assignment] = await db.insert(surveyCoordinators).values(data).returning();
    return assignment;
  }

  async unassignCoordinator(surveyId: number, coordinatorId: string): Promise<void> {
    await db.delete(surveyCoordinators).where(and(
      eq(surveyCoordinators.surveyId, surveyId),
      eq(surveyCoordinators.coordinatorId, coordinatorId)
    ));
  }

  async isCoordinatorAssigned(surveyId: number, coordinatorId: string): Promise<boolean> {
    const [assignment] = await db.select()
      .from(surveyCoordinators)
      .where(and(
        eq(surveyCoordinators.surveyId, surveyId),
        eq(surveyCoordinators.coordinatorId, coordinatorId)
      ))
      .limit(1);
    return !!assignment;
  }

  // --- INTERVIEWER COMPARISON (Audit) ---
  async getInterviewerComparison(orgId: number, filters: {
    surveyId?: number;
    questionId?: number;
    interviewerIds?: string[];
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    interviewers: Array<{ id: string; name: string; totalResponses: number }>;
    questions: Array<{ id: number; text: string; options: string[] }>;
    comparison: Array<{
      questionId: number;
      questionText: string;
      byInterviewer: Array<{
        interviewerId: string;
        interviewerName: string;
        totalForQuestion: number;
        distribution: Array<{ option: string; count: number; percentage: number }>;
      }>;
      groupAverage: Array<{ option: string; avgPercentage: number }>;
      discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }>;
    }>;
  }> {
    // Get surveys for org
    const orgSurveys = await db.select().from(surveys).where(eq(surveys.organizationId, orgId));
    const orgSurveyIds = new Set(orgSurveys.map(s => s.id));
    
    // Validate surveyId belongs to org if provided
    if (filters.surveyId && !orgSurveyIds.has(filters.surveyId)) {
      return { interviewers: [], questions: [], comparison: [] };
    }
    
    const targetSurveyIds = filters.surveyId 
      ? [filters.surveyId] 
      : orgSurveys.map(s => s.id);
    
    if (targetSurveyIds.length === 0) {
      return { interviewers: [], questions: [], comparison: [] };
    }

    // Get all responses for these surveys with date filters
    let allResponses = await db.select().from(responses).where(
      sql`${responses.surveyId} IN (${sql.join(targetSurveyIds.map(id => sql`${id}`), sql`, `)})`
    );

    // Apply date filters
    if (filters.startDate) {
      allResponses = allResponses.filter(r => r.createdAt && new Date(r.createdAt) >= filters.startDate!);
    }
    if (filters.endDate) {
      allResponses = allResponses.filter(r => r.createdAt && new Date(r.createdAt) <= filters.endDate!);
    }

    // Apply interviewer filter
    if (filters.interviewerIds && filters.interviewerIds.length > 0) {
      allResponses = allResponses.filter(r => filters.interviewerIds!.includes(r.interviewerId));
    }

    // Get unique interviewer IDs
    const interviewerIds = Array.from(new Set(allResponses.map(r => r.interviewerId)));
    if (interviewerIds.length === 0) {
      return { interviewers: [], questions: [], comparison: [] };
    }

    // Get interviewer details
    const interviewerUsers = await db.select().from(users).where(
      sql`${users.id} IN (${sql.join(interviewerIds.map(id => sql`${id}`), sql`, `)})`
    );
    const interviewerMap = new Map(interviewerUsers.map(u => [u.id, u]));

    // Get questions for these surveys
    let surveyQuestions = await db.select().from(questions).where(
      sql`${questions.surveyId} IN (${sql.join(targetSurveyIds.map(id => sql`${id}`), sql`, `)})`
    );
    
    // Filter to specific question if provided
    if (filters.questionId) {
      surveyQuestions = surveyQuestions.filter(q => q.id === filters.questionId);
    }

    // Get all answers for responses
    const responseIds = allResponses.map(r => r.id);
    if (responseIds.length === 0) {
      return { interviewers: [], questions: [], comparison: [] };
    }

    const allAnswers = await db.select().from(answers).where(
      sql`${answers.responseId} IN (${sql.join(responseIds.map(id => sql`${id}`), sql`, `)})`
    );

    // Map response to interviewer
    const responseToInterviewer = new Map(allResponses.map(r => [r.id, r.interviewerId]));

    // Build comparison data
    const comparisonData: Array<{
      questionId: number;
      questionText: string;
      byInterviewer: Array<{
        interviewerId: string;
        interviewerName: string;
        totalForQuestion: number;
        distribution: Array<{ option: string; count: number; percentage: number }>;
      }>;
      groupAverage: Array<{ option: string; avgPercentage: number }>;
      discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }>;
    }> = [];

    for (const q of surveyQuestions) {
      const qAnswers = allAnswers.filter(a => a.questionId === q.id);
      const rawOptions = q.options as any[] || [];
      const options = rawOptions.map(opt => typeof opt === 'string' ? opt : opt?.text || '');
      
      const byInterviewer: Array<{
        interviewerId: string;
        interviewerName: string;
        totalForQuestion: number;
        distribution: Array<{ option: string; count: number; percentage: number }>;
      }> = [];

      for (const intId of interviewerIds) {
        const user = interviewerMap.get(intId);
        const name = user?.firstName && user?.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user?.email || intId;

        const intAnswers = qAnswers.filter(a => responseToInterviewer.get(a.responseId) === intId);
        const total = intAnswers.length;

        const distribution = options.map(opt => {
          const count = intAnswers.filter(a => {
            const val = a.value;
            return val === opt || (Array.isArray(val) && val.includes(opt));
          }).length;
          return { option: opt, count, percentage: total > 0 ? (count / total) * 100 : 0 };
        });

        byInterviewer.push({ interviewerId: intId, interviewerName: name, totalForQuestion: total, distribution });
      }

      // Calculate group average
      const groupAverage = options.map(opt => {
        const percentages = byInterviewer.filter(i => i.totalForQuestion > 0).map(i => 
          i.distribution.find(d => d.option === opt)?.percentage || 0
        );
        const avg = percentages.length > 0 ? percentages.reduce((a, b) => a + b, 0) / percentages.length : 0;
        return { option: opt, avgPercentage: avg };
      });

      // Find discrepancies (deviation > 15%)
      const discrepancies: Array<{ interviewerId: string; interviewerName: string; option: string; deviation: number }> = [];
      for (const int of byInterviewer) {
        if (int.totalForQuestion === 0) continue;
        for (const dist of int.distribution) {
          const avg = groupAverage.find(g => g.option === dist.option)?.avgPercentage || 0;
          const deviation = Math.abs(dist.percentage - avg);
          if (deviation > 15) {
            discrepancies.push({ 
              interviewerId: int.interviewerId, 
              interviewerName: int.interviewerName,
              option: dist.option, 
              deviation 
            });
          }
        }
      }

      comparisonData.push({
        questionId: q.id,
        questionText: q.text,
        byInterviewer,
        groupAverage,
        discrepancies
      });
    }

    // Build interviewers summary
    const interviewersSummary = interviewerIds.map(id => {
      const user = interviewerMap.get(id);
      const name = user?.firstName && user?.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user?.email || id;
      const total = allResponses.filter(r => r.interviewerId === id).length;
      return { id, name, totalResponses: total };
    });

    // Build questions summary
    const questionsSummary = surveyQuestions.map(q => {
      const rawOptions = q.options as any[] || [];
      const textOptions = rawOptions.map(opt => typeof opt === 'string' ? opt : opt?.text || '');
      return {
        id: q.id,
        text: q.text,
        options: textOptions
      };
    });

    return {
      interviewers: interviewersSummary,
      questions: questionsSummary,
      comparison: comparisonData
    };
  }

  // --- RESULTS DASHBOARD (Aggregated Data) ---
  async getSurveyAggregatedResults(surveyId: number, filters?: {
    interviewerId?: string;
    neighborhood?: string;
    ageRange?: string;
    gender?: string;
    education?: string;
  }): Promise<{
    survey: Survey & { questions: Question[] };
    totalResponses: number;
    validResponses: number;
    collectionPeriod?: { start: string; end: string };
    questionResults: Array<{
      questionId: number;
      questionText: string;
      questionType: string;
      showOptionImages?: boolean;
      results: Array<{ option: string; count: number; percentage: number; imageUrl?: string }>;
    }>;
    filterFacets?: {
      questionId: number;
      questionText: string;
      filterKey: string;
      options: string[];
    }[];
  }> {
    const survey = await this.getSurvey(surveyId);
    if (!survey) throw new Error("Pesquisa não encontrada");

    let allResponses = await db.select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId))
      .orderBy(responses.createdAt);
    
    // Apply interviewerId filter
    if (filters?.interviewerId) {
      allResponses = allResponses.filter(r => r.interviewerId === filters.interviewerId);
    }
    
    let validResponses = allResponses.filter(r => r.status === 'valid');
    let validResponseIds = validResponses.map(r => r.id);
    
    // Calculate collection period from actual responses
    let collectionPeriod: { start: string; end: string } | undefined;
    if (allResponses.length > 0) {
      const dates = allResponses.map(r => r.createdAt).filter(Boolean) as Date[];
      if (dates.length > 0) {
        const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
        collectionPeriod = {
          start: sorted[0].toISOString(),
          end: sorted[sorted.length - 1].toISOString()
        };
      }
    }

    // Build option image maps for questions with showOptionImages
    const optionImageMaps: Map<number, Map<string, string>> = new Map();
    for (const question of survey.questions) {
      if (question.showOptionImages) {
        const rawOptions = (question.options as (string | { text: string; imageUrl?: string })[]) || [];
        const imageMap = new Map<string, string>();
        rawOptions.forEach(opt => {
          if (typeof opt === 'object' && opt?.text && opt?.imageUrl) {
            imageMap.set(opt.text, opt.imageUrl);
          }
        });
        optionImageMaps.set(question.id, imageMap);
      }
    }

    // Identify demographic/filter questions based on common patterns
    const demographicKeywords: Record<string, string[]> = {
      neighborhood: ['bairro', 'zona', 'região', 'regiao', 'localidade', 'setor'],
      ageRange: ['idade', 'faixa etária', 'faixa etaria'],
      gender: ['sexo', 'gênero', 'genero'],
      education: ['escolaridade', 'instrução', 'instrucao', 'ensino', 'formação', 'formacao']
    };

    const filterFacets: Array<{
      questionId: number;
      questionText: string;
      filterKey: string;
      options: string[];
    }> = [];

    // Get actual answer values for demographic questions to build filter options
    for (const question of survey.questions) {
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        const questionLower = question.text.toLowerCase();
        let filterKey: string | null = null;

        for (const [key, keywords] of Object.entries(demographicKeywords)) {
          if (keywords.some(kw => questionLower.includes(kw))) {
            filterKey = key;
            break;
          }
        }

        if (filterKey && validResponseIds.length > 0) {
          // Get unique answer values for this question
          const questionAnswers = await db.select({ value: answers.value })
            .from(answers)
            .where(and(
              eq(answers.questionId, question.id),
              sql`${answers.responseId} IN (${sql.join(validResponseIds.map(id => sql`${id}`), sql`, `)})`
            ));

          const uniqueValues = new Set<string>();
          questionAnswers.forEach(ans => {
            const value = ans.value as string | string[];
            if (Array.isArray(value)) {
              value.forEach(v => uniqueValues.add(v));
            } else if (typeof value === 'string') {
              uniqueValues.add(value);
            }
          });

          if (uniqueValues.size > 0) {
            filterFacets.push({
              questionId: question.id,
              questionText: question.text,
              filterKey,
              options: Array.from(uniqueValues).sort()
            });
          }
        }
      }
    }

    const questionResults: Array<{
      questionId: number;
      questionText: string;
      questionType: string;
      showOptionImages?: boolean;
      results: Array<{ option: string; count: number; percentage: number; imageUrl?: string }>;
    }> = [];

    for (const question of survey.questions) {
      if (question.type === 'single_choice' || question.type === 'multiple_choice') {
        const rawOptions = (question.options as (string | { text: string; imageUrl?: string })[]) || [];
        // Normalize options - extract text if it's an object
        const options = rawOptions.map(opt => typeof opt === 'string' ? opt : opt?.text || '').filter(Boolean);
        const optionCounts: Record<string, number> = {};
        options.forEach(opt => { optionCounts[opt] = 0; });

        if (validResponseIds.length > 0) {
          const questionAnswers = await db.select()
            .from(answers)
            .where(and(
              eq(answers.questionId, question.id),
              sql`${answers.responseId} IN (${sql.join(validResponseIds.map(id => sql`${id}`), sql`, `)})`
            ));

          questionAnswers.forEach(ans => {
            const value = ans.value as string | string[];
            if (Array.isArray(value)) {
              value.forEach(v => {
                if (optionCounts[v] !== undefined) optionCounts[v]++;
              });
            } else if (typeof value === 'string' && optionCounts[value] !== undefined) {
              optionCounts[value]++;
            }
          });
        }

        const total = Object.values(optionCounts).reduce((a, b) => a + b, 0);
        const imageMap = optionImageMaps.get(question.id);
        const results = options.map(opt => ({
          option: opt,
          count: optionCounts[opt] || 0,
          percentage: total > 0 ? Math.round((optionCounts[opt] / total) * 1000) / 10 : 0,
          imageUrl: imageMap?.get(opt)
        }));

        questionResults.push({
          questionId: question.id,
          questionText: question.text,
          questionType: question.type,
          showOptionImages: question.showOptionImages ?? false,
          results
        });
      }
    }

    return {
      survey,
      totalResponses: allResponses.length,
      validResponses: validResponses.length,
      collectionPeriod,
      questionResults,
      filterFacets
    };
  }

  async getSurveyInterviewers(surveyId: number): Promise<Array<{ id: string; name: string }>> {
    const allResponses = await db.select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId));
    
    const interviewerIds = Array.from(new Set(allResponses.map(r => r.interviewerId).filter(Boolean)));
    
    const interviewersList: Array<{ id: string; name: string }> = [];
    for (const id of interviewerIds) {
      if (!id) continue;
      const user = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (user.length > 0) {
        interviewersList.push({
          id,
          name: user[0].firstName && user[0].lastName 
            ? `${user[0].firstName} ${user[0].lastName}`
            : user[0].firstName || user[0].email || id
        });
      }
    }
    
    return interviewersList;
  }

  async getSurveyTimeline(surveyId: number): Promise<Array<{
    date: string;
    total: number;
    questionSnapshots: Array<{
      questionId: number;
      results: Array<{ option: string; count: number; percentage: number }>;
    }>;
  }>> {
    const survey = await this.getSurvey(surveyId);
    if (!survey) throw new Error("Pesquisa não encontrada");

    const allResponses = await db.select()
      .from(responses)
      .where(eq(responses.surveyId, surveyId))
      .orderBy(responses.createdAt);
    
    const validResponses = allResponses.filter(r => r.status === 'valid');
    
    // Group by date
    const dateGroups: Map<string, Response[]> = new Map();
    validResponses.forEach(r => {
      const date = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : 'unknown';
      if (!dateGroups.has(date)) dateGroups.set(date, []);
      dateGroups.get(date)!.push(r);
    });

    const timeline: Array<{
      date: string;
      total: number;
      questionSnapshots: Array<{
        questionId: number;
        results: Array<{ option: string; count: number; percentage: number }>;
      }>;
    }> = [];

    const sortedDates = Array.from(dateGroups.keys()).sort();
    let cumulativeResponseIds: number[] = [];

    for (const date of sortedDates) {
      const dayResponses = dateGroups.get(date)!;
      cumulativeResponseIds = [...cumulativeResponseIds, ...dayResponses.map(r => r.id)];

      const questionSnapshots: Array<{
        questionId: number;
        results: Array<{ option: string; count: number; percentage: number }>;
      }> = [];

      for (const question of survey.questions) {
        if (question.type === 'single_choice' || question.type === 'multiple_choice') {
          const rawOptions = (question.options as (string | { text: string })[]) || [];
          // Normalize options - extract text if it's an object
          const options = rawOptions.map(opt => typeof opt === 'string' ? opt : opt?.text || '').filter(Boolean);
          const optionCounts: Record<string, number> = {};
          options.forEach(opt => { optionCounts[opt] = 0; });

          if (cumulativeResponseIds.length > 0) {
            const questionAnswers = await db.select()
              .from(answers)
              .where(and(
                eq(answers.questionId, question.id),
                sql`${answers.responseId} IN (${sql.join(cumulativeResponseIds.map(id => sql`${id}`), sql`, `)})`
              ));

            questionAnswers.forEach(ans => {
              const value = ans.value as string | string[];
              if (Array.isArray(value)) {
                value.forEach(v => {
                  if (optionCounts[v] !== undefined) optionCounts[v]++;
                });
              } else if (typeof value === 'string' && optionCounts[value] !== undefined) {
                optionCounts[value]++;
              }
            });
          }

          const total = Object.values(optionCounts).reduce((a, b) => a + b, 0);
          const results = options.map(opt => ({
            option: opt,
            count: optionCounts[opt] || 0,
            percentage: total > 0 ? Math.round((optionCounts[opt] / total) * 1000) / 10 : 0
          }));

          questionSnapshots.push({ questionId: question.id, results });
        }
      }

      timeline.push({
        date,
        total: cumulativeResponseIds.length,
        questionSnapshots
      });
    }

    return timeline;
  }

  // --- PERMISSION OVERRIDES ---
  async getMemberPermissionOverrides(memberId: number): Promise<MemberPermissionOverride[]> {
    return await db.select()
      .from(memberPermissionOverrides)
      .where(eq(memberPermissionOverrides.memberId, memberId));
  }

  async getOrgPermissionOverrides(orgId: number): Promise<(MemberPermissionOverride & { member: Member & { user: User } })[]> {
    const results = await db.select({
      override: memberPermissionOverrides,
      member: organizationMembers,
      user: users
    })
      .from(memberPermissionOverrides)
      .innerJoin(organizationMembers, eq(memberPermissionOverrides.memberId, organizationMembers.id))
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(eq(organizationMembers.organizationId, orgId));

    return results.map(r => ({
      ...r.override,
      member: { ...r.member, user: r.user }
    }));
  }

  async addPermissionOverride(data: InsertMemberPermissionOverride): Promise<MemberPermissionOverride> {
    const [override] = await db.insert(memberPermissionOverrides)
      .values(data)
      .returning();
    return override;
  }

  async removePermissionOverride(id: number): Promise<void> {
    await db.delete(memberPermissionOverrides)
      .where(eq(memberPermissionOverrides.id, id));
  }

  async hasEffectivePermission(memberId: number, baseRole: string, permission: string): Promise<boolean> {
    const overrides = await this.getMemberPermissionOverrides(memberId);
    const specificOverride = overrides.find(o => o.permission === permission);
    
    if (specificOverride) {
      if (specificOverride.expiresAt && new Date(specificOverride.expiresAt) < new Date()) {
        return false;
      }
      return specificOverride.allowed;
    }
    
    const { hasPermission } = await import("@shared/rbac");
    return hasPermission(baseRole as any, permission as any);
  }

  // --- ACCESS AUDIT LOG ---
  async logAccess(data: InsertAccessAuditLog): Promise<AccessAuditLog> {
    const [log] = await db.insert(accessAuditLog)
      .values(data)
      .returning();
    return log;
  }

  async getAccessLogs(orgId: number, limit: number = 100): Promise<(AccessAuditLog & { user: User })[]> {
    const results = await db.select({
      log: accessAuditLog,
      user: users
    })
      .from(accessAuditLog)
      .innerJoin(users, eq(accessAuditLog.userId, users.id))
      .where(eq(accessAuditLog.organizationId, orgId))
      .orderBy(desc(accessAuditLog.createdAt))
      .limit(limit);

    return results.map(r => ({ ...r.log, user: r.user }));
  }

  // --- QUESTION MODULES ---
  async getQuestionModules(orgId: number): Promise<QuestionModule[]> {
    return await db.select()
      .from(questionModules)
      .where(eq(questionModules.organizationId, orgId))
      .orderBy(desc(questionModules.createdAt));
  }

  async getQuestionModule(id: number): Promise<QuestionModule | undefined> {
    const [module] = await db.select()
      .from(questionModules)
      .where(eq(questionModules.id, id));
    return module;
  }

  async createQuestionModule(data: InsertQuestionModule): Promise<QuestionModule> {
    const [module] = await db.insert(questionModules)
      .values(data)
      .returning();
    return module;
  }

  async updateQuestionModule(id: number, data: Partial<InsertQuestionModule>): Promise<QuestionModule> {
    const [module] = await db.update(questionModules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(questionModules.id, id))
      .returning();
    return module;
  }

  async deleteQuestionModule(id: number): Promise<void> {
    await db.delete(questionModules)
      .where(eq(questionModules.id, id));
  }

  // --- ORGANIZATION DOMAINS ---
  async getOrganizationDomains(orgId: number): Promise<OrganizationDomain[]> {
    return await db.select()
      .from(organizationDomains)
      .where(eq(organizationDomains.organizationId, orgId))
      .orderBy(desc(organizationDomains.createdAt));
  }

  async addOrganizationDomain(data: InsertOrganizationDomain): Promise<OrganizationDomain> {
    const verificationToken = crypto.randomUUID();
    const [domain] = await db.insert(organizationDomains)
      .values({ ...data, verificationToken })
      .returning();
    return domain;
  }

  async removeOrganizationDomain(id: number): Promise<void> {
    await db.delete(organizationDomains)
      .where(eq(organizationDomains.id, id));
  }

  async verifyOrganizationDomain(id: number): Promise<OrganizationDomain> {
    const [domain] = await db.update(organizationDomains)
      .set({ 
        dnsStatus: 'verified',
        sslStatus: 'active',
        verifiedAt: new Date()
      })
      .where(eq(organizationDomains.id, id))
      .returning();
    return domain;
  }

  // --- SUBSCRIPTION PLANS ---
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    return await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.isActive, true))
      .orderBy(subscriptionPlans.displayOrder);
  }

  async getSubscriptionPlan(id: string): Promise<SubscriptionPlan | undefined> {
    const [plan] = await db.select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id));
    return plan;
  }

  async updateSubscriptionPlan(id: string, data: Partial<SubscriptionPlan>): Promise<SubscriptionPlan> {
    const [plan] = await db.update(subscriptionPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id))
      .returning();
    return plan;
  }

  // --- SUPERVISOR DASHBOARD ---
  async getSupervisorOverview(orgId: number): Promise<{
    interviewers: Array<{
      userId: string;
      name: string;
      email: string | null;
      profileImageUrl: string | null;
      lastLocation: { lat: number | null; lng: number | null } | null;
      lastActivity: Date | null;
      currentSurvey: { id: number; title: string } | null;
      interviewsToday: number;
      interviewsTotal: number;
      status: 'active' | 'idle' | 'offline';
    }>;
    totalInterviewsToday: number;
    activeInterviewers: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const idleThreshold = 30 * 60 * 1000; // 30 minutes
    const offlineThreshold = 2 * 60 * 60 * 1000; // 2 hours
    
    // Get all interviewers in the organization
    const members = await db.select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      user: users
    })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .where(and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.role, 'interviewer')
      ));
    
    // Get all surveys for this org
    const orgSurveys = await db.select().from(surveys).where(eq(surveys.organizationId, orgId));
    const surveyIds = orgSurveys.map(s => s.id);
    const surveyMap = new Map(orgSurveys.map(s => [s.id, { id: s.id, title: s.title }]));
    
    // Get all responses for org surveys
    let allResponses: Response[] = [];
    if (surveyIds.length > 0) {
      allResponses = await db.select().from(responses).where(
        sql`${responses.surveyId} IN (${sql.join(surveyIds.map(id => sql`${id}`), sql`, `)})`
      );
    }
    
    const interviewerData = members.map(m => {
      const userResponses = allResponses.filter(r => r.interviewerId === m.userId);
      const responsesToday = userResponses.filter(r => 
        r.createdAt && new Date(r.createdAt) >= todayStart
      );
      
      // Get last response with location
      const lastResponse = userResponses.sort((a, b) => 
        (new Date(b.createdAt!).getTime()) - (new Date(a.createdAt!).getTime())
      )[0];
      
      const lastActivity = lastResponse?.createdAt ? new Date(lastResponse.createdAt) : null;
      const timeSinceActivity = lastActivity ? now.getTime() - lastActivity.getTime() : Infinity;
      
      let status: 'active' | 'idle' | 'offline' = 'offline';
      if (timeSinceActivity < idleThreshold) {
        status = 'active';
      } else if (timeSinceActivity < offlineThreshold) {
        status = 'idle';
      }
      
      return {
        userId: m.userId,
        name: `${m.user.firstName || ''} ${m.user.lastName || ''}`.trim() || m.user.email || 'Sem nome',
        email: m.user.email,
        profileImageUrl: m.user.profileImageUrl,
        lastLocation: lastResponse?.latitude && lastResponse?.longitude 
          ? { lat: lastResponse.latitude, lng: lastResponse.longitude }
          : null,
        lastActivity,
        currentSurvey: lastResponse ? surveyMap.get(lastResponse.surveyId) || null : null,
        interviewsToday: responsesToday.length,
        interviewsTotal: userResponses.length,
        status
      };
    });
    
    return {
      interviewers: interviewerData,
      totalInterviewsToday: allResponses.filter(r => 
        r.createdAt && new Date(r.createdAt) >= todayStart
      ).length,
      activeInterviewers: interviewerData.filter(i => i.status === 'active').length
    };
  }

  // --- PLATFORM ADMIN - GLOBAL OPERATIONS ---
  async listAllOrganizations(): Promise<(Organization & { memberCount: number; ownerEmail: string | null })[]> {
    const orgs = await db.select().from(organizations).orderBy(desc(organizations.createdAt));
    
    const result = await Promise.all(orgs.map(async (org) => {
      const memberCountResult = await db.select({ count: sql<number>`count(*)` })
        .from(organizationMembers)
        .where(eq(organizationMembers.organizationId, org.id));
      
      const ownerMember = await db.select({ email: users.email })
        .from(organizationMembers)
        .innerJoin(users, eq(organizationMembers.userId, users.id))
        .where(and(
          eq(organizationMembers.organizationId, org.id),
          eq(organizationMembers.role, 'owner')
        ))
        .limit(1);
      
      return {
        ...org,
        memberCount: Number(memberCountResult[0]?.count || 0),
        ownerEmail: ownerMember[0]?.email || null
      };
    }));
    
    return result;
  }

  async deleteOrganizationHard(id: number): Promise<void> {
    // Delete in order: responses/answers -> surveys -> members -> invitations -> domains -> organization
    
    // Get all surveys for the org
    const orgSurveys = await db.select({ id: surveys.id }).from(surveys).where(eq(surveys.organizationId, id));
    const surveyIds = orgSurveys.map(s => s.id);
    
    if (surveyIds.length > 0) {
      // Delete answers for responses
      for (const surveyId of surveyIds) {
        const surveyResponses = await db.select({ id: responses.id }).from(responses).where(eq(responses.surveyId, surveyId));
        for (const resp of surveyResponses) {
          await db.delete(answers).where(eq(answers.responseId, resp.id));
        }
        await db.delete(responses).where(eq(responses.surveyId, surveyId));
      }
      
      // Delete questions, survey assignments, coordinators
      for (const surveyId of surveyIds) {
        await db.delete(questions).where(eq(questions.surveyId, surveyId));
        await db.delete(surveyAssignments).where(eq(surveyAssignments.surveyId, surveyId));
        await db.delete(surveyCoordinators).where(eq(surveyCoordinators.surveyId, surveyId));
      }
      
      // Delete surveys
      await db.delete(surveys).where(eq(surveys.organizationId, id));
    }
    
    // Delete permission overrides for members
    const orgMemberIds = await db.select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, id));
    
    for (const member of orgMemberIds) {
      await db.delete(memberPermissionOverrides).where(eq(memberPermissionOverrides.memberId, member.id));
    }
    
    // Delete members
    await db.delete(organizationMembers).where(eq(organizationMembers.organizationId, id));
    
    // Delete pending invitations
    await db.delete(pendingInvitations).where(eq(pendingInvitations.organizationId, id));
    
    // Delete domains
    await db.delete(organizationDomains).where(eq(organizationDomains.organizationId, id));
    
    // Delete question modules
    await db.delete(questionModules).where(eq(questionModules.organizationId, id));
    
    // Delete access audit log
    await db.delete(accessAuditLog).where(eq(accessAuditLog.organizationId, id));
    
    // Finally, delete the organization
    await db.delete(organizations).where(eq(organizations.id, id));
  }

  async listAllUsersWithMemberships(): Promise<(User & { 
    memberships: { organizationId: number; organizationName: string; role: string }[] 
  })[]> {
    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));
    
    const result = await Promise.all(allUsers.map(async (user) => {
      const memberships = await db.select({
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        role: organizationMembers.role
      })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
        .where(eq(organizationMembers.userId, user.id));
      
      return {
        ...user,
        memberships
      };
    }));
    
    return result;
  }
}

export const storage = new DatabaseStorage();
