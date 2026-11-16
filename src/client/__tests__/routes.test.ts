import { describe, expect, it } from 'vitest';
import {
  NAV_ITEMS,
  getPathForRoute,
  isAdminOnlyRoute,
  resolveRouteFromPathname,
} from '../routes.ts';

describe('クライアントルート定義', () => {
  it('すべてのnavItemsに固有のURLパスが割り当てられ相互変換できる', () => {
    const paths = NAV_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(NAV_ITEMS.length);

    for (const item of NAV_ITEMS) {
      expect(getPathForRoute(item.id)).toBe(item.path);
      expect(resolveRouteFromPathname(item.path)).toBe(item.id);
      expect(resolveRouteFromPathname(`${item.path}/`)).toBe(item.id);
    }
  });

  it('ルートパスや不明パスの解決とadminOnly判定が正しい', () => {
    expect(resolveRouteFromPathname('/')).toBe('scoring');
    expect(resolveRouteFromPathname('/unknown')).toBeNull();
    expect(isAdminOnlyRoute('results')).toBe(false);
    expect(isAdminOnlyRoute('scoring')).toBe(false);
    expect(isAdminOnlyRoute('wiki')).toBe(false);
    expect(isAdminOnlyRoute('admin-setup')).toBe(true);
    expect(isAdminOnlyRoute('admin-users')).toBe(true);
  });
});
