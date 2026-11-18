import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { AppEnv } from '../types.ts';
import {
  auditions,
  auditionVoters,
  bandMembers,
  bands,
  scores,
  users,
} from '../db/schema.ts';
import { requireAuth } from '../middleware/auth.ts';
import {
  loadAuditionAggregation,
  loadBandsWithMembers,
} from '../lib/audition-loader.ts';
import {
  generateBandCommentsExport,
  generateSummaryAndRawExport,
} from '../lib/export.ts';
import {
  SubmitScoresSchema,
  UpsertBandSchema,
  UpsertGeneralFeedbackSchema,
  UpsertScoreSchema,
} from '../../shared/schema/index.ts';
import type { AppDb } from '../db/client.ts';
import { isDeadlineExpired } from '../../shared/deadline.ts';
import { calculateGrade, isActiveClubGrade } from '../../shared/grade.ts';

function getBandEditBlockedError(
  audition: typeof auditions.$inferSelect,
  userRole: string,
): string | null {
  if (userRole === 'ADMIN') return null;
  if (audition.status !== 'DRAFT') {
    return 'バンド募集期間が終了しているため、一般部員によるバンド登録・編集はロックされています。';
  }
  if (isDeadlineExpired(audition.entryDeadline)) {
    return 'バンド募集締切を過ぎているため、一般部員によるバンド登録・編集はできません。';
  }
  return null;
}

function getEffectiveScoringDeadline(
  audition: typeof auditions.$inferSelect,
): string | null {
  return audition.scoringDeadline ?? audition.deadline;
}

function countUnsubmittedRequiredVoters(
  generalFeedbacks: Array<{ permissionType: string; isSubmitted: boolean }>,
): number {
  return generalFeedbacks.filter(
    (g) => g.permissionType === 'SCORE_AND_COMMENT' && !g.isSubmitted,
  ).length;
}

async function loadAuditionHighlights(db: AppDb) {
  const [activeAudition] = await db
    .select()
    .from(auditions)
    .where(eq(auditions.status, 'ACTIVE'))
    .orderBy(desc(auditions.eventDate), desc(auditions.createdAt))
    .limit(1);

  const [draftAudition] = await db
    .select()
    .from(auditions)
    .where(eq(auditions.status, 'DRAFT'))
    .orderBy(desc(auditions.eventDate), desc(auditions.createdAt))
    .limit(1);

  const [preparingAudition] = await db
    .select()
    .from(auditions)
    .where(inArray(auditions.status, ['DRAFT', 'ENTRY_CLOSED']))
    .orderBy(desc(auditions.eventDate), desc(auditions.createdAt))
    .limit(1);

  const [latestClosedAudition] = await db
    .select()
    .from(auditions)
    .where(eq(auditions.status, 'CLOSED'))
    .orderBy(desc(auditions.eventDate), desc(auditions.createdAt))
    .limit(1);

  return {
    activeAudition: activeAudition ?? null,
    draftAudition: draftAudition ?? null,
    preparingAudition: preparingAudition ?? null,
    latestClosedAudition: latestClosedAudition ?? null,
  };
}

async function loadUserScoringContext(db: AppDb, userId: string, auditionId: string) {
  const [voterEntry] = await db
    .select()
    .from(auditionVoters)
    .where(
      and(
        eq(auditionVoters.auditionId, auditionId),
        eq(auditionVoters.userId, userId),
      ),
    )
    .limit(1);

  const bandsWithMembers = await loadBandsWithMembers(db, auditionId);
  const ownBandIds = bandsWithMembers
    .filter((b) => b.members.some((m) => m.userId === userId))
    .map((b) => b.id);

  const myScores = await db
    .select({
      id: scores.id,
      bandId: scores.bandId,
      techScore: scores.techScore,
      charmScore: scores.charmScore,
      comment: scores.comment,
      updatedAt: scores.updatedAt,
    })
    .from(scores)
    .where(
      and(
        eq(scores.auditionId, auditionId),
        eq(scores.evaluatorUserId, userId),
      ),
    );

  return {
    voterEntry: voterEntry ?? null,
    bands: bandsWithMembers,
    ownBandIds,
    myScores,
  };
}

async function resolveActiveVoter(
  db: AppDb,
  auditionId: string,
  userId: string,
) {
  const [audition] = await db
    .select()
    .from(auditions)
    .where(eq(auditions.id, auditionId))
    .limit(1);

  if (!audition) {
    return { error: 'オーディションが見つかりません。', status: 404 as const };
  }
  if (audition.status !== 'ACTIVE') {
    return {
      error: '現在このオーディションは採点受付期間中ではありません。',
      status: 403 as const,
    };
  }

  const [voter] = await db
    .select()
    .from(auditionVoters)
    .where(
      and(
        eq(auditionVoters.auditionId, auditionId),
        eq(auditionVoters.userId, userId),
      ),
    )
    .limit(1);

  if (!voter) {
    return {
      error: 'このオーディションの採点・コメント対象者に登録されていません。',
      status: 403 as const,
    };
  }

  return { audition, voter };
}

export const auditionRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .get('/', async (c) => {
    const db = c.get('db');
    const list = await db
      .select()
      .from(auditions)
      .orderBy(desc(auditions.eventDate), desc(auditions.createdAt));
    return c.json({ auditions: list });
  })
  .get('/users/selectable', async (c) => {
    const db = c.get('db');
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        enrollmentYear: users.enrollmentYear,
      })
      .from(users)
      .orderBy(desc(users.enrollmentYear), asc(users.name));

    return c.json({
      users: rows
        .filter((u) => isActiveClubGrade(u.enrollmentYear))
        .map((u) => ({
          ...u,
          grade: calculateGrade(u.enrollmentYear),
        })),
    });
  })
  .get('/current', async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const highlights = await loadAuditionHighlights(db);

    if (!highlights.activeAudition) {
      return c.json({
        ...highlights,
        voterEntry: null,
        bands: [],
        ownBandIds: [],
        myScores: [],
      });
    }

    const scoringCtx = await loadUserScoringContext(
      db,
      user.id,
      highlights.activeAudition.id,
    );

    return c.json({
      ...highlights,
      ...scoringCtx,
    });
  })
  .get('/drafts', async (c) => {
    const db = c.get('db');
    const draftAuditions = await db
      .select()
      .from(auditions)
      .where(inArray(auditions.status, ['DRAFT', 'ENTRY_CLOSED']))
      .orderBy(desc(auditions.eventDate), desc(auditions.createdAt));
    return c.json({ auditions: draftAuditions });
  })
  .get('/closed', async (c) => {
    const db = c.get('db');
    const closedAuditions = await db
      .select()
      .from(auditions)
      .where(eq(auditions.status, 'CLOSED'))
      .orderBy(desc(auditions.eventDate), desc(auditions.createdAt));
    return c.json({ auditions: closedAuditions });
  })
  .get('/:id/scoring', async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const auditionId = c.req.param('id');

    const [audition] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, auditionId))
      .limit(1);

    if (!audition) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    const highlights = await loadAuditionHighlights(db);

    if (audition.status !== 'ACTIVE') {
      return c.json({
        audition,
        ...highlights,
        voterEntry: null,
        bands: [],
        ownBandIds: [],
        myScores: [],
      });
    }

    const scoringCtx = await loadUserScoringContext(db, user.id, audition.id);

    return c.json({
      audition,
      ...highlights,
      ...scoringCtx,
    });
  })
  .get('/:id/results', async (c) => {
    const db = c.get('db');
    const auditionId = c.req.param('id');

    const loaded = await loadAuditionAggregation(db, auditionId);
    if (!loaded) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    if (loaded.audition.status !== 'CLOSED') {
      return c.json(
        {
          error:
            '集計結果はステータスが「採点終了・集計」のオーディションのみ閲覧できます。',
        },
        403,
      );
    }

    const unsubmittedRequiredCount = countUnsubmittedRequiredVoters(
      loaded.aggregation.generalFeedbacks,
    );
    if (unsubmittedRequiredCount > 0) {
      return c.json(
        {
          error:
            '採点必須の対象者に未提出者がいるため、集計結果はまだ閲覧できません。',
          unsubmittedRequiredCount,
        },
        403,
      );
    }

    return c.json({
      audition: loaded.audition,
      rankings: loaded.aggregation.bandResults.map((b) => ({
        rank: b.rank,
        isTied: b.isTied,
        bandId: b.bandId,
        bandName: b.bandName,
        performanceOrder: b.performanceOrder,
        memberNames: b.memberNames,
        validVoteCount: b.validVoteCount,
        commentCount: b.commentCount,
        avgRawTech: b.avgRawTech,
        avgRawCharm: b.avgRawCharm,
        avgRawTotal: b.avgRawTotal,
        activeAvgNormTech: b.activeAvgNormTech,
        activeAvgNormCharm: b.activeAvgNormCharm,
        activePrePenaltyScore: b.activePrePenaltyScore,
        appliedPenalty: b.appliedPenalty,
        activeFinalScore: b.activeFinalScore,
      })),
      generalFeedbacks: loaded.aggregation.generalFeedbacks
        .filter((g) => g.generalFeedback.trim().length > 0)
        .map((g) => ({
          userId: g.userId,
          userName: g.userName,
          grade:
            g.enrollmentYear !== undefined
              ? calculateGrade(g.enrollmentYear)
              : undefined,
          permissionType: g.permissionType,
          submittedAt: g.submittedAt,
          generalFeedback: g.generalFeedback,
        })),
    });
  })
  .get('/:id/export', async (c) => {
    const db = c.get('db');
    const auditionId = c.req.param('id');
    const target =
      c.req.query('target') === 'band_comments'
        ? 'band_comments'
        : 'summary_and_raw';
    const format = c.req.query('format') === 'csv' ? 'csv' : 'xlsx';

    const loaded = await loadAuditionAggregation(db, auditionId);
    if (!loaded) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    if (loaded.audition.status !== 'CLOSED') {
      return c.json(
        {
          error:
            'エクスポートはステータスが「採点終了・集計」のイベントのみ利用できます。',
        },
        403,
      );
    }

    const unsubmittedRequiredCount = countUnsubmittedRequiredVoters(
      loaded.aggregation.generalFeedbacks,
    );
    if (unsubmittedRequiredCount > 0) {
      return c.json(
        {
          error:
            '採点必須の対象者に未提出者がいるため、エクスポートはまだ利用できません。',
          unsubmittedRequiredCount,
        },
        403,
      );
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
  .get('/:id/bands', async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
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
    const ownBandIds = bandsWithMembers
      .filter((b) => b.members.some((m) => m.userId === user.id))
      .map((b) => b.id);

    return c.json({
      audition,
      bands: bandsWithMembers,
      ownBandIds,
      canEditWiki:
        user.role === 'ADMIN' ||
        (audition.status === 'DRAFT' &&
          !isDeadlineExpired(audition.entryDeadline)),
    });
  })
  .post('/:id/bands', zValidator('json', UpsertBandSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
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

    const blockedError = getBandEditBlockedError(audition, user.role);
    if (blockedError) {
      return c.json({ error: blockedError }, 403);
    }

    let performanceOrder = body.performanceOrder;
    if (performanceOrder === undefined) {
      const existingBands = await db
        .select({ performanceOrder: bands.performanceOrder })
        .from(bands)
        .where(eq(bands.auditionId, auditionId));
      const maxOrder = existingBands.reduce(
        (max, b) => Math.max(max, b.performanceOrder),
        0,
      );
      performanceOrder = maxOrder + 1;
    }

    const now = Date.now();
    const bandId = crypto.randomUUID();
    await db.insert(bands).values({
      id: bandId,
      auditionId,
      name: body.name,
      performanceOrder,
      penaltyDeduction: 0,
      updatedByUserId: user.id,
      createdAt: now,
      updatedAt: now,
    });

    const uniqueMemberIds = Array.from(new Set(body.memberUserIds));
    if (uniqueMemberIds.length > 0) {
      await db.insert(bandMembers).values(
        uniqueMemberIds.map((userId) => ({
          id: crypto.randomUUID(),
          bandId,
          userId,
          instrument: null,
          createdAt: now,
        })),
      );
    }

    const allBands = await loadBandsWithMembers(db, auditionId);
    const created = allBands.find((b) => b.id === bandId);
    return c.json({ band: created }, 201);
  })
  .put('/:id/bands/:bandId', zValidator('json', UpsertBandSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const auditionId = c.req.param('id');
    const bandId = c.req.param('bandId');
    const body = c.req.valid('json');

    const [audition] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, auditionId))
      .limit(1);

    if (!audition) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    const blockedError = getBandEditBlockedError(audition, user.role);
    if (blockedError) {
      return c.json({ error: blockedError }, 403);
    }

    const [existingBand] = await db
      .select()
      .from(bands)
      .where(and(eq(bands.id, bandId), eq(bands.auditionId, auditionId)))
      .limit(1);

    if (!existingBand) {
      return c.json({ error: '対象バンドが見つかりません。' }, 404);
    }

    const now = Date.now();
    await db
      .update(bands)
      .set({
        name: body.name,
        performanceOrder: body.performanceOrder ?? existingBand.performanceOrder,
        updatedByUserId: user.id,
        updatedAt: now,
      })
      .where(eq(bands.id, bandId));

    await db.delete(bandMembers).where(eq(bandMembers.bandId, bandId));

    const uniqueMemberIds = Array.from(new Set(body.memberUserIds));
    if (uniqueMemberIds.length > 0) {
      await db.insert(bandMembers).values(
        uniqueMemberIds.map((userId) => ({
          id: crypto.randomUUID(),
          bandId,
          userId,
          instrument: null,
          createdAt: now,
        })),
      );
    }

    const allBands = await loadBandsWithMembers(db, auditionId);
    const updated = allBands.find((b) => b.id === bandId);
    return c.json({ band: updated });
  })
  .delete('/:id/bands/:bandId', async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const auditionId = c.req.param('id');
    const bandId = c.req.param('bandId');

    const [audition] = await db
      .select()
      .from(auditions)
      .where(eq(auditions.id, auditionId))
      .limit(1);

    if (!audition) {
      return c.json({ error: 'オーディションが見つかりません。' }, 404);
    }

    const blockedError = getBandEditBlockedError(audition, user.role);
    if (blockedError) {
      return c.json({ error: blockedError }, 403);
    }

    await db
      .delete(bands)
      .where(and(eq(bands.id, bandId), eq(bands.auditionId, auditionId)));

    return c.json({ ok: true });
  })
  .put('/:id/scores/:bandId', zValidator('json', UpsertScoreSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const auditionId = c.req.param('id');
    const bandId = c.req.param('bandId');
    const body = c.req.valid('json');

    const resolved = await resolveActiveVoter(db, auditionId, user.id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status);
    }
    const { audition, voter } = resolved;

    const [band] = await db
      .select()
      .from(bands)
      .where(and(eq(bands.id, bandId), eq(bands.auditionId, auditionId)))
      .limit(1);

    if (!band) {
      return c.json({ error: '対象バンドが見つかりません。' }, 404);
    }

    // 自バンド投票のサーバーサイド排除
    const [ownMember] = await db
      .select()
      .from(bandMembers)
      .where(and(eq(bandMembers.bandId, bandId), eq(bandMembers.userId, user.id)))
      .limit(1);

    if (ownMember) {
      return c.json({ error: '所属バンド（自バンド）に対する採点・コメントは送信できません。' }, 403);
    }

    const scoringExpired = isDeadlineExpired(
      getEffectiveScoringDeadline(audition),
    );
    if (scoringExpired) {
      if (voter.isSubmitted) {
        return c.json(
          {
            error:
              '採点締切を過ぎているため、提出済みの採点・コメントは修正できません。',
          },
          403,
        );
      }
      const [existingScore] = await db
        .select({ id: scores.id })
        .from(scores)
        .where(
          and(
            eq(scores.auditionId, auditionId),
            eq(scores.bandId, bandId),
            eq(scores.evaluatorUserId, user.id),
          ),
        )
        .limit(1);
      if (existingScore) {
        return c.json(
          {
            error:
              '採点締切を過ぎているため、保存済みの採点・コメントは修正できません（未入力のバンドのみ入力可能です）。',
          },
          403,
        );
      }
    }

    const commentTrimmed = body.comment.trim();
    if (!commentTrimmed) {
      return c.json({ error: 'コメントの入力は必須です。' }, 400);
    }

    let finalTech: number | null = null;
    let finalCharm: number | null = null;

    if (voter.permissionType === 'SCORE_AND_COMMENT') {
      if (body.techScore === null || body.charmScore === null) {
        return c.json({ error: '技術点と魅力点（0〜50）の両方を入力してください。' }, 400);
      }
      finalTech = body.techScore;
      finalCharm = body.charmScore;
    }

    const now = Date.now();
    await db
      .insert(scores)
      .values({
        id: crypto.randomUUID(),
        auditionId,
        bandId,
        evaluatorUserId: user.id,
        techScore: finalTech,
        charmScore: finalCharm,
        comment: commentTrimmed,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [scores.auditionId, scores.bandId, scores.evaluatorUserId],
        set: {
          techScore: finalTech,
          charmScore: finalCharm,
          comment: commentTrimmed,
          updatedAt: now,
        },
      });

    return c.json({
      ok: true,
      score: {
        bandId,
        techScore: finalTech,
        charmScore: finalCharm,
        comment: commentTrimmed,
        updatedAt: now,
      },
    });
  })
  .put(
    '/:id/general-feedback',
    zValidator('json', UpsertGeneralFeedbackSchema),
    async (c) => {
      const db = c.get('db');
      const user = c.get('user')!;
      const auditionId = c.req.param('id');
      const body = c.req.valid('json');

      const resolved = await resolveActiveVoter(db, auditionId, user.id);
      if ('error' in resolved) {
        return c.json({ error: resolved.error }, resolved.status);
      }
      const { audition, voter } = resolved;

      const scoringExpired = isDeadlineExpired(
        getEffectiveScoringDeadline(audition),
      );
      if (
        scoringExpired &&
        (voter.isSubmitted || voter.generalFeedback.trim().length > 0)
      ) {
        return c.json(
          {
            error:
              '採点締切を過ぎているため、入力済みの全体講評は修正できません。',
          },
          403,
        );
      }

      const feedbackTrimmed = body.generalFeedback.trim();
      if (!feedbackTrimmed) {
        return c.json({ error: '全体講評（総括）を入力してください。' }, 400);
      }

      await db
        .update(auditionVoters)
        .set({ generalFeedback: feedbackTrimmed })
        .where(eq(auditionVoters.id, voter.id));

      return c.json({
        ok: true,
        generalFeedback: feedbackTrimmed,
        updatedAt: Date.now(),
      });
    },
  )
  .post('/:id/scores/submit', zValidator('json', SubmitScoresSchema), async (c) => {
    const db = c.get('db');
    const user = c.get('user')!;
    const auditionId = c.req.param('id');
    const body = c.req.valid('json');

    const resolved = await resolveActiveVoter(db, auditionId, user.id);
    if ('error' in resolved) {
      return c.json({ error: resolved.error }, resolved.status);
    }
    const { audition, voter } = resolved;

    const scoringExpired = isDeadlineExpired(
      getEffectiveScoringDeadline(audition),
    );
    if (scoringExpired && voter.isSubmitted) {
      return c.json(
        {
          error: '採点締切を過ぎているため、提出済みの内容は更新できません。',
        },
        403,
      );
    }

    const bandsWithMembers = await loadBandsWithMembers(db, auditionId);
    const ownBandSet = new Set(
      bandsWithMembers
        .filter((b) => b.members.some((m) => m.userId === user.id))
        .map((b) => b.id),
    );
    const targetBands = bandsWithMembers.filter((b) => !ownBandSet.has(b.id));
    const targetBandMap = new Map(targetBands.map((b) => [b.id, b]));

    const existingScores = await db
      .select()
      .from(scores)
      .where(
        and(
          eq(scores.auditionId, auditionId),
          eq(scores.evaluatorUserId, user.id),
        ),
      );
    const existingScoreMap = new Map(existingScores.map((s) => [s.bandId, s]));

    if (
      scoringExpired &&
      voter.generalFeedback.trim().length > 0 &&
      body.generalFeedback !== undefined &&
      body.generalFeedback.trim() !== voter.generalFeedback.trim()
    ) {
      return c.json(
        {
          error:
            '採点締切を過ぎているため、保存済みの全体講評は変更できません。',
        },
        403,
      );
    }

    const itemsToUpsert: Array<{
      bandId: string;
      techScore: number | null;
      charmScore: number | null;
      comment: string;
    }> = [];

    for (const item of body.scores) {
      if (ownBandSet.has(item.bandId)) {
        // 自バンドが含まれていた場合はサーバー側で安全に無視（または拒否）
        continue;
      }
      if (!targetBandMap.has(item.bandId)) continue;

      const commentTrimmed = item.comment.trim();
      const hasScores = item.techScore !== null && item.charmScore !== null;

      if (body.markSubmitted) {
        if (!commentTrimmed) {
          return c.json(
            {
              error: `「${targetBandMap.get(item.bandId)!.name}」のコメントが未入力です。`,
            },
            400,
          );
        }
        if (voter.permissionType === 'SCORE_AND_COMMENT' && !hasScores) {
          return c.json(
            {
              error: `「${targetBandMap.get(item.bandId)!.name}」の技術点・魅力点が未入力です。`,
            },
            400,
          );
        }
      } else {
        // 途中オフライン再送時は、空データをスキップ
        if (!commentTrimmed && !hasScores) continue;
      }

      const finalTech =
        voter.permissionType === 'SCORE_AND_COMMENT' ? item.techScore : null;
      const finalCharm =
        voter.permissionType === 'SCORE_AND_COMMENT' ? item.charmScore : null;

      const existingScore = existingScoreMap.get(item.bandId);
      if (scoringExpired && existingScore) {
        const sameTech =
          (existingScore.techScore ?? null) === (finalTech ?? null);
        const sameCharm =
          (existingScore.charmScore ?? null) === (finalCharm ?? null);
        const sameComment = existingScore.comment.trim() === commentTrimmed;
        if (sameTech && sameCharm && sameComment) {
          continue;
        }
        return c.json(
          {
            error: `採点締切を過ぎているため、「${targetBandMap.get(item.bandId)!.name}」の保存済み採点・コメントは変更できません。`,
          },
          403,
        );
      }

      itemsToUpsert.push({
        bandId: item.bandId,
        techScore: finalTech,
        charmScore: finalCharm,
        comment: commentTrimmed,
      });
    }

    const now = Date.now();
    const savedBandIds = new Set<string>();

    for (const item of itemsToUpsert) {
      await db
        .insert(scores)
        .values({
          id: crypto.randomUUID(),
          auditionId,
          bandId: item.bandId,
          evaluatorUserId: user.id,
          techScore: item.techScore,
          charmScore: item.charmScore,
          comment: item.comment,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [scores.auditionId, scores.bandId, scores.evaluatorUserId],
          set: {
            techScore: item.techScore,
            charmScore: item.charmScore,
            comment: item.comment,
            updatedAt: now,
          },
        });
      savedBandIds.add(item.bandId);
    }

    if (body.markSubmitted) {
      // 全対象バンド分のレコードが揃っているか検証
      const currentScores = await db
        .select()
        .from(scores)
        .where(
          and(
            eq(scores.auditionId, auditionId),
            eq(scores.evaluatorUserId, user.id),
          ),
        );
      const scoreMap = new Map(currentScores.map((s) => [s.bandId, s]));

      const missingBands: string[] = [];
      for (const band of targetBands) {
        const s = scoreMap.get(band.id);
        if (!s || !s.comment.trim()) {
          missingBands.push(band.name);
          continue;
        }
        if (
          voter.permissionType === 'SCORE_AND_COMMENT' &&
          (s.techScore === null || s.charmScore === null)
        ) {
          missingBands.push(band.name);
        }
      }

      if (missingBands.length > 0) {
        return c.json(
          {
            error: `未完了のバンドがあります（${missingBands.join('、')}）。すべて入力してから最終提出してください。`,
          },
          400,
        );
      }

      const finalGeneralFeedback =
        body.generalFeedback !== undefined
          ? body.generalFeedback.trim()
          : voter.generalFeedback.trim();

      if (!finalGeneralFeedback) {
        return c.json(
          {
            error: '全体講評（総括）が未入力です。入力してから最終提出してください。',
          },
          400,
        );
      }

      await db
        .update(auditionVoters)
        .set({
          generalFeedback: finalGeneralFeedback,
          isSubmitted: true,
          submittedAt: now,
        })
        .where(eq(auditionVoters.id, voter.id));
    } else if (
      body.generalFeedback !== undefined &&
      body.generalFeedback.trim().length > 0 &&
      !(scoringExpired && voter.generalFeedback.trim().length > 0)
    ) {
      await db
        .update(auditionVoters)
        .set({ generalFeedback: body.generalFeedback.trim() })
        .where(eq(auditionVoters.id, voter.id));
    }

    return c.json({
      ok: true,
      isSubmitted: body.markSubmitted,
      submittedAt: body.markSubmitted ? now : voter.submittedAt,
      savedCount: savedBandIds.size,
    });
  });

