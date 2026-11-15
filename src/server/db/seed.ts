import { count } from 'drizzle-orm';
import type { AppDb } from './client.ts';
import {
  users,
  auditions,
  bands,
  bandMembers,
  auditionVoters,
  scores,
} from './schema.ts';

export async function ensureSeedData(db: AppDb): Promise<void> {
  const [{ total }] = await db.select({ total: count() }).from(users);
  if (total > 0) return;

  const now = Date.now();

  await db.insert(users).values([
    {
      id: 'u-admin',
      email: 'admin@stu.kobe-u.ac.jp',
      name: '神戸 太郎 (運営委員長)',
      role: 'ADMIN',
      enrollmentYear: 2023,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-multi',
      email: 'guitarist@stu.kobe-u.ac.jp',
      name: '六甲 健太 (掛け持ち)',
      role: 'VOTER',
      enrollmentYear: 2024,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-voter1',
      email: 'bassist@stu.kobe-u.ac.jp',
      name: '灘 花子',
      role: 'VOTER',
      enrollmentYear: 2024,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-voter2',
      email: 'drummer@stu.kobe-u.ac.jp',
      name: '三宮 翔',
      role: 'VOTER',
      enrollmentYear: 2025,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-comment',
      email: 'freshman@stu.kobe-u.ac.jp',
      name: '元町 葵 (1回生/コメントのみ)',
      role: 'VOTER',
      enrollmentYear: 2026,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'u-unregistered',
      email: 'newbie@stu.kobe-u.ac.jp',
      name: '垂水 蓮 (対象外テスト)',
      role: 'VOTER',
      enrollmentYear: 2026,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(auditions).values([
    {
      id: 'aud-2027-spring',
      title: '2027 新歓ライブオーディション',
      eventDate: '2027-04-15',
      deadline: '2027-04-10T23:59',
      status: 'DRAFT',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 10.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'aud-2026-winter',
      title: '2026 冬ライブオーディション',
      eventDate: '2026-12-20',
      deadline: '2026-12-15T23:59',
      status: 'ACTIVE',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 10.0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'aud-2026-summer',
      title: '2026 夏ライブオーディション',
      eventDate: '2026-08-10',
      deadline: '2026-08-05T23:59',
      status: 'CLOSED',
      isPenaltyEnabled: true,
      aggregationMethod: 'DIFF_CORRECTION',
      standardDiff: 10.0,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(bands).values([
    // ACTIVE オーディションの出演バンド
    {
      id: 'b-win-1',
      auditionId: 'aud-2026-winter',
      name: 'The Rokko Distortion',
      performanceOrder: 1,
      penaltyDeduction: 0,
      updatedByUserId: 'u-admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'b-win-2',
      auditionId: 'aud-2026-winter',
      name: 'Portliner Echo',
      performanceOrder: 2,
      penaltyDeduction: 1.5,
      updatedByUserId: 'u-multi',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'b-win-3',
      auditionId: 'aud-2026-winter',
      name: 'Midnight Harbor',
      performanceOrder: 3,
      penaltyDeduction: 0,
      updatedByUserId: 'u-admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'b-win-4',
      auditionId: 'aud-2026-winter',
      name: 'Maya Overdrive',
      performanceOrder: 4,
      penaltyDeduction: 0,
      updatedByUserId: 'u-voter1',
      createdAt: now,
      updatedAt: now,
    },
    // DRAFT オーディションのバンド（Wiki編集テスト用）
    {
      id: 'b-spr-1',
      auditionId: 'aud-2027-spring',
      name: '新歓スペシャルセッション',
      performanceOrder: 1,
      penaltyDeduction: 0,
      updatedByUserId: 'u-voter1',
      createdAt: now,
      updatedAt: now,
    },
    // CLOSED 過去オーディションのバンド
    {
      id: 'b-sum-1',
      auditionId: 'aud-2026-summer',
      name: 'Summer Breeze Band',
      performanceOrder: 1,
      penaltyDeduction: 0,
      updatedByUserId: 'u-admin',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'b-sum-2',
      auditionId: 'aud-2026-summer',
      name: 'Nankinmachi Funk',
      performanceOrder: 2,
      penaltyDeduction: 0,
      updatedByUserId: 'u-admin',
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(bandMembers).values([
    // u-multi は b-win-1 と b-win-3 を掛け持ち
    { id: 'bm-1', bandId: 'b-win-1', userId: 'u-multi', instrument: 'Gt/Vo', createdAt: now },
    { id: 'bm-2', bandId: 'b-win-1', userId: 'u-voter2', instrument: 'Dr', createdAt: now },
    { id: 'bm-3', bandId: 'b-win-2', userId: 'u-voter1', instrument: 'Ba', createdAt: now },
    { id: 'bm-4', bandId: 'b-win-3', userId: 'u-multi', instrument: 'Gt', createdAt: now },
    { id: 'bm-5', bandId: 'b-win-4', userId: 'u-admin', instrument: 'Vo', createdAt: now },
    { id: 'bm-6', bandId: 'b-spr-1', userId: 'u-voter1', instrument: 'Ba', createdAt: now },
    { id: 'bm-7', bandId: 'b-sum-1', userId: 'u-multi', instrument: 'Gt', createdAt: now },
    { id: 'bm-8', bandId: 'b-sum-2', userId: 'u-voter1', instrument: 'Ba', createdAt: now },
  ]);

  await db.insert(auditionVoters).values([
    // 2026 冬
    { id: 'av-1', auditionId: 'aud-2026-winter', userId: 'u-admin', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true, submittedAt: now },
    { id: 'av-2', auditionId: 'aud-2026-winter', userId: 'u-multi', permissionType: 'SCORE_AND_COMMENT', isSubmitted: false, submittedAt: null },
    { id: 'av-3', auditionId: 'aud-2026-winter', userId: 'u-voter1', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true, submittedAt: now },
    { id: 'av-4', auditionId: 'aud-2026-winter', userId: 'u-voter2', permissionType: 'SCORE_AND_COMMENT', isSubmitted: false, submittedAt: null },
    { id: 'av-5', auditionId: 'aud-2026-winter', userId: 'u-comment', permissionType: 'COMMENT_ONLY', isSubmitted: true, submittedAt: now },
    // 2026 夏
    { id: 'av-6', auditionId: 'aud-2026-summer', userId: 'u-admin', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true, submittedAt: now },
    { id: 'av-7', auditionId: 'aud-2026-summer', userId: 'u-voter1', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true, submittedAt: now },
    { id: 'av-8', auditionId: 'aud-2026-summer', userId: 'u-multi', permissionType: 'SCORE_AND_COMMENT', isSubmitted: true, submittedAt: now },
  ]);

  await db.insert(scores).values([
    // u-admin (b-win-4 は自バンドなので採点対象外)
    { id: 'sc-1', auditionId: 'aud-2026-winter', bandId: 'b-win-1', evaluatorUserId: 'u-admin', techScore: 42, charmScore: 40, comment: 'リズム隊の安定感とギターの抜けるトーンが素晴らしい。', createdAt: now, updatedAt: now },
    { id: 'sc-2', auditionId: 'aud-2026-winter', bandId: 'b-win-2', evaluatorUserId: 'u-admin', techScore: 38, charmScore: 44, comment: 'ボーカルの表現力とステージングが印象的でした。', createdAt: now, updatedAt: now },
    { id: 'sc-3', auditionId: 'aud-2026-winter', bandId: 'b-win-3', evaluatorUserId: 'u-admin', techScore: 35, charmScore: 32, comment: '中盤のダイナミクスをもう少し強調すると更に良くなります。', createdAt: now, updatedAt: now },
    // u-voter1 (b-win-2 は自バンド)
    { id: 'sc-4', auditionId: 'aud-2026-winter', bandId: 'b-win-1', evaluatorUserId: 'u-voter1', techScore: 40, charmScore: 38, comment: 'サビの爆発力に引き込まれました！', createdAt: now, updatedAt: now },
    { id: 'sc-5', auditionId: 'aud-2026-winter', bandId: 'b-win-3', evaluatorUserId: 'u-voter1', techScore: 36, charmScore: 39, comment: 'グルーヴが心地よく、アレンジに工夫を感じました。', createdAt: now, updatedAt: now },
    { id: 'sc-6', auditionId: 'aud-2026-winter', bandId: 'b-win-4', evaluatorUserId: 'u-voter1', techScore: 44, charmScore: 46, comment: '圧倒的な完成度と観客の巻き込み方でした。', createdAt: now, updatedAt: now },
    // u-comment (COMMENT_ONLY)
    { id: 'sc-7', auditionId: 'aud-2026-winter', bandId: 'b-win-1', evaluatorUserId: 'u-comment', techScore: null, charmScore: null, comment: 'イントロから鳥肌が立ちました！', createdAt: now, updatedAt: now },
    { id: 'sc-8', auditionId: 'aud-2026-winter', bandId: 'b-win-2', evaluatorUserId: 'u-comment', techScore: null, charmScore: null, comment: 'ベースの音作りがかっこよかったです。', createdAt: now, updatedAt: now },
    { id: 'sc-9', auditionId: 'aud-2026-winter', bandId: 'b-win-3', evaluatorUserId: 'u-comment', techScore: null, charmScore: null, comment: 'MC含め会場の空気が最高でした。', createdAt: now, updatedAt: now },
    { id: 'sc-10', auditionId: 'aud-2026-winter', bandId: 'b-win-4', evaluatorUserId: 'u-comment', techScore: null, charmScore: null, comment: 'ライブの締めに相応しい迫力でした！', createdAt: now, updatedAt: now },
    // 2026 夏の採点データ
    { id: 'sc-11', auditionId: 'aud-2026-summer', bandId: 'b-sum-2', evaluatorUserId: 'u-multi', techScore: 41, charmScore: 43, comment: 'ホーンとファンクカッティングが抜群。', createdAt: now, updatedAt: now },
    { id: 'sc-12', auditionId: 'aud-2026-summer', bandId: 'b-sum-1', evaluatorUserId: 'u-voter1', techScore: 39, charmScore: 38, comment: '爽やかなコーラスワークが最高。', createdAt: now, updatedAt: now },
  ]);
}

