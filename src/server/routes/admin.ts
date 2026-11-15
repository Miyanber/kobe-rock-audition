import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { AppEnv } from '../types.ts';
import {
  auditions,
  auditionVoters,
  bandMembers,
  bands,
  scores,
  users,
} from '../db/schema.ts';
import { requireAdmin } from '../middleware/auth.ts';
import {
  loadAuditionAggregation,
  loadBandsWithMembers,
} from '../lib/audition-loader.ts';
import { parseDelimitedText } from '../lib/csv.ts';
import {
  generateBandCommentsExport,
  generateSummaryAndRawExport,
} from '../lib/export.ts';
import {
  BulkBandsSchema,
  BulkUsersSchema,
  BulkVotersSchema,
  CreateAuditionSchema,
  UpdateAuditionSchema,
  UpdateAuditionStatusSchema,
  UpdatePenaltySchema,
  UpdateUserRoleSchema,
  type Role,
} from '../../shared/schema/index.ts';
import { calculateGrade, getAcademicYear } from '../../shared/grade.ts';

export const adminRoutes = new Hono<AppEnv>()
  .use('*', requireAdmin)
  .get('/auditions', async (c) => {
    const db = c.get('db');
    const list = await db
      .select()
      .from(auditions)
      .orderBy(desc(auditions.eventDate), desc(auditions.createdAt));
    return c.json({ auditions: list });
  })
  .post('/auditions', zValidator('json', CreateAuditionSchema), async (c) => {
    const db = c.get('db');
    const body = c.req.valid('json');
    const now = Date.now();
    const id = crypto.randomUUID();

    await db.insert(auditions).values({
      id,
      title: body.title,
      eventDate: body.eventDate,
      deadline: body.deadline ?? null,
      status: 'DRAFT',
      isPenaltyEnabled: body.isPenaltyEnabled,
      aggregationMethod: body.aggregationMethod,
      standardDiff: body.standardDiff,
      createdAt: now,
      updatedAt: now,
    });

    const [created] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, id))
      .limit(1);

    return c.json({ audition: created }, 201);
  })
  .patch('/auditions/:id', zValidator('json', UpdateAuditionSchema), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const [existing] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    await db
      .update(auditions)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.eventDate !== undefined ? { eventDate: body.eventDate } : {}),
        ...(body.deadline !== undefined ? { deadline: body.deadline } : {}),
        ...(body.isPenaltyEnabled !== undefined
          ? { isPenaltyEnabled: body.isPenaltyEnabled }
          : {}),
        ...(body.aggregationMethod !== undefined
          ? { aggregationMethod: body.aggregationMethod }
          : {}),
        ...(body.standardDiff !== undefined
          ? { standardDiff: body.standardDiff }
          : {}),
        updatedAt: Date.now(),
      })
      .where(eq(auditions.id, id));

    const [updated] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, id))
      .limit(1);

    return c.json({ audition: updated });
  })
  .post(
    '/auditions/:id/status',
    zValidator('json', UpdateAuditionStatusSchema),
    async (c) => {
      const db = c.get('db');
      const id = c.req.param('id');
      const { status } = c.req.valid('json');

      const [existing] = await db
        .select()
        .from(auditions)
        .where(eq(auditions.id, id))
        .limit(1);

      if (!existing) {
        return c.json({ error: 'オーディションが見つかりません。' }, 404);
      }

      const now = Date.now();
      if (status === 'ACTIVE') {
        // 単一UPDATE文で既存のACTIVEをすべて自動的にCLOSEDへ切り替え、対象のみACTIVEにする
        await db
          .update(auditions)
          .set({
            status: sql`CASE WHEN ${auditions.id} = ${id} THEN 'ACTIVE' ELSE 'CLOSED' END`,
            updatedAt: now,
          })
          .where(sql`${auditions.id} = ${id} OR ${auditions.status} = 'ACTIVE'`);
      } else {
        await db
          .update(auditions)
          .set({ status, updatedAt: now })
          .where(eq(auditions.id, id));
      }

      const allAuditions = await db
        .select()
        .from(auditions)
        .orderBy(desc(auditions.eventDate), desc(auditions.createdAt));

      return c.json({
        audition: allAuditions.find((a) => a.id === id),
        auditions: allAuditions,
      });
    },
  )
  .delete('/auditions/:id', async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');

    const [existing] = await db
      .select({ id: auditions.id })
      .from(auditions)
      .where(eq(auditions.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    await db.delete(auditions).where(eq(auditions.id, id));
    return c.json({ ok: true, id });
  })
  .post(
    '/auditions/:id/bands/bulk',
    zValidator('json', BulkBandsSchema),
    async (c) => {
      const db = c.get('db');
      const user = c.get('user')!;
      const auditionId = c.req.param('id');
      const { csvText, replaceExisting } = c.req.valid('json');

      const [audition] = await db
        .select()
        .from(auditions)
        .where(eq(auditions.id, auditionId))
        .limit(1);

      if (!audition) {
        return c.json({ error: 'オーディションが見つかりません。' }, 404);
      }

      const rows = parseDelimitedText(csvText);
      if (rows.length === 0) {
        return c.json({ error: '有効な行が見つかりませんでした。' }, 400);
      }

      const allUsers = await db.select().from(users);
      const userByEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
      const userByName = new Map(allUsers.map((u) => [u.name.trim(), u]));

      // ヘッダー行判定
      let startIdx = 0;
      const firstCell = rows[0][0] ?? '';
      if (
        isNaN(Number(firstCell)) &&
        /順|order|no|バンド|name/i.test(rows[0].join(' '))
      ) {
        startIdx = 1;
      }

      if (replaceExisting) {
        await db.delete(bands).where(eq(bands.auditionId, auditionId));
      }

      const now = Date.now();
      let insertedCount = 0;
      const warnings: string[] = [];

      for (let i = startIdx; i < rows.length; i++) {
        const cols = rows[i];
        if (cols.length < 2) continue;

        let order = Number(cols[0]);
        let bandName = cols[1]?.trim() ?? '';
        let memberTokensRaw = cols.slice(2).join('/');

        // 1列目が数字でなくバンド名だった場合のフォールバック
        if (Number.isNaN(order)) {
          order = i - startIdx + 1;
          bandName = cols[0]?.trim() ?? '';
          memberTokensRaw = cols.slice(1).join('/');
        }

        if (!bandName) continue;

        const bandId = crypto.randomUUID();
        await db.insert(bands).values({
          id: bandId,
          auditionId,
          name: bandName,
          performanceOrder: Math.max(1, Math.round(order)),
          penaltyDeduction: 0,
          updatedByUserId: user.id,
          createdAt: now,
          updatedAt: now,
        });

        const memberTokens = memberTokensRaw
          .split(/[/|;；、]+/)
          .map((t) => t.trim())
          .filter(Boolean);

        const matchedUserIds = new Set<string>();
        for (const token of memberTokens) {
          const cleanToken = token.replace(/\s*\([^)]*\)$/, '').trim();
          const byEmail = userByEmail.get(cleanToken.toLowerCase());
          const byName = userByName.get(cleanToken);
          const matched = byEmail ?? byName;
          if (matched) {
            matchedUserIds.add(matched.id);
          } else {
            warnings.push(`「${bandName}」のメンバー「${token}」が部員マスタに見つかりませんでした`);
          }
        }

        if (matchedUserIds.size > 0) {
          await db.insert(bandMembers).values(
            Array.from(matchedUserIds).map((uid) => ({
              id: crypto.randomUUID(),
              bandId,
              userId: uid,
              instrument: null,
              createdAt: now,
            })),
          );
        }

        insertedCount++;
      }

      const updatedBands = await loadBandsWithMembers(db, auditionId);
      return c.json({
        insertedCount,
        warnings,
        bands: updatedBands,
      });
    },
  )
  .patch(
    '/auditions/:id/bands/:bandId/penalty',
    zValidator('json', UpdatePenaltySchema),
    async (c) => {
      const db = c.get('db');
      const auditionId = c.req.param('id');
      const bandId = c.req.param('bandId');
      const { penaltyDeduction } = c.req.valid('json');

      const [existing] = await db
        .select()
        .from(bands)
        .where(and(eq(bands.id, bandId), eq(bands.auditionId, auditionId)))
        .limit(1);

      if (!existing) {
        return c.json({ error: '対象バンドが見つかりません。' }, 404);
      }

      await db
        .update(bands)
        .set({
          penaltyDeduction,
          updatedAt: Date.now(),
        })
        .where(eq(bands.id, bandId));

      return c.json({ ok: true, bandId, penaltyDeduction });
    },
  )
  .get('/auditions/:id/voters', async (c) => {
    const db = c.get('db');
    const auditionId = c.req.param('id');

    const [audition] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, auditionId))
      .limit(1);

    if (!audition) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    const bandsWithMembers = await loadBandsWithMembers(db, auditionId);
    const totalBands = bandsWithMembers.length;

    const voterRows = await db
      .select({
        id: auditionVoters.id,
        userId: auditionVoters.userId,
        permissionType: auditionVoters.permissionType,
        isSubmitted: auditionVoters.isSubmitted,
        submittedAt: auditionVoters.submittedAt,
        name: users.name,
        email: users.email,
        enrollmentYear: users.enrollmentYear,
        role: users.role,
      })
      .from(auditionVoters)
      .innerJoin(users, eq(auditionVoters.userId, users.id))
      .where(eq(auditionVoters.auditionId, auditionId))
      .orderBy(asc(auditionVoters.isSubmitted), desc(users.enrollmentYear), asc(users.name));

    const scoreRows = await db
      .select({
        bandId: scores.bandId,
        evaluatorUserId: scores.evaluatorUserId,
        techScore: scores.techScore,
        charmScore: scores.charmScore,
        comment: scores.comment,
      })
      .from(scores)
      .where(eq(scores.auditionId, auditionId));

    const bandOwnSetByUser = new Map<string, Set<string>>();
    for (const band of bandsWithMembers) {
      for (const m of band.members) {
        const set = bandOwnSetByUser.get(m.userId) ?? new Set<string>();
        set.add(band.id);
        bandOwnSetByUser.set(m.userId, set);
      }
    }

    const scoresByUser = new Map<string, typeof scoreRows>();
    for (const sc of scoreRows) {
      const list = scoresByUser.get(sc.evaluatorUserId) ?? [];
      list.push(sc);
      scoresByUser.set(sc.evaluatorUserId, list);
    }

    const voters = voterRows.map((v) => {
      const ownSet = bandOwnSetByUser.get(v.userId) ?? new Set<string>();
      const targetBandCount = Math.max(0, totalBands - ownSet.size);
      const userScores = scoresByUser.get(v.userId) ?? [];

      let completedBandCount = 0;
      for (const sc of userScores) {
        if (ownSet.has(sc.bandId)) continue;
        if (!sc.comment.trim()) continue;
        if (
          v.permissionType === 'SCORE_AND_COMMENT' &&
          (sc.techScore === null || sc.charmScore === null)
        ) {
          continue;
        }
        completedBandCount++;
      }

      return {
        ...v,
        grade: calculateGrade(v.enrollmentYear),
        ownBandCount: ownSet.size,
        targetBandCount,
        completedBandCount,
      };
    });

    return c.json({
      audition,
      voters,
      summary: {
        totalVoters: voters.length,
        submittedCount: voters.filter((v) => v.isSubmitted).length,
        unsubmittedCount: voters.filter((v) => !v.isSubmitted).length,
      },
    });
  })
  .post(
    '/auditions/:id/voters/bulk',
    zValidator('json', BulkVotersSchema),
    async (c) => {
      const db = c.get('db');
      const auditionId = c.req.param('id');
      const body = c.req.valid('json');

      const [audition] = await db
        .select()
        .from(auditions)
        .where(eq(auditions.id, auditionId))
        .limit(1);

      if (!audition) {
        return c.json({ error: 'オーディションが見つかりません。' }, 404);
      }

      let targetUserIds: string[] = [];

      if (body.mode === 'BY_IDS') {
        targetUserIds = Array.from(new Set(body.userIds ?? []));
      } else {
        const allUsers = await db.select().from(users);
        const bandsWithMembers = await loadBandsWithMembers(db, auditionId);
        const performerIds = new Set<string>();
        for (const b of bandsWithMembers) {
          for (const m of b.members) performerIds.add(m.userId);
        }

        targetUserIds = allUsers
          .filter((u) => {
            if (
              body.enrollmentYears &&
              body.enrollmentYears.length > 0 &&
              !body.enrollmentYears.includes(u.enrollmentYear)
            ) {
              return false;
            }
            if (body.performerFilter === 'PERFORMERS_ONLY') {
              return performerIds.has(u.id);
            }
            if (body.performerFilter === 'NON_PERFORMERS_ONLY') {
              return !performerIds.has(u.id);
            }
            return true;
          })
          .map((u) => u.id);
      }

      if (targetUserIds.length === 0) {
        return c.json({ affectedCount: 0 });
      }

      if (body.action === 'REMOVE') {
        await db
          .delete(auditionVoters)
          .where(
            and(
              eq(auditionVoters.auditionId, auditionId),
              inArray(auditionVoters.userId, targetUserIds),
            ),
          );
        return c.json({ affectedCount: targetUserIds.length });
      }

      const permissionType = body.permissionType ?? 'SCORE_AND_COMMENT';
      for (const uid of targetUserIds) {
        await db
          .insert(auditionVoters)
          .values({
            id: crypto.randomUUID(),
            auditionId,
            userId: uid,
            permissionType,
            isSubmitted: false,
            submittedAt: null,
          })
          .onConflictDoUpdate({
            target: [auditionVoters.auditionId, auditionVoters.userId],
            set: {
              permissionType,
            },
          });
      }

      return c.json({ affectedCount: targetUserIds.length });
    },
  )
  .get('/auditions/:id/results', async (c) => {
    const db = c.get('db');
    const auditionId = c.req.param('id');

    const loaded = await loadAuditionAggregation(db, auditionId);
    if (!loaded) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    return c.json({
      audition: loaded.audition,
      bands: loaded.bandsWithMembers,
      aggregation: loaded.aggregation,
    });
  })
  .get('/auditions/:id/export', async (c) => {
    const db = c.get('db');
    const auditionId = c.req.param('id');
    const target = c.req.query('target') === 'band_comments'
      ? 'band_comments'
      : 'summary_and_raw';
    const format = c.req.query('format') === 'csv' ? 'csv' : 'xlsx';

    const loaded = await loadAuditionAggregation(db, auditionId);
    if (!loaded) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    const exported =
      target === 'band_comments'
        ? generateBandCommentsExport(
            loaded.audition.title,
            loaded.aggregation,
            format,
          )
        : generateSummaryAndRawExport(
            loaded.audition.title,
            loaded.audition.eventDate,
            loaded.aggregation,
            format,
          );

    const encodedFilename = encodeURIComponent(exported.filename);
    return new Response(Buffer.from(exported.data), {
      status: 200,
      headers: {
        'Content-Type': exported.contentType,
        'Content-Disposition': `attachment; filename="export.${format}"; filename*=UTF-8''${encodedFilename}`,
        'Cache-Control': 'no-store',
      },
    });
  })
  .get('/users', async (c) => {
    const db = c.get('db');
    const rows = await db
      .select()
      .from(users)
      .orderBy(desc(users.enrollmentYear), asc(users.name));

    return c.json({
      users: rows.map((u) => ({
        ...u,
        grade: calculateGrade(u.enrollmentYear),
      })),
    });
  })
  .post('/users/bulk', zValidator('json', BulkUsersSchema), async (c) => {
    const db = c.get('db');
    const { csvText } = c.req.valid('json');
    const rows = parseDelimitedText(csvText);

    if (rows.length === 0) {
      return c.json({ error: '有効な行が見つかりませんでした。' }, 400);
    }

    let startIdx = 0;
    const headerTest = rows[0].join(' ').toLowerCase();
    if (
      /name|email|氏名|名前|メール|年度|year/.test(headerTest) &&
      !rows[0].some((cell) => cell.includes('@'))
    ) {
      startIdx = 1;
    }

    const now = Date.now();
    const defaultYear = getAcademicYear();
    let upsertedCount = 0;
    const errors: string[] = [];

    for (let i = startIdx; i < rows.length; i++) {
      const cols = rows[i];
      if (cols.length < 2) {
        errors.push(`${i + 1}行目: 氏名とメールアドレスが必要です。`);
        continue;
      }

      const name = cols[0].trim();
      const email = cols[1].trim().toLowerCase();
      const yearNum = cols[2] ? Number(cols[2]) : defaultYear;
      const enrollmentYear =
        !Number.isNaN(yearNum) && yearNum >= 1990 && yearNum <= 2100
          ? Math.round(yearNum)
          : defaultYear;
      const roleRaw = (cols[3] ?? '').trim().toUpperCase();
      const role: Role = roleRaw === 'ADMIN' ? 'ADMIN' : 'VOTER';

      if (!name || !email.includes('@')) {
        errors.push(`${i + 1}行目: 不正な形式です (${cols.join(',')})`);
        continue;
      }

      await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          email,
          name,
          role,
          enrollmentYear,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: {
            name,
            enrollmentYear,
            ...(cols[3] ? { role } : {}),
            updatedAt: now,
          },
        });
      upsertedCount++;
    }

    const updatedUsers = await db
      .select()
      .from(users)
      .orderBy(desc(users.enrollmentYear), asc(users.name));

    return c.json({
      upsertedCount,
      errors,
      users: updatedUsers.map((u) => ({
        ...u,
        grade: calculateGrade(u.enrollmentYear),
      })),
    });
  })
  .patch(
    '/users/:userId/role',
    zValidator('json', UpdateUserRoleSchema),
    async (c) => {
      const db = c.get('db');
      const targetUserId = c.req.param('userId');
      const { role } = c.req.valid('json');

      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);

      if (!target) {
        return c.json({ error: 'ユーザーが見つかりません。' }, 404);
      }

      if (target.role === 'ADMIN' && role === 'VOTER') {
        const admins = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, 'ADMIN'));
        if (admins.length <= 1) {
          return c.json(
            { error: '最後のADMINユーザーを降格することはできません。' },
            400,
          );
        }
      }

      await db
        .update(users)
        .set({ role, updatedAt: Date.now() })
        .where(eq(users.id, targetUserId));

      return c.json({ ok: true, userId: targetUserId, role });
    },
  )
  .delete('/users/:userId', async (c) => {
    const db = c.get('db');
    const currentUser = c.get('user')!;
    const targetUserId = c.req.param('userId');

    if (targetUserId === currentUser.id) {
      return c.json({ error: '自分自身のアカウントは削除できません。' }, 400);
    }

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!target) {
      return c.json({ error: 'ユーザーが見つかりません。' }, 404);
    }

    if (target.role === 'ADMIN') {
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'ADMIN'));
      if (admins.length <= 1) {
        return c.json(
          { error: '最後のADMINユーザーを削除することはできません。' },
          400,
        );
      }
    }

    await db.delete(users).where(eq(users.id, targetUserId));
    return c.json({ ok: true, userId: targetUserId });
  });

