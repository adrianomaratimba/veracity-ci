import { db } from "../db";
import { responses, surveys, users, dailyDistanceSummary, surveyAssignments } from "@shared/schema";
import { eq, and, sql, gte, lte, inArray, isNull, or } from "drizzle-orm";
import { calculateHaversineDistance } from "./distance-calculator";

export interface InterviewerMetrics {
  interviewerId: string;
  interviewerName: string;
  surveysParticipated: number;
  totalInterviews: number;
  totalTimeMinutes: number;
  totalDistanceMeters: number;
  caloriesBurned: number;
  avgInterviewDuration: number;
  efficiency: number;
  validRate: number;
}

export interface InterviewerSurveyOption {
  surveyId: number;
  title: string;
  startDate: Date | null;
  endDate: Date | null;
  status: string;
  interviewCount: number;
}

export interface IndividualMetrics {
  name: string;
  surveysCompleted: number;
  totalInterviews: number;
  totalTimeMinutes: number;
  totalDistanceMeters: number;
  caloriesBurned: number;
  currentSurvey: InterviewerSurveyOption | null;
  participatedSurveys: InterviewerSurveyOption[];
}

const CALORIES_PER_MINUTE_WALKING = 3.5;
const CALORIES_PER_METER_WALKING = 0.00004 * 70;

function calculateCalories(timeMinutes: number, distanceMeters: number): number {
  const timeCalories = timeMinutes * CALORIES_PER_MINUTE_WALKING;
  const distanceCalories = distanceMeters * CALORIES_PER_METER_WALKING;
  return Math.round((timeCalories + distanceCalories) / 2);
}

export async function getInterviewerSurveyOptions(
  interviewerId: string,
  orgId: number
): Promise<InterviewerSurveyOption[]> {
  const participatedSurveys = await db.select({
    surveyId: responses.surveyId,
    title: surveys.title,
    startDate: surveys.startDate,
    endDate: surveys.endDate,
    status: surveys.status,
    interviewCount: sql<number>`COUNT(${responses.id})::int`
  })
    .from(responses)
    .innerJoin(surveys, eq(responses.surveyId, surveys.id))
    .where(and(
      eq(responses.interviewerId, interviewerId),
      eq(surveys.organizationId, orgId),
      isNull(surveys.deletedAt)
    ))
    .groupBy(responses.surveyId, surveys.id)
    .orderBy(sql`${surveys.startDate} DESC NULLS LAST`);

  return participatedSurveys;
}

export async function getIndividualInterviewerMetrics(
  interviewerId: string,
  orgId: number,
  surveyId?: number | null
): Promise<IndividualMetrics> {
  const user = await db.select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, interviewerId))
    .limit(1);

  const name = user.length > 0 
    ? `${user[0].firstName || ''} ${user[0].lastName || ''}`.trim() || 'Entrevistador'
    : 'Entrevistador';

  const surveyOptions = await getInterviewerSurveyOptions(interviewerId, orgId);

  const currentSurvey = surveyOptions.find(s => s.status === 'active') || null;
  const completedSurveys = surveyOptions.filter(s => s.status === 'completed' || s.status === 'archived');

  let whereConditions = and(
    eq(responses.interviewerId, interviewerId)
  );

  if (surveyId) {
    whereConditions = and(
      eq(responses.interviewerId, interviewerId),
      eq(responses.surveyId, surveyId)
    );
  }

  const interviewData = await db.select({
    totalInterviews: sql<number>`COUNT(*)::int`,
    totalTimeSeconds: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${responses.endTime} - ${responses.startTime}))), 0)::int`,
    avgDuration: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${responses.endTime} - ${responses.startTime}))), 0)::int`,
    uniqueSurveys: sql<number>`COUNT(DISTINCT ${responses.surveyId})::int`
  })
    .from(responses)
    .innerJoin(surveys, eq(responses.surveyId, surveys.id))
    .where(and(
      whereConditions,
      eq(surveys.organizationId, orgId),
      isNull(surveys.deletedAt)
    ));

  const stats = interviewData[0] || { totalInterviews: 0, totalTimeSeconds: 0, avgDuration: 0, uniqueSurveys: 0 };
  const totalTimeMinutes = Math.round(stats.totalTimeSeconds / 60);

  let distanceConditions = and(
    eq(dailyDistanceSummary.userId, interviewerId),
    eq(dailyDistanceSummary.organizationId, orgId)
  );

  if (surveyId) {
    distanceConditions = and(
      eq(dailyDistanceSummary.userId, interviewerId),
      eq(dailyDistanceSummary.organizationId, orgId),
      eq(dailyDistanceSummary.surveyId, surveyId)
    );
  }

  const distanceData = await db.select({
    totalMeters: sql<number>`COALESCE(SUM(${dailyDistanceSummary.distanceMeters}), 0)::int`
  })
    .from(dailyDistanceSummary)
    .where(distanceConditions);

  const totalDistanceMeters = distanceData[0]?.totalMeters || 0;
  const caloriesBurned = calculateCalories(totalTimeMinutes, totalDistanceMeters);

  return {
    name,
    surveysCompleted: surveyId ? (completedSurveys.some(s => s.surveyId === surveyId) ? 1 : 0) : completedSurveys.length,
    totalInterviews: stats.totalInterviews,
    totalTimeMinutes,
    totalDistanceMeters,
    caloriesBurned,
    currentSurvey,
    participatedSurveys: surveyOptions
  };
}

export async function getSupervisorDashboardMetrics(
  orgId: number,
  filters?: {
    surveyId?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{
  summary: {
    totalInterviewers: number;
    totalInterviews: number;
    totalTimeHours: number;
    totalDistanceKm: number;
    avgInterviewsPerPerson: number;
  };
  interviewers: InterviewerMetrics[];
}> {
  let responseConditions = eq(surveys.organizationId, orgId);

  if (filters?.surveyId) {
    responseConditions = and(responseConditions, eq(responses.surveyId, filters.surveyId)) as any;
  }

  if (filters?.startDate) {
    responseConditions = and(responseConditions, gte(responses.createdAt, filters.startDate)) as any;
  }

  if (filters?.endDate) {
    responseConditions = and(responseConditions, lte(responses.createdAt, filters.endDate)) as any;
  }

  const interviewerStats = await db.select({
    interviewerId: responses.interviewerId,
    firstName: users.firstName,
    lastName: users.lastName,
    totalInterviews: sql<number>`COUNT(*)::int`,
    totalTimeSeconds: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${responses.endTime} - ${responses.startTime}))), 0)::int`,
    avgDuration: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${responses.endTime} - ${responses.startTime}))), 0)::int`,
    surveysParticipated: sql<number>`COUNT(DISTINCT ${responses.surveyId})::int`,
    validCount: sql<number>`SUM(CASE WHEN ${responses.status} = 'valid' THEN 1 ELSE 0 END)::int`
  })
    .from(responses)
    .innerJoin(surveys, eq(responses.surveyId, surveys.id))
    .leftJoin(users, eq(responses.interviewerId, users.id))
    .where(and(responseConditions, isNull(surveys.deletedAt)))
    .groupBy(responses.interviewerId, users.firstName, users.lastName);

  const interviewerIds = interviewerStats.map(s => s.interviewerId);

  let distanceMap: Record<string, number> = {};

  if (interviewerIds.length > 0) {
    let distanceConditions = and(
      eq(dailyDistanceSummary.organizationId, orgId),
      inArray(dailyDistanceSummary.userId, interviewerIds)
    );

    if (filters?.surveyId) {
      distanceConditions = and(distanceConditions, eq(dailyDistanceSummary.surveyId, filters.surveyId));
    }

    const distanceData = await db.select({
      userId: dailyDistanceSummary.userId,
      totalMeters: sql<number>`COALESCE(SUM(${dailyDistanceSummary.distanceMeters}), 0)::int`
    })
      .from(dailyDistanceSummary)
      .where(distanceConditions)
      .groupBy(dailyDistanceSummary.userId);

    distanceData.forEach(d => {
      distanceMap[d.userId] = d.totalMeters;
    });
  }

  const interviewers: InterviewerMetrics[] = interviewerStats.map(stat => {
    const totalTimeMinutes = Math.round(stat.totalTimeSeconds / 60);
    const totalDistanceMeters = distanceMap[stat.interviewerId] || 0;
    const caloriesBurned = calculateCalories(totalTimeMinutes, totalDistanceMeters);
    const efficiency = totalTimeMinutes > 0 ? (stat.totalInterviews / (totalTimeMinutes / 60)) : 0;
    const validRate = stat.totalInterviews > 0 ? (stat.validCount / stat.totalInterviews) * 100 : 0;

    return {
      interviewerId: stat.interviewerId,
      interviewerName: `${stat.firstName || ''} ${stat.lastName || ''}`.trim() || 'Entrevistador',
      surveysParticipated: stat.surveysParticipated,
      totalInterviews: stat.totalInterviews,
      totalTimeMinutes,
      totalDistanceMeters,
      caloriesBurned,
      avgInterviewDuration: Math.round(stat.avgDuration / 60),
      efficiency: Math.round(efficiency * 10) / 10,
      validRate: Math.round(validRate * 10) / 10
    };
  });

  interviewers.sort((a, b) => b.totalInterviews - a.totalInterviews);

  const totalInterviewers = interviewers.length;
  const totalInterviews = interviewers.reduce((sum, i) => sum + i.totalInterviews, 0);
  const totalTimeMinutes = interviewers.reduce((sum, i) => sum + i.totalTimeMinutes, 0);
  const totalDistanceMeters = interviewers.reduce((sum, i) => sum + i.totalDistanceMeters, 0);

  return {
    summary: {
      totalInterviewers,
      totalInterviews,
      totalTimeHours: Math.round(totalTimeMinutes / 60 * 10) / 10,
      totalDistanceKm: Math.round(totalDistanceMeters / 1000 * 10) / 10,
      avgInterviewsPerPerson: totalInterviewers > 0 ? Math.round(totalInterviews / totalInterviewers * 10) / 10 : 0
    },
    interviewers
  };
}

export async function getInterviewerTrend(
  orgId: number,
  filters?: {
    surveyId?: number;
    days?: number;
  }
): Promise<Array<{ date: string; interviews: number; interviewers: number }>> {
  const days = filters?.days || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  let conditions = and(
    eq(surveys.organizationId, orgId),
    gte(responses.createdAt, startDate),
    isNull(surveys.deletedAt)
  );

  if (filters?.surveyId) {
    conditions = and(conditions, eq(responses.surveyId, filters.surveyId));
  }

  const trend = await db.select({
    date: sql<string>`DATE(${responses.createdAt})::text`,
    interviews: sql<number>`COUNT(*)::int`,
    interviewers: sql<number>`COUNT(DISTINCT ${responses.interviewerId})::int`
  })
    .from(responses)
    .innerJoin(surveys, eq(responses.surveyId, surveys.id))
    .where(conditions)
    .groupBy(sql`DATE(${responses.createdAt})`)
    .orderBy(sql`DATE(${responses.createdAt})`);

  return trend;
}
