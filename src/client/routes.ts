import {
  ClipboardCheck,
  FileSpreadsheet,
  Music,
  Settings,
  Users,
} from 'lucide-react';
import { getAcademicYearFromDateString } from '../shared/grade.ts';
import type { AuditionDto } from './types.ts';

export type AppRoute =
  | 'scoring'
  | 'wiki'
  | 'results'
  | 'admin-setup'
  | 'admin-users';

export type AuditionScopedRoute = Exclude<AppRoute, 'admin-users'>;

export interface NavItemConfig {
  id: AppRoute;
  path: string;
  label: string;
  icon: typeof ClipboardCheck;
  adminOnly?: boolean;
}

export interface ResolvedLocation {
  route: AppRoute;
  auditionId: string | null;
  isRoot: boolean;
  isBareAuditionPath: boolean;
  needsRedirect: boolean;
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'scoring', path: '/scoring', label: '採点', icon: ClipboardCheck },
  { id: 'wiki', path: '/bands', label: 'バンド登録', icon: Music },
  { id: 'results', path: '/results', label: '集計', icon: FileSpreadsheet },
  {
    id: 'admin-setup',
    path: '/setup',
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

const AUDITION_SUBPATH: Record<AuditionScopedRoute, string> = {
  scoring: '/scoring',
  wiki: '/bands',
  results: '/results',
  'admin-setup': '/setup',
};

const LEGACY_ROUTE_TO_PATH: Record<AppRoute, string> = {
  scoring: '/scoring',
  wiki: '/bands',
  results: '/results',
  'admin-setup': '/admin/setup',
  'admin-users': '/admin/users',
};

const LEGACY_PATH_TO_ROUTE: Record<string, AppRoute> = {
  '/': 'scoring',
  '/scoring': 'scoring',
  '/bands': 'wiki',
  '/wiki': 'wiki',
  '/results': 'results',
  '/admin/dashboard': 'results',
  '/admin/setup': 'admin-setup',
  '/admin/users': 'admin-users',
};

const AUDITION_SUBPATH_TO_ROUTE: Record<
  string,
  { route: AuditionScopedRoute; canonical: boolean }
> = {
  scoring: { route: 'scoring', canonical: true },
  bands: { route: 'wiki', canonical: true },
  wiki: { route: 'wiki', canonical: false },
  results: { route: 'results', canonical: true },
  'admin/dashboard': { route: 'results', canonical: false },
  setup: { route: 'admin-setup', canonical: true },
  'admin/setup': { route: 'admin-setup', canonical: false },
};

const ROUTE_LABELS: Record<AppRoute, string> = {
  scoring: '採点',
  wiki: 'バンド登録',
  results: '集計',
  'admin-setup': '設定',
  'admin-users': '部員管理',
};

export function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isAuditionScopedRoute(
  route: AppRoute,
): route is AuditionScopedRoute {
  return route !== 'admin-users';
}

export function isAdminOnlyRoute(route: AppRoute): boolean {
  return route === 'admin-setup' || route === 'admin-users';
}

export function getPathForRoute(
  route: AppRoute,
  auditionId?: string | null,
): string {
  if (route === 'admin-users') {
    return '/admin/users';
  }
  if (auditionId) {
    return `/auditions/${encodeURIComponent(auditionId)}${AUDITION_SUBPATH[route]}`;
  }
  return LEGACY_ROUTE_TO_PATH[route];
}

function safeDecodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

export function resolveLocationFromPathname(
  pathname: string,
): ResolvedLocation | null {
  const normalized = normalizePathname(pathname);

  if (normalized === '/admin/users') {
    return {
      route: 'admin-users',
      auditionId: null,
      isRoot: false,
      isBareAuditionPath: false,
      needsRedirect: false,
    };
  }

  if (normalized.startsWith('/auditions/')) {
    const rest = normalized.slice('/auditions/'.length);
    if (!rest) return null;

    const slashIndex = rest.indexOf('/');
    const rawId = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
    const subpath = slashIndex === -1 ? '' : rest.slice(slashIndex + 1);
    const auditionId = safeDecodeSegment(rawId);
    if (!auditionId) return null;

    if (!subpath) {
      return {
        route: 'scoring',
        auditionId,
        isRoot: false,
        isBareAuditionPath: true,
        needsRedirect: true,
      };
    }

    const match = AUDITION_SUBPATH_TO_ROUTE[subpath];
    if (!match) return null;

    return {
      route: match.route,
      auditionId,
      isRoot: false,
      isBareAuditionPath: false,
      needsRedirect: !match.canonical,
    };
  }

  const legacyRoute = LEGACY_PATH_TO_ROUTE[normalized];
  if (!legacyRoute) return null;

  return {
    route: legacyRoute,
    auditionId: null,
    isRoot: normalized === '/',
    isBareAuditionPath: false,
    needsRedirect: true,
  };
}

export function resolveRouteFromPathname(pathname: string): AppRoute | null {
  return resolveLocationFromPathname(pathname)?.route ?? null;
}

export function sortAuditionsDesc<
  T extends Pick<AuditionDto, 'eventDate' | 'createdAt'>,
>(auditions: readonly T[]): T[] {
  return [...auditions].sort((a, b) => {
    const dateDiff = b.eventDate.localeCompare(a.eventDate);
    if (dateDiff !== 0) return dateDiff;
    return b.createdAt - a.createdAt;
  });
}

/**
 * JST基準の現在日付から6ヶ月前の日付より開催日が前かどうかを判定する。
 */
export function isAuditionOlderThanSixMonths(
  eventDate: string,
  now: Date = new Date(),
): boolean {
  const trimmed = eventDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return false;
  }

  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const targetYear = jstNow.getUTCFullYear();
  const targetMonth = jstNow.getUTCMonth() - 6;
  const day = jstNow.getUTCDate();

  const firstOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth() + 1,
      0,
    ),
  ).getUTCDate();
  const cutoff = new Date(
    Date.UTC(
      firstOfTargetMonth.getUTCFullYear(),
      firstOfTargetMonth.getUTCMonth(),
      Math.min(day, lastDayOfTargetMonth),
    ),
  );
  const cutoffDateStr = cutoff.toISOString().slice(0, 10);

  return trimmed.slice(0, 10) < cutoffDateStr;
}

export function filterVisibleAuditions<
  T extends Pick<AuditionDto, 'eventDate'>,
>(
  auditions: readonly T[],
  showOldAuditions: boolean,
  now: Date = new Date(),
): T[] {
  if (showOldAuditions) {
    return [...auditions];
  }
  return auditions.filter(
    (a) => !isAuditionOlderThanSixMonths(a.eventDate, now),
  );
}

export function pickDefaultAudition(
  auditions: readonly AuditionDto[],
): AuditionDto | null {
  if (auditions.length === 0) return null;
  const sorted = sortAuditionsDesc(auditions);
  return (
    sorted.find((a) => a.status === 'ACTIVE') ??
    sorted.find((a) => a.status === 'DRAFT' || a.status === 'ENTRY_CLOSED') ??
    sorted.find((a) => a.status === 'CLOSED') ??
    sorted[0]
  );
}

export function getDefaultRouteForAudition(
  audition: Pick<AuditionDto, 'status'>,
): AuditionScopedRoute {
  switch (audition.status) {
    case 'ACTIVE':
      return 'scoring';
    case 'DRAFT':
    case 'ENTRY_CLOSED':
      return 'wiki';
    case 'CLOSED':
      return 'results';
  }
}

export function buildDocumentTitle(
  route: AppRoute,
  audition?: Pick<AuditionDto, 'title' | 'eventDate'> | null,
): string {
  const label = ROUTE_LABELS[route];
  if (route === 'admin-users' || !audition) {
    return `${label} | 神大ROCK AUDITION`;
  }
  const academicYear = getAcademicYearFromDateString(audition.eventDate);
  return `[${academicYear}] ${audition.title} - ${label} | 神大ROCK AUDITION`;
}
