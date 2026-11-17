import { z } from 'zod';
import {
  AUDITION_STATUS_VALUES,
  type AuditionStatus,
} from '../audition-status.ts';

export const RoleSchema = z.enum(['ADMIN', 'VOTER']);
export type Role = z.infer<typeof RoleSchema>;

export const AuditionStatusSchema = z.enum(AUDITION_STATUS_VALUES);
export type { AuditionStatus };

export const AggregationMethodSchema = z.enum([
  'DIFF_CORRECTION',
  'Z_SCORE',
  'RAW_AVERAGE',
]);
export type AggregationMethod = z.infer<typeof AggregationMethodSchema>;

export const PermissionTypeSchema = z.enum(['SCORE_AND_COMMENT', 'COMMENT_ONLY']);
export type PermissionType = z.infer<typeof PermissionTypeSchema>;

export const CreateAuditionSchema = z.object({
  title: z.string().trim().min(1, '開催回名を入力してください').max(100),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '開催日はYYYY-MM-DD形式で入力してください'),
  deadline: z.string().nullable().optional(),
  isPenaltyEnabled: z.boolean().optional().default(false),
  aggregationMethod: AggregationMethodSchema.optional().default('DIFF_CORRECTION'),
  standardDiff: z.number().positive().max(100).optional().default(100),
});

export const UpdateAuditionSchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  deadline: z.string().nullable().optional(),
  isPenaltyEnabled: z.boolean().optional(),
  aggregationMethod: AggregationMethodSchema.optional(),
  standardDiff: z.number().positive().max(100).optional(),
});

export const UpdateAuditionStatusSchema = z.object({
  status: AuditionStatusSchema,
});

export const UpsertBandSchema = z.object({
  name: z.string().trim().min(1, 'バンド名を入力してください').max(100),
  performanceOrder: z.number().int().min(1).max(999).optional(),
  memberUserIds: z.array(z.string().min(1)).default([]),
});

export const ReorderBandsSchema = z.object({
  bandIds: z.array(z.string().min(1)).min(1, '並び替え対象のバンドがありません'),
});

export const UpdatePenaltySchema = z.object({
  penaltyDeduction: z.number().min(0).max(100),
});

export const UpsertScoreSchema = z.object({
  techScore: z.number().min(0).max(50).nullable(),
  charmScore: z.number().min(0).max(50).nullable(),
  comment: z.string().max(2000),
});

export const SubmitScoresSchema = z.object({
  scores: z.array(
    z.object({
      bandId: z.string().min(1),
      techScore: z.number().min(0).max(50).nullable(),
      charmScore: z.number().min(0).max(50).nullable(),
      comment: z.string().max(2000),
    }),
  ),
  markSubmitted: z.boolean().default(true),
});

export const BulkUsersSchema = z.object({
  csvText: z.string().min(1, 'CSVまたはTSVテキストを入力してください'),
});

export const UpdateUserRoleSchema = z.object({
  role: RoleSchema,
});

export const BulkBandsSchema = z.object({
  csvText: z.string().min(1, 'バンド一覧テキストを入力してください'),
  replaceExisting: z.boolean().optional().default(false),
});

export const BulkVotersSchema = z.object({
  mode: z.enum(['BY_IDS', 'BY_CONDITION']),
  userIds: z.array(z.string()).optional(),
  enrollmentYears: z.array(z.number().int()).optional(),
  performerFilter: z.enum(['ALL', 'PERFORMERS_ONLY', 'NON_PERFORMERS_ONLY']).optional(),
  permissionType: PermissionTypeSchema.optional(),
  action: z.enum(['ASSIGN', 'REMOVE']).default('ASSIGN'),
});

