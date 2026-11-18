import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';
import type { AppDb } from './client.ts';
import { ensureRealisticSeedData } from './seed.ts';

let cachedDb: AppDb | null = null;
let initializedPromise: Promise<AppDb> | null = null;

function createTablesIfNotExists(sqlite: Database.Database): void {
  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      google_sub TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'VOTER',
      enrollment_year INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_enrollment_year ON users(enrollment_year);

    CREATE TABLE IF NOT EXISTS auditions (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      event_date TEXT NOT NULL,
      deadline TEXT,
      entry_deadline TEXT NOT NULL DEFAULT '',
      scoring_deadline TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      is_penalty_enabled INTEGER NOT NULL DEFAULT 0,
      aggregation_method TEXT NOT NULL DEFAULT 'DIFF_CORRECTION',
      standard_diff REAL NOT NULL DEFAULT 100.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auditions_event_date ON auditions(event_date);
    CREATE INDEX IF NOT EXISTS idx_auditions_status ON auditions(status);

    CREATE TABLE IF NOT EXISTS bands (
      id TEXT PRIMARY KEY NOT NULL,
      audition_id TEXT NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      performance_order INTEGER NOT NULL,
      penalty_deduction REAL NOT NULL DEFAULT 0,
      updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bands_audition_order ON bands(audition_id, performance_order);

    CREATE TABLE IF NOT EXISTS band_members (
      id TEXT PRIMARY KEY NOT NULL,
      band_id TEXT NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      instrument TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_band_members_band_user ON band_members(band_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_band_members_user ON band_members(user_id);

    CREATE TABLE IF NOT EXISTS audition_voters (
      id TEXT PRIMARY KEY NOT NULL,
      audition_id TEXT NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_type TEXT NOT NULL DEFAULT 'SCORE_AND_COMMENT',
      is_submitted INTEGER NOT NULL DEFAULT 0,
      submitted_at INTEGER,
      general_feedback TEXT NOT NULL DEFAULT ''
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_audition_voters_audition_user ON audition_voters(audition_id, user_id);

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY NOT NULL,
      audition_id TEXT NOT NULL REFERENCES auditions(id) ON DELETE CASCADE,
      band_id TEXT NOT NULL REFERENCES bands(id) ON DELETE CASCADE,
      evaluator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tech_score REAL,
      charm_score REAL,
      comment TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_audition_band_evaluator ON scores(audition_id, band_id, evaluator_user_id);
    CREATE INDEX IF NOT EXISTS idx_scores_audition_evaluator ON scores(audition_id, evaluator_user_id);
    CREATE INDEX IF NOT EXISTS idx_scores_audition_band ON scores(audition_id, band_id);
  `);

  const voterCols = sqlite
    .prepare(`PRAGMA table_info(audition_voters)`)
    .all() as Array<{ name: string }>;
  if (!voterCols.some((col) => col.name === 'general_feedback')) {
    sqlite.exec(
      `ALTER TABLE audition_voters ADD COLUMN general_feedback TEXT NOT NULL DEFAULT '';`,
    );
  }

  const auditionCols = sqlite
    .prepare(`PRAGMA table_info(auditions)`)
    .all() as Array<{ name: string }>;
  if (!auditionCols.some((col) => col.name === 'entry_deadline')) {
    sqlite.exec(
      `ALTER TABLE auditions ADD COLUMN entry_deadline TEXT NOT NULL DEFAULT '';`,
    );
    sqlite.exec(
      `UPDATE auditions SET entry_deadline = COALESCE(deadline, event_date || 'T23:59') WHERE entry_deadline = '';`,
    );
  }
  if (!auditionCols.some((col) => col.name === 'scoring_deadline')) {
    sqlite.exec(`ALTER TABLE auditions ADD COLUMN scoring_deadline TEXT;`);
  }
}

export async function getLocalDb(dbPath: string = '.local-dev.sqlite'): Promise<AppDb> {
  if (cachedDb) return cachedDb;
  if (!initializedPromise) {
    initializedPromise = (async () => {
      const sqlite = new Database(dbPath);
      createTablesIfNotExists(sqlite);
      const db = drizzle(sqlite, { schema }) as unknown as AppDb;
      await ensureRealisticSeedData(db);
      cachedDb = db;
      return db;
    })();
  }
  return initializedPromise;
}

export function createInMemoryTestDb(): AppDb {
  const sqlite = new Database(':memory:');
  createTablesIfNotExists(sqlite);
  return drizzle(sqlite, { schema }) as unknown as AppDb;
}

