import {
  ClipboardCheck,
  FileSpreadsheet,
  Music,
  Settings,
  Users,
} from 'lucide-react';

export type AppRoute =
  | 'scoring'
  | 'wiki'
  | 'results'
  | 'admin-setup'
  | 'admin-users';

export interface NavItemConfig {
  id: AppRoute;
  path: string;
  label: string;
  icon: typeof ClipboardCheck;
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'scoring', path: '/scoring', label: '採点', icon: ClipboardCheck },
  { id: 'wiki', path: '/bands', label: 'バンド登録', icon: Music },
  { id: 'results', path: '/results', label: '集計', icon: FileSpreadsheet },
  {
    id: 'admin-setup',
    path: '/admin/setup',
    label: '設定',
    icon: Settings,
    adminOnly: true,
  },
  {
    id: 'admin-users',
    path: '/admin/users',
    label: '部員管理',
    icon: Users,
    adminOnly: true,
  },
];

const ROUTE_TO_PATH: Record<AppRoute, string> = {
  scoring: '/scoring',
  wiki: '/bands',
  results: '/results',
  'admin-setup': '/admin/setup',
  'admin-users': '/admin/users',
};

const PATH_TO_ROUTE: Record<string, AppRoute> = {
  '/': 'scoring',
  '/scoring': 'scoring',
  '/bands': 'wiki',
  '/wiki': 'wiki',
  '/results': 'results',
  '/admin/dashboard': 'results',
  '/admin/setup': 'admin-setup',
  '/admin/users': 'admin-users',
};

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getPathForRoute(route: AppRoute): string {
  return ROUTE_TO_PATH[route];
}

export function resolveRouteFromPathname(pathname: string): AppRoute | null {
  return PATH_TO_ROUTE[normalizePathname(pathname)] ?? null;
}

export function isAdminOnlyRoute(route: AppRoute): boolean {
  return route === 'admin-setup' || route === 'admin-users';
}
