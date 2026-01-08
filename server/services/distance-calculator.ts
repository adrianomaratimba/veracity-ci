import { db } from "../db";
import { interviewerLocations, dailyDistanceSummary } from "@shared/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function calculateHaversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_METERS * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

export async function calculateTotalDistanceFromLocations(
  locations: Array<{ latitude: number; longitude: number }>
): Promise<number> {
  if (locations.length < 2) return 0;
  
  let totalDistance = 0;
  for (let i = 1; i < locations.length; i++) {
    totalDistance += calculateHaversineDistance(
      locations[i - 1].latitude,
      locations[i - 1].longitude,
      locations[i].latitude,
      locations[i].longitude
    );
  }
  
  return totalDistance;
}

export async function updateDailyDistanceSummary(
  organizationId: number,
  userId: string,
  surveyId: number | null,
  date: Date
): Promise<void> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const locations = await db.select({
    latitude: interviewerLocations.latitude,
    longitude: interviewerLocations.longitude,
    recordedAt: interviewerLocations.recordedAt
  })
  .from(interviewerLocations)
  .where(and(
    eq(interviewerLocations.userId, userId),
    eq(interviewerLocations.organizationId, organizationId),
    surveyId ? eq(interviewerLocations.surveyId, surveyId) : sql`TRUE`,
    gte(interviewerLocations.recordedAt, startOfDay),
    lte(interviewerLocations.recordedAt, endOfDay)
  ))
  .orderBy(interviewerLocations.recordedAt);

  if (locations.length === 0) return;

  const totalDistance = await calculateTotalDistanceFromLocations(locations);
  const startTime = locations[0].recordedAt;
  const endTime = locations[locations.length - 1].recordedAt;

  const existing = await db.select()
    .from(dailyDistanceSummary)
    .where(and(
      eq(dailyDistanceSummary.userId, userId),
      eq(dailyDistanceSummary.organizationId, organizationId),
      surveyId ? eq(dailyDistanceSummary.surveyId, surveyId) : sql`TRUE`,
      gte(dailyDistanceSummary.date, startOfDay),
      lte(dailyDistanceSummary.date, endOfDay)
    ))
    .limit(1);

  if (existing.length > 0) {
    await db.update(dailyDistanceSummary)
      .set({
        distanceMeters: totalDistance,
        pointsCount: locations.length,
        startTime,
        endTime,
        updatedAt: new Date()
      })
      .where(eq(dailyDistanceSummary.id, existing[0].id));
  } else {
    await db.insert(dailyDistanceSummary).values({
      organizationId,
      surveyId,
      userId,
      date: startOfDay,
      distanceMeters: totalDistance,
      pointsCount: locations.length,
      startTime,
      endTime
    });
  }
}

export async function getTotalSurveyDistance(
  organizationId: number,
  userId: string,
  surveyId?: number
): Promise<{ totalMeters: number; byDay: Array<{ date: Date; meters: number }> }> {
  const query = db.select({
    date: dailyDistanceSummary.date,
    meters: dailyDistanceSummary.distanceMeters
  })
  .from(dailyDistanceSummary)
  .where(and(
    eq(dailyDistanceSummary.userId, userId),
    eq(dailyDistanceSummary.organizationId, organizationId),
    surveyId ? eq(dailyDistanceSummary.surveyId, surveyId) : sql`TRUE`
  ))
  .orderBy(desc(dailyDistanceSummary.date));

  const results = await query;
  
  const totalMeters = results.reduce((sum, r) => sum + r.meters, 0);
  
  return {
    totalMeters,
    byDay: results.map(r => ({
      date: r.date,
      meters: r.meters
    }))
  };
}

export async function getRouteForDay(
  organizationId: number,
  userId: string,
  date: Date,
  surveyId?: number
): Promise<Array<{ lat: number; lng: number; time: Date }>> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const locations = await db.select({
    latitude: interviewerLocations.latitude,
    longitude: interviewerLocations.longitude,
    recordedAt: interviewerLocations.recordedAt
  })
  .from(interviewerLocations)
  .where(and(
    eq(interviewerLocations.userId, userId),
    eq(interviewerLocations.organizationId, organizationId),
    surveyId ? eq(interviewerLocations.surveyId, surveyId) : sql`TRUE`,
    gte(interviewerLocations.recordedAt, startOfDay),
    lte(interviewerLocations.recordedAt, endOfDay)
  ))
  .orderBy(interviewerLocations.recordedAt);

  return locations.map(l => ({
    lat: l.latitude,
    lng: l.longitude,
    time: l.recordedAt
  }));
}
