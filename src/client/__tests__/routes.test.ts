import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  buildDocumentTitle,
  getDefaultRouteForAudition,
  getPathForRoute,
  isAdminOnlyRoute,
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
      '[2026] now-active - 採点 | Kobe Rock Audition',
    );
    expect(buildDocumentTitle('admin-users', active)).toBe(
      '部員管理 | Kobe Rock Audition',
    );
  });
});
