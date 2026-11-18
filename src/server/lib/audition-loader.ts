import { asc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/client.ts';
import {
  auditions,
  auditionVoters,
  bandMembers,
  bands,
  scores,
  users,
} from '../db/schema.ts';
import {
  calculateAuditionResults,
  type AuditionAggregationOutput,
} from '../../shared/aggregation.ts';
import { calculateGrade } from '../../shared/grade.ts';

export interface LoadedBandWithMembers {
  id: string;
  auditionId: string;
  name: string;
  performanceOrder: number;
  penaltyDeduction: number;
  updatedByUserId: string | null;
  updatedByName: string | null;
  createdAt: number;
  updatedAt: number;
  members: Array<{
    userId: string;
    name: string;
    email: string;
    enrollmentYear: number;
    grade: number;
    instrument: string | null;
  }>;
}

export async function loadBandsWithMembers(
  db: AppDb,
  auditionId: string,
): Promise<LoadedBandWithMembers[]> {
  const bandRows = await db
    .select({
      id: bands.id,
      auditionId: bands.auditionId,
      name: bands.name,
      performanceOrder: bands.performanceOrder,
      penaltyDeduction: bands.penaltyDeduction,
      updatedByUserId: bands.updatedByUserId,
      updatedByName: users.name,
      createdAt: bands.createdAt,
      updatedAt: bands.updatedAt,
    })
    .from(bands)
    .leftJoin(users, eq(bands.updatedByUserId, users.id))
    .where(eq(bands.auditionId, auditionId))
    .orderBy(asc(bands.performanceOrder), asc(bands.createdAt));

  if (bandRows.length === 0) return [];

  const memberRows = await db
    .select({
      bandId: bandMembers.bandId,
      userId: bandMembers.userId,
      instrument: bandMembers.instrument,
      name: users.name,
      email: users.email,
      enrollmentYear: users.enrollmentYear,
    })
    .from(bandMembers)
    .innerJoin(bands, eq(bandMembers.bandId, bands.id))
    .innerJoin(users, eq(bandMembers.userId, users.id))
    .where(eq(bands.auditionId, auditionId))
    .orderBy(asc(users.enrollmentYear), asc(users.name));

  const membersByBand = new Map<string, LoadedBandWithMembers['members']>();
  for (const row of memberRows) {
    const list = membersByBand.get(row.bandId) ?? [];
    list.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      enrollmentYear: row.enrollmentYear,
      grade: calculateGrade(row.enrollmentYear),
      instrument: row.instrument,
    });
    membersByBand.set(row.bandId, list);
  }

  return bandRows.map((b) => ({
    ...b,
    members: membersByBand.get(b.id) ?? [],
  }));
}

export async function loadAuditionAggregation(
  db: AppDb,
  auditionId: string,
): Promise<{
  audition: typeof auditions.$inferSelect;
  bandsWithMembers: LoadedBandWithMembers[];
  aggregation: AuditionAggregationOutput;
} | null> {
  const [audition] = await db
    .select()
    .from(auditions)
    .where(eq(auditions.id, auditionId))
    .limit(1);

  if (!audition) return null;

  const bandsWithMembers = await loadBandsWithMembers(db, auditionId);

  const voterRows = await db
    .select({
      userId: auditionVoters.userId,
      permissionType: auditionVoters.permissionType,
      isSubmitted: auditionVoters.isSubmitted,
      submittedAt: auditionVoters.submittedAt,
      generalFeedback: auditionVoters.generalFeedback,
      userName: users.name,
      email: users.email,
      enrollmentYear: users.enrollmentYear,
    })
    .from(auditionVoters)
    .innerJoin(users, eq(auditionVoters.userId, users.id))
    .where(eq(auditionVoters.auditionId, auditionId));

  const scoreRows = await db
    .select({
      id: scores.id,
      bandId: scores.bandId,
      evaluatorUserId: scores.evaluatorUserId,
      techScore: scores.techScore,
      charmScore: scores.charmScore,
      comment: scores.comment,
      updatedAt: scores.updatedAt,
    })
    .from(scores)
    .where(eq(scores.auditionId, auditionId));

  const aggregation = calculateAuditionResults(
    {
      id: audition.id,
      isPenaltyEnabled: audition.isPenaltyEnabled,
      aggregationMethod: audition.aggregationMethod,
      standardDiff: audition.standardDiff,
    },
    bandsWithMembers.map((b) => ({
      id: b.id,
      name: b.name,
      performanceOrder: b.performanceOrder,
      penaltyDeduction: b.penaltyDeduction,
      memberUserIds: b.members.map((m) => m.userId),
      memberNames: b.members.map((m) => m.name),
    })),
    voterRows.map((v) => ({
      userId: v.userId,
      userName: v.userName,
      email: v.email,
      enrollmentYear: v.enrollmentYear,
      permissionType: v.permissionType,
      isSubmitted: v.isSubmitted,
      submittedAt: v.submittedAt,
      generalFeedback: v.generalFeedback,
    })),
    scoreRows,
  );

  return {
    audition,
    bandsWithMembers,
    aggregation,
  };
}

