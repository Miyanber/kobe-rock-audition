import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  buildDocumentTitle,
  filterVisibleAuditions,
  getDefaultRouteForAudition,
  getPathForRoute,
  isAdminOnlyRoute,
  isAuditionOlderThanSixMonths,
  isAuditionScopedRoute,
  pickDefaultAudition,
  resolveLocationFromPathname,
  resolveRouteFromPathname,
} from '../routes.ts';
import type { AuditionDto } from '../types.ts';

function makeAudition(
  overrides: Partial<AuditionDto> & Pick<AuditionDto, 'id' | 'status' | 'eventDate'>,
): AuditionDto {
  return {
    title: overrides.id,
    deadline: null,
    entryDeadline: '2026-12-01T23:59',
    scoringDeadline: null,
    isPenaltyEnabled: false,
    aggregationMethod: 'DIFF_CORRECTION',
    standardDiff: 10,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('クライアントルート定義', () => {
  it('オーディション配下ルートとグローバルルートのURL生成と解決が相互一致する', () => {
    const auditionId = 'aud-2026-winter';
    const generatedPaths = NAV_ITEMS.map((item) =>
      getPathForRoute(item.id, auditionId),
    );
    expect(new Set(generatedPaths).size).toBe(NAV_ITEMS.length);

    expect(getPathForRoute('scoring', auditionId)).toBe(
      '/auditions/aud-2026-winter/scoring',
    );
    expect(getPathForRoute('wiki', auditionId)).toBe(
      '/auditions/aud-2026-winter/bands',
    );
    expect(getPathForRoute('results', auditionId)).toBe(
      '/auditions/aud-2026-winter/results',
    );
    expect(getPathForRoute('admin-setup', auditionId)).toBe(
      '/auditions/aud-2026-winter/setup',
    );
    expect(getPathForRoute('admin-users', auditionId)).toBe('/admin/users');

    for (const item of NAV_ITEMS) {
      const path = getPathForRoute(item.id, auditionId);
      const resolved = resolveLocationFromPathname(path);
      expect(resolved).not.toBeNull();
      expect(resolved?.route).toBe(item.id);
      expect(resolved?.needsRedirect).toBe(false);
      expect(resolved?.auditionId).toBe(
        item.id === 'admin-users' ? null : auditionId,
      );
      expect(resolveRouteFromPathname(`${path}/`)).toBe(item.id);
    }
  });

  it('ルートパス・レガシーパス・末尾スラッシュ・不明パスの解決とadminOnly判定が正しい', () => {
    expect(resolveLocationFromPathname('/')).toEqual({
      route: 'scoring',
      auditionId: null,
      isRoot: true,
      isBareAuditionPath: false,
      needsRedirect: true,
    });
    expect(resolveLocationFromPathname('/bands')).toEqual({
      route: 'wiki',
      auditionId: null,
      isRoot: false,
      isBareAuditionPath: false,
      needsRedirect: true,
    });
    expect(resolveLocationFromPathname('/auditions/aud-1')).toEqual({
      route: 'scoring',
      auditionId: 'aud-1',
      isRoot: false,
      isBareAuditionPath: true,
      needsRedirect: true,
    });
    expect(resolveLocationFromPathname('/auditions/aud-1/wiki')).toEqual({
      route: 'wiki',
      auditionId: 'aud-1',
      isRoot: false,
      isBareAuditionPath: false,
      needsRedirect: true,
    });

    expect(resolveRouteFromPathname('/')).toBe('scoring');
    expect(resolveRouteFromPathname('/unknown')).toBeNull();
    expect(resolveRouteFromPathname('/auditions/aud-1/unknown')).toBeNull();
    expect(isAdminOnlyRoute('results')).toBe(false);
    expect(isAdminOnlyRoute('scoring')).toBe(false);
    expect(isAdminOnlyRoute('wiki')).toBe(false);
    expect(isAdminOnlyRoute('admin-setup')).toBe(true);
    expect(isAdminOnlyRoute('admin-users')).toBe(true);
    expect(isAuditionScopedRoute('scoring')).toBe(true);
    expect(isAuditionScopedRoute('admin-users')).toBe(false);
  });

  it('デフォルトオーディション選択と初期タブ選択の優先順位が正しい', () => {
    const closed = makeAudition({
      id: 'old-closed',
      status: 'CLOSED',
      eventDate: '2026-06-01',
    });
    const draft = makeAudition({
      id: 'next-draft',
      status: 'DRAFT',
      eventDate: '2026-12-01',
    });
    const active = makeAudition({
      id: 'now-active',
      status: 'ACTIVE',
      eventDate: '2026-11-18',
    });

    expect(pickDefaultAudition([])).toBeNull();
    expect(pickDefaultAudition([closed, draft, active])?.id).toBe('now-active');
    expect(pickDefaultAudition([closed, draft])?.id).toBe('next-draft');
    expect(pickDefaultAudition([closed])?.id).toBe('old-closed');

    expect(getDefaultRouteForAudition(active)).toBe('scoring');
    expect(getDefaultRouteForAudition(draft)).toBe('wiki');
    expect(getDefaultRouteForAudition(closed)).toBe('results');

    expect(buildDocumentTitle('scoring', active)).toBe(
      '[2026] now-active - 採点 | 神大ROCK AUDITION',
    );
    expect(buildDocumentTitle('admin-users', active)).toBe(
      '部員管理 | 神大ROCK AUDITION',
    );
  });

  it('半年以上前のイベントをデフォルト非表示にし表示切替で再表示できる', () => {
    const now = new Date('2026-11-19T12:00:00+09:00');
    // 基準日 2026-11-19 の6ヶ月前は 2026-05-19
    expect(isAuditionOlderThanSixMonths('2026-05-18', now)).toBe(true);
    expect(isAuditionOlderThanSixMonths('2026-05-19', now)).toBe(false);
    expect(isAuditionOlderThanSixMonths('2026-08-10', now)).toBe(false);

    // 月末クランプ確認（2026-08-31 の6ヶ月前は 2026-02-28）
    const augEnd = new Date('2026-08-31T12:00:00+09:00');
    expect(isAuditionOlderThanSixMonths('2026-02-27', augEnd)).toBe(true);
    expect(isAuditionOlderThanSixMonths('2026-02-28', augEnd)).toBe(false);

    const oldEvent = makeAudition({
      id: 'old-event',
      status: 'CLOSED',
      eventDate: '2026-05-01',
    });
    const recentEvent = makeAudition({
      id: 'recent-event',
      status: 'CLOSED',
      eventDate: '2026-08-10',
    });

    expect(
      filterVisibleAuditions([recentEvent, oldEvent], false, now).map((a) => a.id),
    ).toEqual(['recent-event']);
    expect(
      filterVisibleAuditions([recentEvent, oldEvent], true, now).map((a) => a.id),
    ).toEqual(['recent-event', 'old-event']);
  });
});
