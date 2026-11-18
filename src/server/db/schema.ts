import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { AUDITION_STATUS_VALUES } from '../../shared/audition-status.ts';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    googleSub: text('google_sub').unique(),
    name: text('name').notNull(),
    role: text('role', { enum: ['ADMIN', 'VOTER'] })
      .notNull()
      .default('VOTER'),
    enrollmentYear: integer('enrollment_year').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('idx_users_enrollment_year').on(table.enrollmentYear)],
);

export const auditions = sqliteTable(
  'auditions',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    eventDate: text('event_date').notNull(),
    deadline: text('deadline'),
    status: text('status', { enum: AUDITION_STATUS_VALUES })
      .notNull()
      .default('DRAFT'),
    isPenaltyEnabled: integer('is_penalty_enabled', { mode: 'boolean' })
      .notNull()
      .default(false),
    aggregationMethod: text('aggregation_method', {
      enum: ['DIFF_CORRECTION', 'Z_SCORE', 'RAW_AVERAGE'],
    })
      .notNull()
      .default('DIFF_CORRECTION'),
    standardDiff: real('standard_diff').notNull().default(100.0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_auditions_event_date').on(table.eventDate),
    index('idx_auditions_status').on(table.status),
  ],
);

export const bands = sqliteTable(
  'bands',
  {
    id: text('id').primaryKey(),
    auditionId: text('audition_id')
      .notNull()
      .references(() => auditions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    performanceOrder: integer('performance_order').notNull(),
    penaltyDeduction: real('penalty_deduction').notNull().default(0),
    updatedByUserId: text('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_bands_audition_order').on(table.auditionId, table.performanceOrder),
  ],
);

export const bandMembers = sqliteTable(
  'band_members',
  {
    id: text('id').primaryKey(),
    bandId: text('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    instrument: text('instrument'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_band_members_band_user').on(table.bandId, table.userId),
    index('idx_band_members_user').on(table.userId),
  ],
);

export const auditionVoters = sqliteTable(
  'audition_voters',
  {
    id: text('id').primaryKey(),
    auditionId: text('audition_id')
      .notNull()
      .references(() => auditions.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    permissionType: text('permission_type', {
      enum: ['SCORE_AND_COMMENT', 'COMMENT_ONLY'],
    })
      .notNull()
      .default('SCORE_AND_COMMENT'),
    isSubmitted: integer('is_submitted', { mode: 'boolean' })
      .notNull()
      .default(false),
    submittedAt: integer('submitted_at'),
    generalFeedback: text('general_feedback').notNull().default(''),
  },
  (table) => [
    uniqueIndex('uq_audition_voters_audition_user').on(
      table.auditionId,
      table.userId,
    ),
  ],
);

export const scores = sqliteTable(
  'scores',
  {
    id: text('id').primaryKey(),
    auditionId: text('audition_id')
      .notNull()
      .references(() => auditions.id, { onDelete: 'cascade' }),
    bandId: text('band_id')
      .notNull()
      .references(() => bands.id, { onDelete: 'cascade' }),
    evaluatorUserId: text('evaluator_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    techScore: real('tech_score'),
    charmScore: real('charm_score'),
    comment: text('comment').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_scores_audition_band_evaluator').on(
      table.auditionId,
      table.bandId,
      table.evaluatorUserId,
    ),
    index('idx_scores_audition_evaluator').on(
      table.auditionId,
      table.evaluatorUserId,
    ),
    index('idx_scores_audition_band').on(table.auditionId, table.bandId),
  ],
);

