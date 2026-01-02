import { 
  users, User, UpsertUser,
  organizations, Organization, InsertOrganization,
  organizationMembers, Member, InsertMember,
  surveys, Survey, InsertSurvey,
  questions, Question, InsertQuestion,
  responses, Response, InsertResponse,
  answers, Answer, InsertAnswer
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql } from "drizzle-orm";

export interface IStorage {
  // Organizations
  getOrganizations(): Promise<Organization[]>;
  getOrganization(id: number): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganization(id: number, data: Partial<InsertOrganization>): Promise<Organization>;
  
  // Users
  getUserByEmail(email: string): Promise<User | undefined>;

  // Members
  getOrganizationMembers(orgId: number): Promise<(Member & { user: User })[]>;
  addMember(member: InsertMember): Promise<Member>;
  getMemberByUserId(userId: string, orgId: number): Promise<Member | undefined>;
  getMemberById(memberId: number): Promise<Member | undefined>;
  updateMemberRole(memberId: number, role: string): Promise<Member>;
  removeMember(memberId: number): Promise<void>;

  // Surveys
  getSurveys(orgId: number): Promise<Survey[]>;
  getSurvey(id: number): Promise<(Survey & { questions: Question[] }) | undefined>;
  createSurvey(survey: InsertSurvey): Promise<Survey>;
  updateSurvey(id: number, survey: Partial<InsertSurvey>): Promise<Survey>;

  // Questions
  createQuestion(question: InsertQuestion): Promise<Question>;
  updateQuestion(id: number, question: Partial<InsertQuestion>): Promise<Question>;
  deleteQuestion(id: number): Promise<void>;

  // Responses
  createResponse(response: InsertResponse, answers: InsertAnswer[]): Promise<Response>;
  getResponses(surveyId: number): Promise<Response[]>;
  getResponse(id: number): Promise<(Response & { answers: Answer[] }) | undefined>;
  
  // Analytics
  getSurveyAnalytics(surveyId: number): Promise<any>;
  getOrganizationStats(orgId: number): Promise<{
    totalInterviews: number;
    interviewsThisMonth: number;
    activeSurveys: number;
    draftSurveys: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // --- ORGANIZATIONS ---
  async getOrganizations(): Promise<Organization[]> {
    return await db.select().from(organizations);
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
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
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

  // --- SURVEYS ---
  async getSurveys(orgId: number): Promise<Survey[]> {
    return await db.select().from(surveys).where(eq(surveys.organizationId, orgId)).orderBy(desc(surveys.createdAt));
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
  async createResponse(responseData: InsertResponse & { status?: string; flagReason?: string | null }, answersData: InsertAnswer[]): Promise<Response> {
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
}

export const storage = new DatabaseStorage();
