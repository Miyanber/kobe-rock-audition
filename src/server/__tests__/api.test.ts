import { beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { createApp } from '../app.ts';
import { createInMemoryTestDb } from '../db/local.ts';
import { ensureSeedData } from '../db/seed.ts';
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
        body: JSON.stringify({ status: 'ACTIVE' }),
      },
    );
    expect(activateRes.status).toBe(200);
    const actData = (await activateRes.json()) as {
      auditions: Array<{ id: string; status: string }>;
    };
    expect(actData.auditions.find((a) => a.id === 'aud-2027-spring')?.status).toBe('ACTIVE');
    expect(actData.auditions.find((a) => a.id === 'aud-2026-winter')?.status).toBe('CLOSED');

    // ACTIVE に変わった直後から、一般部員は aud-2027-spring の Wiki 編集ができなくなる
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

  it('2種類のExcelファイル（2シート集計＆生データ / バンド別講評シート）が仕様通りのシート構成で生成される', async () => {
    const adminCookie = await loginAs('u-admin');

    // ファイル1: 集計結果 & Rawデータ (2シート)
    const res1 = await app.request(
      '/api/admin/auditions/aud-2026-winter/export?target=summary_and_raw&format=xlsx',
      { headers: { Cookie: adminCookie } },
    );
    expect(res1.status).toBe(200);
    const wb1 = XLSX.read(await res1.arrayBuffer(), { type: 'array' });
    expect(wb1.SheetNames).toEqual([
      '総合ランキング集計',
      '全採点Rawデータ_補正過程',
    ]);

    // ファイル2: バンド別講評シート (4バンド = 4シート)
    const res2 = await app.request(
      '/api/admin/auditions/aud-2026-winter/export?target=band_comments&format=xlsx',
      { headers: { Cookie: adminCookie } },
    );
    expect(res2.status).toBe(200);
    const wb2 = XLSX.read(await res2.arrayBuffer(), { type: 'array' });
    expect(wb2.SheetNames.length).toBe(4);
    expect(wb2.SheetNames[0]).toContain('01_The Rokko Distortion');

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
});

