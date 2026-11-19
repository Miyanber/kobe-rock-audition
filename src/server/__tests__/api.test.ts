import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../app.ts';
import { createInMemoryTestDb } from '../db/local.ts';
import { ensureSeedData } from '../db/seed.ts';
import { buildRealisticSeedData } from '../db/seed-data.ts';
import type { AppDb } from '../db/client.ts';

function extractSessionCookie(res: Response): string {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/kra_session=[^;]+/);
  return match ? match[0] : '';
}

describe('Hono API & RBAC & Export 結合テスト', () => {
  let db: AppDb;
  let app: ReturnType<typeof createApp>['app'];

  beforeEach(async () => {
    db = createInMemoryTestDb();
    await ensureSeedData(db);
    app = createApp(() => db).app;
  });

  async function loginAs(userId: string): Promise<string> {
    const res = await app.request('/api/auth/dev-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    expect(res.status).toBe(200);
    return extractSessionCookie(res);
  }

  it('自バンド投票のサーバーサイド拒否とCOMMENT_ONLYの点数強制NULL化が動作する', async () => {
    // u-multi は b-win-1 と b-win-3 を掛け持ちしている
    const multiCookie = await loginAs('u-multi');

    const ownBandRes = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: multiCookie,
        },
        body: JSON.stringify({ techScore: 40, charmScore: 40, comment: '自バンド不正テスト' }),
      },
    );
    expect(ownBandRes.status).toBe(403);

    const ownBand2Res = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-3',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: multiCookie,
        },
        body: JSON.stringify({ techScore: 40, charmScore: 40, comment: '掛け持ち自バンド2' }),
      },
    );
    expect(ownBand2Res.status).toBe(403);

    // 他バンド b-win-2 へは正常に保存できる
    const otherBandRes = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-2',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: multiCookie,
        },
        body: JSON.stringify({ techScore: 42, charmScore: 38, comment: 'とても良かった' }),
      },
    );
    expect(otherBandRes.status).toBe(200);

    // u-comment (COMMENT_ONLY) が数値を送ってもサーバー側で null に正規化される
    const commentCookie = await loginAs('u-comment');
    const commentRes = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: commentCookie,
        },
        body: JSON.stringify({ techScore: 50, charmScore: 50, comment: 'コメントのみ確認' }),
      },
    );
    expect(commentRes.status).toBe(200);
    const data = (await commentRes.json()) as {
      score: { techScore: number | null; charmScore: number | null };
    };
    expect(data.score.techScore).toBeNull();
    expect(data.score.charmScore).toBeNull();
  });

  it('DRAFT期間のみWiki編集が一般部員に許可され、ACTIVE切替で自動ロック＋既存ACTIVEがCLOSEDになる', async () => {
    const voterCookie = await loginAs('u-voter1');
    const adminCookie = await loginAs('u-admin');

    // DRAFT (aud-2027-spring) へ一般部員が新規バンド追加可能
    const createDraftRes = await app.request('/api/auditions/aud-2027-spring/bands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: voterCookie,
      },
      body: JSON.stringify({
        name: 'Wiki Test Band',
        performanceOrder: 2,
        memberUserIds: ['u-voter1', 'u-voter2'],
      }),
    });
    expect(createDraftRes.status).toBe(201);

    // ACTIVE (aud-2026-winter) へ一般部員が追加しようとすると 403 ロック
    const createActiveRes = await app.request('/api/auditions/aud-2026-winter/bands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: voterCookie,
      },
      body: JSON.stringify({
        name: 'Locked Band',
        performanceOrder: 9,
        memberUserIds: [],
      }),
    });
    expect(createActiveRes.status).toBe(403);

    // ADMIN が aud-2027-spring を ACTIVE に切り替えると、aud-2026-winter が自動 CLOSED になる
    const activateRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          status: 'ACTIVE',
          scoringDeadline: '2027-04-20T23:59',
        }),
      },
    );
    expect(activateRes.status).toBe(200);
    const actData = (await activateRes.json()) as {
      auditions: Array<{ id: string; status: string }>;
    };
    expect(actData.auditions.find((a) => a.id === 'aud-2027-spring')?.status).toBe('ACTIVE');
    expect(actData.auditions.find((a) => a.id === 'aud-2026-winter')?.status).toBe('CLOSED');

    // ACTIVE に変わった直後から、一般部員は aud-2027-spring のバンド編集ができなくなる
    const lockedAfterActive = await app.request(
      '/api/auditions/aud-2027-spring/bands',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voterCookie,
        },
        body: JSON.stringify({
          name: 'Too Late Band',
          performanceOrder: 3,
          memberUserIds: [],
        }),
      },
    );
    expect(lockedAfterActive.status).toBe(403);
  });

  it('ENTRY_CLOSED（募集締切・調整中）では一般部員のバンド編集・採点が禁止され、一覧閲覧とADMIN編集は可能', async () => {
    const voterCookie = await loginAs('u-voter1');
    const adminCookie = await loginAs('u-admin');

    // aud-2027-spring を ENTRY_CLOSED に切替
    const closeEntryRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ status: 'ENTRY_CLOSED' }),
      },
    );
    expect(closeEntryRes.status).toBe(200);
    const closeEntryData = (await closeEntryRes.json()) as {
      audition: { status: string };
      auditions: Array<{ id: string; status: string }>;
    };
    expect(closeEntryData.audition.status).toBe('ENTRY_CLOSED');
    // 既存の ACTIVE は影響を受けない
    expect(closeEntryData.auditions.find((a) => a.id === 'aud-2026-winter')?.status).toBe('ACTIVE');

    // 一般部員からの新規バンド追加・既存バンド編集は 403 ロック
    const voterAddRes = await app.request('/api/auditions/aud-2027-spring/bands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: voterCookie,
      },
      body: JSON.stringify({
        name: 'Blocked Entry Band',
        performanceOrder: 2,
        memberUserIds: [],
      }),
    });
    expect(voterAddRes.status).toBe(403);

    const voterEditRes = await app.request(
      '/api/auditions/aud-2027-spring/bands/b-spr-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voterCookie,
        },
        body: JSON.stringify({
          name: 'Tampered Name',
          performanceOrder: 1,
          memberUserIds: [],
        }),
      },
    );
    expect(voterEditRes.status).toBe(403);

    // ADMIN によるバンド編集は可能
    const adminEditRes = await app.request(
      '/api/auditions/aud-2027-spring/bands/b-spr-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          name: 'Adjusted Spring Band',
          performanceOrder: 1,
          memberUserIds: ['u-multi'],
        }),
      },
    );
    expect(adminEditRes.status).toBe(200);

    // ENTRY_CLOSED 中は採点送信不可 (403)
    const voterScoreRes = await app.request(
      '/api/auditions/aud-2027-spring/scores/b-spr-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voterCookie,
        },
        body: JSON.stringify({
          techScore: 30,
          charmScore: 30,
          comment: 'まだ採点期間外',
        }),
      },
    );
    expect(voterScoreRes.status).toBe(403);

    // 一般部員のバンド一覧取得 (/drafts, /current) に含まれ、canEditWiki は false
    const draftsRes = await app.request('/api/auditions/drafts', {
      headers: { Cookie: voterCookie },
    });
    expect(draftsRes.status).toBe(200);
    const draftsBody = (await draftsRes.json()) as {
      auditions: Array<{ id: string; status: string }>;
    };
    expect(draftsBody.auditions.some((a) => a.id === 'aud-2027-spring' && a.status === 'ENTRY_CLOSED')).toBe(true);

    const bandsRes = await app.request('/api/auditions/aud-2027-spring/bands', {
      headers: { Cookie: voterCookie },
    });
    expect(bandsRes.status).toBe(200);
    const bandsBody = (await bandsRes.json()) as { canEditWiki: boolean };
    expect(bandsBody.canEditWiki).toBe(false);

    const currentRes = await app.request('/api/auditions/current', {
      headers: { Cookie: voterCookie },
    });
    expect(currentRes.status).toBe(200);
    const currentBody = (await currentRes.json()) as {
      preparingAudition: { id: string; status: string } | null;
    };
    expect(currentBody.preparingAudition?.id).toBe('aud-2027-spring');
    expect(currentBody.preparingAudition?.status).toBe('ENTRY_CLOSED');
  });

  it('2種類のExcelファイル（集計＆生データ＆全体講評 / バンド別講評＋全体講評）が仕様通りのシート構成で生成される', async () => {
    const adminCookie = await loginAs('u-admin');

    // ファイル1: 集計結果 & Rawデータ & 全体講評 (3シート)
    const res1 = await app.request(
      '/api/admin/auditions/aud-2026-winter/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: adminCookie } },
    );
    expect(res1.status).toBe(200);
    const wb1 = XLSX.read(await res1.arrayBuffer(), { type: 'array' });
    expect(wb1.SheetNames).toEqual([
      '総合ランキング集計',
      '全採点Rawデータ_補正過程',
      '全体講評',
    ]);
    const wb1FeedbackRows = XLSX.utils.sheet_to_json<string[]>(
      wb1.Sheets['全体講評'],
      { header: 1 },
    );
    expect(wb1FeedbackRows[2]).toEqual([
      '採点者名',
      '回生',
      '権限区分',
      '提出状況',
      '提出日時',
      '全体講評',
    ]);
    expect(wb1FeedbackRows.length).toBeGreaterThan(3);

    // ファイル2: バンド別講評シート (4バンド + 全体講評 = 5シート)
    const res2 = await app.request(
      '/api/admin/auditions/aud-2026-winter/export?target=band_comments&format=xlsx',
      { headers: { Cookie: adminCookie } },
    );
    expect(res2.status).toBe(200);
    const wb2 = XLSX.read(await res2.arrayBuffer(), { type: 'array' });
    expect(wb2.SheetNames.length).toBe(5);
    expect(wb2.SheetNames[0]).toContain('01_The Rokko Distortion');
    expect(wb2.SheetNames[4]).toBe('全体講評');

    // バンド別シートのヘッダーに正規化後魅力点・技術点・合計点・コメントが含まれていること
    const firstSheetRows = XLSX.utils.sheet_to_json<string[]>(
      wb2.Sheets[wb2.SheetNames[0]],
      { header: 1 },
    );
    expect(firstSheetRows[4]).toEqual([
      '採点者名',
      '権限区分',
      '正規化後_魅力点',
      '正規化後_技術点',
      '正規化後_合計点',
      'コメント',
    ]);

    const wb2FeedbackRows = XLSX.utils.sheet_to_json<string[]>(
      wb2.Sheets['全体講評'],
      { header: 1 },
    );
    expect(wb2FeedbackRows[2]).toEqual([
      '採点者名',
      '回生',
      '権限区分',
      '提出状況',
      '提出日時',
      '全体講評',
    ]);

    // CSV 出力にも全体講評が含まれること
    const csvRes2 = await app.request(
      '/api/admin/auditions/aud-2026-winter/export?target=band_comments&format=csv',
      { headers: { Cookie: adminCookie } },
    );
    expect(csvRes2.status).toBe(200);
    const csvText2 = await csvRes2.text();
    expect(csvText2).toContain('=== 全体講評 ===');
  });

  it('全体講評の保存・最終提出時の必須バリデーション・管理画面取得と非公開制御が動作する', async () => {
    const unregisteredCookie = await loginAs('u-unregistered');
    const voter2Cookie = await loginAs('u-voter2');
    const adminCookie = await loginAs('u-admin');

    // 未登録ユーザーは 403
    const unregRes = await app.request(
      '/api/auditions/aud-2026-winter/general-feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: unregisteredCookie,
        },
        body: JSON.stringify({ generalFeedback: '不正な講評' }),
      },
    );
    expect(unregRes.status).toBe(403);

    // 非ACTIVEオーディションは 403
    const draftRes = await app.request(
      '/api/auditions/aud-2027-spring/general-feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({ generalFeedback: '受付期間外' }),
      },
    );
    expect(draftRes.status).toBe(403);

    // 空文字の全体講評単体保存は 400
    const emptySaveRes = await app.request(
      '/api/auditions/aud-2026-winter/general-feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({ generalFeedback: '   ' }),
      },
    );
    expect(emptySaveRes.status).toBe(400);

    // u-voter2 (b-win-1所属) が他3バンドを入力済みでも、全体講評が空なら最終提出 400
    const missingFeedbackSubmitRes = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 40, charmScore: 40, comment: '良い演奏' },
            { bandId: 'b-win-3', techScore: 38, charmScore: 39, comment: '楽しい' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 43, comment: '圧巻' },
          ],
          generalFeedback: '',
          markSubmitted: true,
        }),
      },
    );
    expect(missingFeedbackSubmitRes.status).toBe(400);

    // 全体講評を記入して最終提出すると 200
    const feedbackText = '全バンド通して非常に熱量のあるステージでした！';
    const validSubmitRes = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 40, charmScore: 40, comment: '良い演奏' },
            { bandId: 'b-win-3', techScore: 38, charmScore: 39, comment: '楽しい' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 43, comment: '圧巻' },
          ],
          generalFeedback: feedbackText,
          markSubmitted: true,
        }),
      },
    );
    expect(validSubmitRes.status).toBe(200);

    // /current で本人の generalFeedback が取得できること
    const currentRes = await app.request('/api/auditions/current', {
      headers: { Cookie: voter2Cookie },
    });
    expect(currentRes.status).toBe(200);
    const currentBody = (await currentRes.json()) as {
      voterEntry: { generalFeedback: string; isSubmitted: boolean } | null;
    };
    expect(currentBody.voterEntry?.isSubmitted).toBe(true);
    expect(currentBody.voterEntry?.generalFeedback).toBe(feedbackText);

    // PUT /general-feedback での再編集・単体保存が動作すること
    const updatedFeedbackText = '追記：転換もスムーズで素晴らしかったです。';
    const putFeedbackRes = await app.request(
      '/api/auditions/aud-2026-winter/general-feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({ generalFeedback: updatedFeedbackText }),
      },
    );
    expect(putFeedbackRes.status).toBe(200);

    // 管理画面 (/voters, /results) に反映されること
    const adminVotersRes = await app.request(
      '/api/admin/auditions/aud-2026-winter/voters',
      { headers: { Cookie: adminCookie } },
    );
    expect(adminVotersRes.status).toBe(200);
    const adminVotersBody = (await adminVotersRes.json()) as {
      voters: Array<{ userId: string; generalFeedback: string }>;
    };
    expect(
      adminVotersBody.voters.find((v) => v.userId === 'u-voter2')?.generalFeedback,
    ).toBe(updatedFeedbackText);

    const adminResultsRes = await app.request(
      '/api/admin/auditions/aud-2026-winter/results',
      { headers: { Cookie: adminCookie } },
    );
    expect(adminResultsRes.status).toBe(200);
    const adminResultsBody = (await adminResultsRes.json()) as {
      aggregation: {
        generalFeedbacks: Array<{ userId: string; generalFeedback: string }>;
      };
    };
    expect(
      adminResultsBody.aggregation.generalFeedbacks.find(
        (g) => g.userId === 'u-voter2',
      )?.generalFeedback,
    ).toBe(updatedFeedbackText);
  });

  it('ADMINはオーディションと部員を削除でき、自分自身の削除は拒否される', async () => {
    const adminCookie = await loginAs('u-admin');
    const voterCookie = await loginAs('u-voter1');

    // VOTERは削除不可
    const forbiddenAuditionDelete = await app.request(
      '/api/admin/auditions/aud-2026-summer',
      { method: 'DELETE', headers: { Cookie: voterCookie } },
    );
    expect(forbiddenAuditionDelete.status).toBe(403);

    // ADMINはオーディション削除可能
    const delAuditionRes = await app.request(
      '/api/admin/auditions/aud-2026-summer',
      { method: 'DELETE', headers: { Cookie: adminCookie } },
    );
    expect(delAuditionRes.status).toBe(200);

    const afterListRes = await app.request('/api/admin/auditions', {
      headers: { Cookie: adminCookie },
    });
    const afterList = (await afterListRes.json()) as {
      auditions: Array<{ id: string }>;
    };
    expect(afterList.auditions.some((a) => a.id === 'aud-2026-summer')).toBe(
      false,
    );

    // 自分自身の削除は400
    const selfDeleteRes = await app.request('/api/admin/users/u-admin', {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    expect(selfDeleteRes.status).toBe(400);

    // 他部員の削除は200
    const delUserRes = await app.request('/api/admin/users/u-unregistered', {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });
    expect(delUserRes.status).toBe(200);

    const usersRes = await app.request('/api/admin/users', {
      headers: { Cookie: adminCookie },
    });
    const usersBody = (await usersRes.json()) as {
      users: Array<{ id: string }>;
    };
    expect(usersBody.users.some((u) => u.id === 'u-unregistered')).toBe(false);
  });

  it('VOTERはCLOSEDのオーディションのみ集計一覧と順位を閲覧でき、個別採点詳細や非CLOSED回は閲覧できない', async () => {
    const voterCookie = await loginAs('u-voter1');

    // /api/auditions/closed は CLOSED のみ返す
    const closedListRes = await app.request('/api/auditions/closed', {
      headers: { Cookie: voterCookie },
    });
    expect(closedListRes.status).toBe(200);
    const closedListBody = (await closedListRes.json()) as {
      auditions: Array<{ id: string; status: string }>;
    };
    expect(closedListBody.auditions.length).toBeGreaterThan(0);
    expect(closedListBody.auditions.every((a) => a.status === 'CLOSED')).toBe(true);
    expect(closedListBody.auditions.some((a) => a.id === 'aud-2026-summer')).toBe(true);

    // CLOSED オーディションの順位閲覧は 200 かつ個別評価詳細を含まない
    const closedResultsRes = await app.request(
      '/api/auditions/aud-2026-summer/results',
      { headers: { Cookie: voterCookie } },
    );
    expect(closedResultsRes.status).toBe(200);
    const closedResultsBody = (await closedResultsRes.json()) as {
      audition: { id: string; status: string };
      rankings: Array<{ rank: number; bandName: string; activeFinalScore: number }>;
      generalFeedbacks: Array<{ userId: string; userName: string; generalFeedback: string; email?: string }>;
      aggregation?: unknown;
      voteRecords?: unknown;
      evaluatorStats?: unknown;
    };
    expect(closedResultsBody.audition.id).toBe('aud-2026-summer');
    expect(closedResultsBody.rankings.length).toBeGreaterThan(0);
    expect(closedResultsBody.rankings[0].rank).toBe(1);
    expect(closedResultsBody.generalFeedbacks.length).toBeGreaterThan(0);
    expect(closedResultsBody.generalFeedbacks.every((g) => g.email === undefined)).toBe(true);
    expect(closedResultsBody.aggregation).toBeUndefined();
    expect(closedResultsBody.voteRecords).toBeUndefined();
    expect(closedResultsBody.evaluatorStats).toBeUndefined();

    // ACTIVE / DRAFT オーディションの結果は 403 で拒否される
    const activeResultsRes = await app.request(
      '/api/auditions/aud-2026-winter/results',
      { headers: { Cookie: voterCookie } },
    );
    expect(activeResultsRes.status).toBe(403);

    const draftResultsRes = await app.request(
      '/api/auditions/aud-2027-spring/results',
      { headers: { Cookie: voterCookie } },
    );
    expect(draftResultsRes.status).toBe(403);

    // CLOSED オーディションは一般部員も Excel エクスポート可能、ACTIVE は 403
    const voterExportOk = await app.request(
      '/api/auditions/aud-2026-summer/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: voterCookie } },
    );
    expect(voterExportOk.status).toBe(200);
    expect(voterExportOk.headers.get('content-type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const voterExportForbidden = await app.request(
      '/api/auditions/aud-2026-winter/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: voterCookie } },
    );
    expect(voterExportForbidden.status).toBe(403);
  });

  it('BY_IDSでの一括権限付与とチャンク分割を伴う一括解除が正常に動作する', async () => {
    const adminCookie = await loginAs('u-admin');

    // 1) ASSIGN by IDs
    const assignRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/voters/bulk',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          mode: 'BY_IDS',
          userIds: ['u-voter1', 'u-comment'],
          permissionType: 'COMMENT_ONLY',
          action: 'ASSIGN',
        }),
      },
    );
    expect(assignRes.status).toBe(200);
    const assignBody = (await assignRes.json()) as { affectedCount: number };
    expect(assignBody.affectedCount).toBe(2);

    const listAfterAssignRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/voters',
      { headers: { Cookie: adminCookie } },
    );
    const listAfterAssign = (await listAfterAssignRes.json()) as {
      voters: Array<{ userId: string; permissionType: string }>;
    };
    expect(
      listAfterAssign.voters.find((v) => v.userId === 'u-voter1')?.permissionType,
    ).toBe('COMMENT_ONLY');
    expect(
      listAfterAssign.voters.find((v) => v.userId === 'u-comment')?.permissionType,
    ).toBe('COMMENT_ONLY');

    // 2) REMOVE by IDs with > 50 IDs spanning chunk boundary
    const manyIds = [
      'u-voter1',
      ...Array.from({ length: 55 }, (_, idx) => `u-dummy-${idx}`),
      'u-comment',
    ];
    const removeRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/voters/bulk',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          mode: 'BY_IDS',
          userIds: manyIds,
          action: 'REMOVE',
        }),
      },
    );
    expect(removeRes.status).toBe(200);

    const listAfterRemoveRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/voters',
      { headers: { Cookie: adminCookie } },
    );
    const listAfterRemove = (await listAfterRemoveRes.json()) as {
      voters: Array<{ userId: string }>;
    };
    expect(listAfterRemove.voters.some((v) => v.userId === 'u-voter1')).toBe(false);
    expect(listAfterRemove.voters.some((v) => v.userId === 'u-comment')).toBe(false);
  });

  it('バンド追加時の出演順自動採番と、管理者による出演順一括並び替え（PUT /bands/order）が正しく動作する', async () => {
    const voterCookie = await loginAs('u-voter1');
    const adminCookie = await loginAs('u-admin');

    // DRAFT で performanceOrder を省略してバンドを追加すると末尾(2)に採番される
    const createRes = await app.request('/api/auditions/aud-2027-spring/bands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: voterCookie,
      },
      body: JSON.stringify({
        name: 'Auto Order Band',
        memberUserIds: ['u-voter1'],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdData = (await createRes.json()) as {
      band: { id: string; performanceOrder: number };
    };
    expect(createdData.band.performanceOrder).toBe(2);

    // もう1バンド追加 (3)
    const createRes2 = await app.request('/api/auditions/aud-2027-spring/bands', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: voterCookie,
      },
      body: JSON.stringify({
        name: 'Third Band',
        memberUserIds: [],
      }),
    });
    expect(createRes2.status).toBe(201);
    const createdData2 = (await createRes2.json()) as {
      band: { id: string; performanceOrder: number };
    };
    expect(createdData2.band.performanceOrder).toBe(3);

    // 一般部員は並び替え API を呼べない (403)
    const forbiddenRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/bands/order',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voterCookie,
        },
        body: JSON.stringify({
          bandIds: [createdData2.band.id, createdData.band.id, 'b-spr-1'],
        }),
      },
    );
    expect(forbiddenRes.status).toBe(403);

    // 存在しないオーディション (404)
    const notFoundRes = await app.request(
      '/api/admin/auditions/aud-nonexistent/bands/order',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ bandIds: ['b-spr-1'] }),
      },
    );
    expect(notFoundRes.status).toBe(404);

    // バンドIDの重複・過不足 (400)
    const dupRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/bands/order',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          bandIds: ['b-spr-1', 'b-spr-1', createdData.band.id],
        }),
      },
    );
    expect(dupRes.status).toBe(400);

    const mismatchRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/bands/order',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          bandIds: ['b-spr-1', createdData.band.id],
        }),
      },
    );
    expect(mismatchRes.status).toBe(400);

    // 管理者による正常な並び替え
    const newOrderIds = [createdData2.band.id, 'b-spr-1', createdData.band.id];
    const reorderRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/bands/order',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ bandIds: newOrderIds }),
      },
    );
    expect(reorderRes.status).toBe(200);
    const reorderData = (await reorderRes.json()) as {
      bands: Array<{ id: string; performanceOrder: number }>;
    };
    expect(reorderData.bands.map((b) => b.id)).toEqual(newOrderIds);
    expect(reorderData.bands.map((b) => b.performanceOrder)).toEqual([1, 2, 3]);

    // GET /bands でも新しい順番で返ること
    const getBandsRes = await app.request('/api/auditions/aud-2027-spring/bands', {
      headers: { Cookie: voterCookie },
    });
    expect(getBandsRes.status).toBe(200);
    const getBandsData = (await getBandsRes.json()) as {
      bands: Array<{ id: string; performanceOrder: number }>;
    };
    expect(getBandsData.bands.map((b) => b.id)).toEqual(newOrderIds);
  });

  it('一般部員向けオーディション一覧と指定オーディション別採点コンテキスト取得APIが正しく動作する', async () => {
    const unauthRes = await app.request('/api/auditions');
    expect(unauthRes.status).toBe(401);

    const multiCookie = await loginAs('u-multi');

    const listRes = await app.request('/api/auditions', {
      headers: { Cookie: multiCookie },
    });
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as {
      auditions: Array<{ id: string; status: string; eventDate: string }>;
    };
    expect(listData.auditions.length).toBeGreaterThanOrEqual(2);
    // 開催日降順になっていること
    for (let i = 1; i < listData.auditions.length; i++) {
      expect(
        listData.auditions[i - 1].eventDate >= listData.auditions[i].eventDate,
      ).toBe(true);
    }

    // ACTIVE な aud-2026-winter の採点コンテキスト取得
    const activeRes = await app.request(
      '/api/auditions/aud-2026-winter/scoring',
      { headers: { Cookie: multiCookie } },
    );
    expect(activeRes.status).toBe(200);
    const activeData = (await activeRes.json()) as {
      audition: { id: string; status: string };
      voterEntry: { userId: string } | null;
      bands: Array<{ id: string }>;
      ownBandIds: string[];
    };
    expect(activeData.audition.id).toBe('aud-2026-winter');
    expect(activeData.audition.status).toBe('ACTIVE');
    expect(activeData.voterEntry?.userId).toBe('u-multi');
    expect(activeData.bands.length).toBeGreaterThan(0);
    expect(activeData.ownBandIds).toContain('b-win-1');

    // DRAFT な aud-2027-spring は採点不可状態 + activeAudition 案内を返す
    const draftRes = await app.request(
      '/api/auditions/aud-2027-spring/scoring',
      { headers: { Cookie: multiCookie } },
    );
    expect(draftRes.status).toBe(200);
    const draftData = (await draftRes.json()) as {
      audition: { id: string; status: string };
      activeAudition: { id: string } | null;
      voterEntry: null;
      bands: unknown[];
    };
    expect(draftData.audition.id).toBe('aud-2027-spring');
    expect(draftData.audition.status).toBe('DRAFT');
    expect(draftData.activeAudition?.id).toBe('aud-2026-winter');
    expect(draftData.voterEntry).toBeNull();
    expect(draftData.bands).toEqual([]);

    // 存在しないIDは 404
    const notFoundRes = await app.request(
      '/api/auditions/aud-not-found/scoring',
      { headers: { Cookie: multiCookie } },
    );
    expect(notFoundRes.status).toBe(404);
  });

  it('新規オーディション作成時に短い英数字8文字のIDが生成される', async () => {
    const adminCookie = await loginAs('u-admin');
    const createRes = await app.request('/api/admin/auditions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        title: '2027 新歓ライブ',
        eventDate: '2027-04-20',
        entryDeadline: '2027-04-15T23:59',
      }),
    });
    expect(createRes.status).toBe(201);
    const data = (await createRes.json()) as {
      audition: { id: string; title: string };
    };
    expect(data.audition.id).toMatch(/^[a-hj-km-np-z2-9]{8}$/);
  });

  it('バンドメンバー候補APIは4回生以上を除外しメールアドレスを返さない', async () => {
    const adminCookie = await loginAs('u-admin');
    // 4回生以上 (enrollmentYear=2022) の引退部員を1名追加
    const bulkRes = await app.request('/api/admin/users/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        csvText: '引退 太郎,ob-retired@stu.kobe-u.ac.jp,2022,VOTER',
      }),
    });
    expect(bulkRes.status).toBe(200);

    const voterCookie = await loginAs('u-voter1');
    const selectableRes = await app.request('/api/auditions/users/selectable', {
      headers: { Cookie: voterCookie },
    });
    expect(selectableRes.status).toBe(200);
    const selectableData = (await selectableRes.json()) as {
      users: Array<{ id: string; name: string; grade: number; email?: string }>;
    };
    expect(selectableData.users.length).toBeGreaterThan(0);
    expect(selectableData.users.some((u) => u.name === '引退 太郎')).toBe(false);
    expect(selectableData.users.every((u) => u.grade <= 3)).toBe(true);
    expect(selectableData.users.every((u) => u.email === undefined)).toBe(true);

    // /bands, /scoring, /current の各バンドメンバーにも email が含まれないこと
    const [bandsRes, scoringRes, currentRes] = await Promise.all([
      app.request('/api/auditions/aud-2026-winter/bands', {
        headers: { Cookie: voterCookie },
      }),
      app.request('/api/auditions/aud-2026-winter/scoring', {
        headers: { Cookie: voterCookie },
      }),
      app.request('/api/auditions/current', {
        headers: { Cookie: voterCookie },
      }),
    ]);
    for (const res of [bandsRes, scoringRes, currentRes]) {
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        bands: Array<{ members: Array<{ email?: string }> }>;
      };
      expect(body.bands.length).toBeGreaterThan(0);
      for (const band of body.bands) {
        expect(band.members.every((m) => m.email === undefined)).toBe(true);
      }
    }
  });

  it('バンド募集締切の必須化・採点締切設定・締切超過後の権限制御（未入力のみ許可）が動作する', async () => {
    const adminCookie = await loginAs('u-admin');
    const voter1Cookie = await loginAs('u-voter1');
    const voter2Cookie = await loginAs('u-voter2');

    // 1) entryDeadline 未指定でのイベント作成は 400
    const missingEntryDeadlineRes = await app.request('/api/admin/auditions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        title: '締切未指定イベント',
        eventDate: '2027-05-01',
      }),
    });
    expect(missingEntryDeadlineRes.status).toBe(400);

    // 2) scoringDeadline 未指定での ACTIVE 切替は 400
    const missingScoringDeadlineRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ status: 'ACTIVE' }),
      },
    );
    expect(missingScoringDeadlineRes.status).toBe(400);

    // scoringDeadline 指定で ACTIVE 切替成功 (200)
    const activateOkRes = await app.request(
      '/api/admin/auditions/aud-2027-spring/status',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          status: 'ACTIVE',
          scoringDeadline: '2027-04-20T23:59',
        }),
      },
    );
    expect(activateOkRes.status).toBe(200);
    const activateOkBody = (await activateOkRes.json()) as {
      audition: { status: string; scoringDeadline: string | null };
    };
    expect(activateOkBody.audition.status).toBe('ACTIVE');
    expect(activateOkBody.audition.scoringDeadline).toBe('2027-04-20T23:59');

    // 3) entryDeadline 超過後、DRAFT でも一般部員のバンド追加・編集・削除は 403、ADMIN は可能
    const expiredDraftCreate = await app.request('/api/admin/auditions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        title: '募集締切超過イベント',
        eventDate: '2026-11-25',
        entryDeadline: '2020-01-01T23:59',
      }),
    });
    expect(expiredDraftCreate.status).toBe(201);
    const expiredDraftBody = (await expiredDraftCreate.json()) as {
      audition: { id: string };
    };
    const expiredDraftId = expiredDraftBody.audition.id;

    const bandsCtxRes = await app.request(
      `/api/auditions/${expiredDraftId}/bands`,
      { headers: { Cookie: voter1Cookie } },
    );
    expect(bandsCtxRes.status).toBe(200);
    const bandsCtx = (await bandsCtxRes.json()) as { canEditWiki: boolean };
    expect(bandsCtx.canEditWiki).toBe(false);

    const voterBandAddRes = await app.request(
      `/api/auditions/${expiredDraftId}/bands`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter1Cookie,
        },
        body: JSON.stringify({ name: 'Late Band', memberUserIds: [] }),
      },
    );
    expect(voterBandAddRes.status).toBe(403);

    const adminBandAddRes = await app.request(
      `/api/auditions/${expiredDraftId}/bands`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({ name: 'Admin Added Band', memberUserIds: [] }),
      },
    );
    expect(adminBandAddRes.status).toBe(201);
    const adminAdded = (await adminBandAddRes.json()) as {
      band: { id: string };
    };

    const voterBandEditRes = await app.request(
      `/api/auditions/${expiredDraftId}/bands/${adminAdded.band.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter1Cookie,
        },
        body: JSON.stringify({ name: 'Edited By Voter', memberUserIds: [] }),
      },
    );
    expect(voterBandEditRes.status).toBe(403);

    const voterBandDeleteRes = await app.request(
      `/api/auditions/${expiredDraftId}/bands/${adminAdded.band.id}`,
      {
        method: 'DELETE',
        headers: { Cookie: voter1Cookie },
      },
    );
    expect(voterBandDeleteRes.status).toBe(403);

    // 4) 採点締切超過後は「未入力のみ新規保存・初回提出可」「保存済み・提出済みは上書き不可(403)」
    // まず aud-2026-winter を再び ACTIVE に戻し、u-voter2 が b-win-2 だけ締切前に保存、u-voter1 は提出済みの状態にする
    await app.request('/api/admin/auditions/aud-2026-winter/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        scoringDeadline: '2027-01-01T23:59',
      }),
    });

    const preDeadlineSave = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-2',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          techScore: 40,
          charmScore: 41,
          comment: '締切前保存',
        }),
      },
    );
    expect(preDeadlineSave.status).toBe(200);

    // 採点締切を過去日時へ変更
    const expireScoringRes = await app.request(
      '/api/admin/auditions/aud-2026-winter',
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          scoringDeadline: '2020-01-01T23:59',
        }),
      },
    );
    expect(expireScoringRes.status).toBe(200);

    // 提出済みユーザー (u-voter1) は未入力追加も再提出も 403
    const submittedUserEdit = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-1',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter1Cookie,
        },
        body: JSON.stringify({
          techScore: 30,
          charmScore: 30,
          comment: '締切後変更試行',
        }),
      },
    );
    expect(submittedUserEdit.status).toBe(403);

    // 未提出ユーザー (u-voter2) でも保存済みの b-win-2 への上書きは 403
    const overwriteSavedBand = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-2',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          techScore: 45,
          charmScore: 45,
          comment: '上書き試行',
        }),
      },
    );
    expect(overwriteSavedBand.status).toBe(403);

    // 未保存の b-win-3 への単体保存は 200
    const saveUnsavedBand = await app.request(
      '/api/auditions/aud-2026-winter/scores/b-win-3',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          techScore: 38,
          charmScore: 39,
          comment: '締切後未入力バンド保存',
        }),
      },
    );
    expect(saveUnsavedBand.status).toBe(200);

    // 一括提出で保存済みバンド (b-win-2) を改変しようとすると 403
    const tamperSubmit = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 10, charmScore: 10, comment: '改変' },
            { bandId: 'b-win-3', techScore: 38, charmScore: 39, comment: '締切後未入力バンド保存' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 43, comment: '初回提出' },
          ],
          generalFeedback: '締切後の初回提出総括',
          markSubmitted: true,
        }),
      },
    );
    expect(tamperSubmit.status).toBe(403);

    // 保存済みバンドはそのまま維持し、残りの未入力バンド (b-win-4) と未入力全体講評を送って初回最終提出は 200
    const validLateSubmit = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 40, charmScore: 41, comment: '締切前保存' },
            { bandId: 'b-win-3', techScore: 38, charmScore: 39, comment: '締切後未入力バンド保存' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 43, comment: '初回提出' },
          ],
          generalFeedback: '締切後の初回提出総括',
          markSubmitted: true,
        }),
      },
    );
    expect(validLateSubmit.status).toBe(200);

    // 初回提出後は締切後なので全体講評も再提出も不可 (403)
    const afterSubmitGeneralFeedback = await app.request(
      '/api/auditions/aud-2026-winter/general-feedback',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({ generalFeedback: '再編集試行' }),
      },
    );
    expect(afterSubmitGeneralFeedback.status).toBe(403);

    const afterSubmitResubmit = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 40, charmScore: 41, comment: '締切前保存' },
            { bandId: 'b-win-3', techScore: 38, charmScore: 39, comment: '締切後未入力バンド保存' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 43, comment: '初回提出' },
          ],
          generalFeedback: '締切後の初回提出総括',
          markSubmitted: true,
        }),
      },
    );
    expect(afterSubmitResubmit.status).toBe(403);
  });

  it('採点必須者全員が提出するまで一般向け結果・エクスポートが403となり、六甲祭テストデータの未提出者が0である', async () => {
    const adminCookie = await loginAs('u-admin');
    const voter1Cookie = await loginAs('u-voter1');
    const multiCookie = await loginAs('u-multi');
    const voter2Cookie = await loginAs('u-voter2');

    // 1) buildRealisticSeedData() の六甲祭 (aud-2026-winter) に未提出者が0であること
    const realistic = buildRealisticSeedData();
    const winterVoters = realistic.auditionVoters.filter(
      (v) => v.auditionId === 'aud-2026-winter',
    );
    expect(winterVoters.length).toBeGreaterThan(0);
    expect(winterVoters.filter((v) => !v.isSubmitted)).toHaveLength(0);
    // 自バンドへのスコアが含まれていないことも検証
    const winterMembersByBand = new Map<string, Set<string>>();
    for (const bm of realistic.bandMembers) {
      if (!bm.bandId.startsWith('b-win-')) continue;
      const set = winterMembersByBand.get(bm.bandId) ?? new Set<string>();
      set.add(bm.userId);
      winterMembersByBand.set(bm.bandId, set);
    }
    const winterScores = realistic.scores.filter(
      (s) => s.auditionId === 'aud-2026-winter',
    );
    expect(
      winterScores.some((s) =>
        winterMembersByBand.get(s.bandId)?.has(s.evaluatorUserId),
      ),
    ).toBe(false);

    // 2) ensureSeedData の aud-2026-winter は u-multi, u-voter2 が未提出のため、CLOSEDにしても一般結果は403
    await app.request('/api/admin/auditions/aud-2026-winter/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: 'CLOSED' }),
    });

    const votersBeforeRes = await app.request(
      '/api/admin/auditions/aud-2026-winter/voters',
      { headers: { Cookie: adminCookie } },
    );
    expect(votersBeforeRes.status).toBe(200);
    const votersBeforeBody = (await votersBeforeRes.json()) as {
      summary: {
        requiredTotalCount: number;
        requiredSubmittedCount: number;
        requiredUnsubmittedCount: number;
      };
    };
    expect(votersBeforeBody.summary.requiredUnsubmittedCount).toBe(2);

    const blockedResultsRes = await app.request(
      '/api/auditions/aud-2026-winter/results',
      { headers: { Cookie: voter1Cookie } },
    );
    expect(blockedResultsRes.status).toBe(403);
    const blockedResultsBody = (await blockedResultsRes.json()) as {
      unsubmittedRequiredCount: number;
    };
    expect(blockedResultsBody.unsubmittedRequiredCount).toBe(2);

    const blockedExportRes = await app.request(
      '/api/auditions/aud-2026-winter/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: voter1Cookie } },
    );
    expect(blockedExportRes.status).toBe(403);

    // 3) ACTIVEに戻して未提出2名（u-multi, u-voter2）が全員提出する。
    // あわせて未提出の COMMENT_ONLY 部員を1名追加しても、SCORE_AND_COMMENT 全員提出済みなら閲覧可能であることを確認
    await app.request('/api/admin/auditions/aud-2026-winter/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'ACTIVE',
        scoringDeadline: '2027-01-01T23:59',
      }),
    });

    await app.request('/api/admin/auditions/aud-2026-winter/voters/bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        mode: 'BY_IDS',
        userIds: ['u-unregistered'],
        permissionType: 'COMMENT_ONLY',
        action: 'ASSIGN',
      }),
    });

    // u-multi (b-win-1, b-win-3 所属) の対象は b-win-2, b-win-4
    const multiSubmit = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: multiCookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 40, charmScore: 40, comment: '良い' },
            { bandId: 'b-win-4', techScore: 42, charmScore: 42, comment: '最高' },
          ],
          generalFeedback: '全体総括 multi',
          markSubmitted: true,
        }),
      },
    );
    expect(multiSubmit.status).toBe(200);

    // u-voter2 (b-win-1 所属) の対象は b-win-2, b-win-3, b-win-4
    const voter2Submit = await app.request(
      '/api/auditions/aud-2026-winter/scores/submit',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: voter2Cookie,
        },
        body: JSON.stringify({
          scores: [
            { bandId: 'b-win-2', techScore: 39, charmScore: 39, comment: '良い' },
            { bandId: 'b-win-3', techScore: 37, charmScore: 38, comment: '楽しい' },
            { bandId: 'b-win-4', techScore: 41, charmScore: 41, comment: '熱い' },
          ],
          generalFeedback: '全体総括 voter2',
          markSubmitted: true,
        }),
      },
    );
    expect(voter2Submit.status).toBe(200);

    await app.request('/api/admin/auditions/aud-2026-winter/status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({ status: 'CLOSED' }),
    });

    const votersAfterRes = await app.request(
      '/api/admin/auditions/aud-2026-winter/voters',
      { headers: { Cookie: adminCookie } },
    );
    const votersAfterBody = (await votersAfterRes.json()) as {
      summary: { requiredUnsubmittedCount: number; unsubmittedCount: number };
    };
    expect(votersAfterBody.summary.requiredUnsubmittedCount).toBe(0);
    expect(votersAfterBody.summary.unsubmittedCount).toBe(1);

    const allowedResultsRes = await app.request(
      '/api/auditions/aud-2026-winter/results',
      { headers: { Cookie: voter1Cookie } },
    );
    expect(allowedResultsRes.status).toBe(200);
    const allowedResultsBody = (await allowedResultsRes.json()) as {
      rankings: unknown[];
      bandComments?: Array<{ bandId: string; evaluatorUserId: string; comment: string }>;
    };
    expect(Array.isArray(allowedResultsBody.bandComments)).toBe(true);
    expect((allowedResultsBody.bandComments ?? []).length).toBeGreaterThan(0);

    const allowedExportRes = await app.request(
      '/api/auditions/aud-2026-winter/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: voter1Cookie } },
    );
    expect(allowedExportRes.status).toBe(200);
  });
});

