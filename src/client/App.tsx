import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { apiJson } from './api/client.ts';
import { AdminAuditionHeader } from './components/AdminAuditionHeader.tsx';
import { GradeConfirmModal } from './components/GradeConfirmModal.tsx';
import { Layout } from './components/Layout.tsx';
import {
  buildDocumentTitle,
  filterVisibleAuditions,
  getDefaultRouteForAudition,
  getPathForRoute,
  isAdminOnlyRoute,
  isAuditionOlderThanSixMonths,
  isAuditionScopedRoute,
  pickDefaultAudition,
  resolveLocationFromPathname,
  sortAuditionsDesc,
  type AppRoute,
  type AuditionScopedRoute,
  type ResolvedLocation,
} from './routes.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { ScoringPage } from './pages/ScoringPage.tsx';
import { WikiBandsPage } from './pages/WikiBandsPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminSetupPage } from './pages/AdminSetupPage.tsx';
import { AdminUsersPage } from './pages/AdminUsersPage.tsx';
import { VoterResultsPage } from './pages/VoterResultsPage.tsx';
import type { AuditionDto, AuthMeResponse, AuthUserDto } from './types.ts';

const SHOW_OLD_AUDITIONS_STORAGE_KEY = 'kra_show_old_auditions_v1';

function readShowOldAuditionsPreference(): boolean {
  try {
    return localStorage.getItem(SHOW_OLD_AUDITIONS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function parseCurrentLocation(): ResolvedLocation {
  return (
    resolveLocationFromPathname(window.location.pathname) ?? {
      route: 'scoring',
      auditionId: null,
      isRoot: true,
      isBareAuditionPath: false,
      needsRedirect: true,
    }
  );
}

export function App() {
  const [authInfo, setAuthInfo] = useState<AuthMeResponse | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [locationState, setLocationState] = useState<ResolvedLocation>(
    parseCurrentLocation,
  );

  // 全画面共通のオーディション一覧（開催日降順）
  const [auditions, setAuditions] = useState<AuditionDto[]>([]);
  const [auditionsLoaded, setAuditionsLoaded] = useState(false);
  const [lastAuditionId, setLastAuditionId] = useState<string | null>(
    () => parseCurrentLocation().auditionId,
  );
  const [showOldAuditions, setShowOldAuditions] = useState<boolean>(
    readShowOldAuditionsPreference,
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

  const visibleAuditions = useMemo(
    () => filterVisibleAuditions(auditions, showOldAuditions),
    [auditions, showOldAuditions],
  );

  const oldAuditionCount = useMemo(
    () =>
      auditions.filter((a) => isAuditionOlderThanSixMonths(a.eventDate)).length,
    [auditions],
  );

  const navigateTo = useCallback(
    (
      route: AppRoute,
      targetAuditionId?: string | null,
      options?: { replace?: boolean },
    ) => {
      if (route !== 'admin-setup') {
        setShowCreateModal(false);
      }
      let resolvedAuditionId: string | null = null;
      if (isAuditionScopedRoute(route)) {
        resolvedAuditionId =
          targetAuditionId ??
          locationState.auditionId ??
          lastAuditionId ??
          pickDefaultAudition(visibleAuditions)?.id ??
          pickDefaultAudition(auditions)?.id ??
          null;
      }

      const targetPath = getPathForRoute(route, resolvedAuditionId);
      if (window.location.pathname !== targetPath) {
        if (options?.replace) {
          window.history.replaceState(null, '', targetPath);
        } else {
          window.history.pushState(null, '', targetPath);
        }
      }

      if (resolvedAuditionId) {
        setLastAuditionId(resolvedAuditionId);
      }

      setLocationState({
        route,
        auditionId: resolvedAuditionId,
        isRoot: false,
        isBareAuditionPath: false,
        needsRedirect: false,
      });
    },
    [auditions, lastAuditionId, locationState.auditionId, visibleAuditions],
  );

  const navigateByRoute = useCallback(
    (route: AppRoute) => {
      navigateTo(route);
    },
    [navigateTo],
  );

  const navigateToAudition = useCallback(
    (auditionId: string, route: AuditionScopedRoute) => {
      navigateTo(route, auditionId);
    },
    [navigateTo],
  );

  useEffect(() => {
    const handlePopState = () => {
      const resolved = parseCurrentLocation();
      setLocationState(resolved);
      if (resolved.auditionId) {
        setLastAuditionId(resolved.auditionId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const fetchAuthMe = useCallback(async () => {
    try {
      const me = await apiJson<AuthMeResponse>('/api/auth/me');
      setAuthInfo(me);
    } finally {
      setLoadingAuth(false);
    }
  }, []);

  const fetchAuditions = useCallback(async (): Promise<AuditionDto[]> => {
    try {
      const res = await apiJson<{ auditions: AuditionDto[] }>('/api/auditions');
      const sorted = sortAuditionsDesc(res.auditions);
      setAuditions(sorted);
      return sorted;
    } catch {
      return [];
    } finally {
      setAuditionsLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchAuthMe();
  }, [fetchAuthMe]);

  useEffect(() => {
    if (!authInfo?.user) return;
    void fetchAuditions();
  }, [authInfo?.user, fetchAuditions]);

  const user = authInfo?.user ?? null;
  const activeRoute = locationState.route;
  const urlAuditionId = locationState.auditionId;

  const currentAudition = useMemo(() => {
    if (!urlAuditionId) return null;
    return visibleAuditions.find((a) => a.id === urlAuditionId) ?? null;
  }, [visibleAuditions, urlAuditionId]);

  const hiddenTargetAudition = useMemo(() => {
    if (!urlAuditionId || showOldAuditions) return null;
    return (
      auditions.find(
        (a) =>
          a.id === urlAuditionId && isAuditionOlderThanSixMonths(a.eventDate),
      ) ?? null
    );
  }, [auditions, urlAuditionId, showOldAuditions]);

  const activeAudition = useMemo(
    () => visibleAuditions.find((a) => a.status === 'ACTIVE') ?? null,
    [visibleAuditions],
  );

  const draftAudition = useMemo(
    () => visibleAuditions.find((a) => a.status === 'DRAFT') ?? null,
    [visibleAuditions],
  );

  const closedAuditions = useMemo(
    () => visibleAuditions.filter((a) => a.status === 'CLOSED'),
    [visibleAuditions],
  );

  const returnAudition = useMemo(() => {
    if (lastAuditionId) {
      const found = visibleAuditions.find((a) => a.id === lastAuditionId);
      if (found) return found;
    }
    return pickDefaultAudition(visibleAuditions);
  }, [visibleAuditions, lastAuditionId]);

  const handleToggleShowOldAuditions = useCallback(
    (next: boolean) => {
      setShowOldAuditions(next);
      try {
        localStorage.setItem(SHOW_OLD_AUDITIONS_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      if (!next && urlAuditionId) {
        const target = auditions.find((a) => a.id === urlAuditionId);
        if (target && isAuditionOlderThanSixMonths(target.eventDate)) {
          const nextVisible = filterVisibleAuditions(auditions, false);
          const fallback = pickDefaultAudition(nextVisible);
          if (fallback) {
            navigateTo(
              isAuditionScopedRoute(activeRoute)
                ? activeRoute
                : getDefaultRouteForAudition(fallback),
              fallback.id,
              { replace: true },
            );
          }
        }
      }
    },
    [activeRoute, auditions, navigateTo, urlAuditionId],
  );

  // ログイン済み・オーディション一覧取得後のURL正規化と権限リダイレクト
  useEffect(() => {
    if (!user || !auditionsLoaded) return;

    const defaultAudition = pickDefaultAudition(visibleAuditions);

    if (user.role !== 'ADMIN' && isAdminOnlyRoute(activeRoute)) {
      const targetAudition = currentAudition ?? defaultAudition;
      const fallbackRoute = targetAudition
        ? getDefaultRouteForAudition(targetAudition)
        : 'scoring';
      navigateTo(fallbackRoute, targetAudition?.id ?? null, { replace: true });
      return;
    }

    if (activeRoute === 'admin-users') {
      return;
    }

    if (visibleAuditions.length === 0) {
      if (auditions.length === 0) {
        const expectedPath = getPathForRoute(activeRoute, null);
        if (window.location.pathname !== expectedPath) {
          window.history.replaceState(null, '', expectedPath);
        }
      }
      return;
    }

    if (!urlAuditionId) {
      const targetAudition = defaultAudition!;
      const targetRoute: AuditionScopedRoute = locationState.isRoot
        ? getDefaultRouteForAudition(targetAudition)
        : (activeRoute as AuditionScopedRoute);
      navigateTo(targetRoute, targetAudition.id, { replace: true });
      return;
    }

    if (locationState.isBareAuditionPath && currentAudition) {
      navigateTo(
        getDefaultRouteForAudition(currentAudition),
        currentAudition.id,
        { replace: true },
      );
      return;
    }

    if (locationState.needsRedirect && currentAudition) {
      navigateTo(activeRoute, currentAudition.id, { replace: true });
      return;
    }

    if (currentAudition && lastAuditionId !== currentAudition.id) {
      setLastAuditionId(currentAudition.id);
    }
  }, [
    user,
    auditionsLoaded,
    auditions,
    visibleAuditions,
    activeRoute,
    urlAuditionId,
    currentAudition,
    lastAuditionId,
    locationState.isRoot,
    locationState.isBareAuditionPath,
    locationState.needsRedirect,
    navigateTo,
  ]);

  // ブラウザタブのタイトルを動的に更新
  useEffect(() => {
    if (!user) {
      document.title = 'ログイン | Kobe Rock Audition';
      return;
    }
    document.title = buildDocumentTitle(
      activeRoute,
      isAuditionScopedRoute(activeRoute) ? currentAudition : null,
    );
  }, [user, activeRoute, currentAudition]);

  const handleLoggedIn = (loggedInUser: AuthUserDto) => {
    setAuditionsLoaded(false);
    setAuthInfo((prev) => (prev ? { ...prev, user: loggedInUser } : null));
  };

  const handleLogout = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setAuthInfo((prev) => (prev ? { ...prev, user: null } : null));
    setAuditions([]);
    setAuditionsLoaded(false);
    setLastAuditionId(null);
    window.history.replaceState(null, '', '/');
    setLocationState({
      route: 'scoring',
      auditionId: null,
      isRoot: true,
      isBareAuditionPath: false,
      needsRedirect: true,
    });
  };

  const handleAuditionDeleted = useCallback(
    (remaining: AuditionDto[]) => {
      const remainingVisible = filterVisibleAuditions(
        remaining,
        showOldAuditions,
      );
      const next =
        pickDefaultAudition(remainingVisible) ?? pickDefaultAudition(remaining);
      if (next) {
        if (
          !showOldAuditions &&
          isAuditionOlderThanSixMonths(next.eventDate)
        ) {
          setShowOldAuditions(true);
        }
        navigateTo('admin-setup', next.id, { replace: true });
      } else {
        setLastAuditionId(null);
        navigateTo('admin-setup', null, { replace: true });
      }
    },
    [navigateTo, showOldAuditions],
  );

  if (loadingAuth || !authInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 text-sm text-zinc-500">
        システムを読み込み中...
      </div>
    );
  }

  if (!authInfo.user) {
    return <LoginPage authInfo={authInfo} onLoggedIn={handleLoggedIn} />;
  }

  const currentNavAuditionId =
    currentAudition?.id ?? returnAudition?.id ?? null;

  const isUnknownAuditionUrl =
    auditionsLoaded &&
    isAuditionScopedRoute(activeRoute) &&
    auditions.length > 0 &&
    Boolean(urlAuditionId) &&
    !currentAudition &&
    !hiddenTargetAudition;

  const subHeader =
    isAuditionScopedRoute(activeRoute) && currentAudition ? (
      <AdminAuditionHeader
        auditions={visibleAuditions}
        selectedAuditionId={currentAudition.id}
        onSelectAudition={(nextId) => navigateTo(activeRoute, nextId)}
        activeRoute={activeRoute}
        showStatusBanners={activeRoute !== 'admin-setup'}
        activeAudition={activeAudition}
        draftAudition={draftAudition}
        onGoToActiveScoring={(id) => navigateTo('scoring', id)}
        onGoToDraftBands={(id) => navigateTo('wiki', id)}
        showOldAuditions={showOldAuditions}
        oldAuditionCount={oldAuditionCount}
        onToggleShowOldAuditions={handleToggleShowOldAuditions}
        actionSlot={
          authInfo.user.role === 'ADMIN' && activeRoute === 'admin-setup' ? (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shrink-0 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>新規作成</span>
            </button>
          ) : undefined
        }
      />
    ) : undefined;

  const renderMainContent = () => {
    if (!auditionsLoaded && activeRoute !== 'admin-users') {
      return (
        <div className="py-16 text-center text-sm text-zinc-500">
          オーディション情報を読み込み中...
        </div>
      );
    }

    if (hiddenTargetAudition) {
      const fallback = pickDefaultAudition(visibleAuditions);
      return (
        <div className="max-w-xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-sm bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-zinc-800">
            「{hiddenTargetAudition.title}」は半年以上前のイベントのため非表示になっています
          </h2>
          <p className="text-sm text-zinc-600 leading-relaxed">
            開催日: <span className="font-semibold">{hiddenTargetAudition.eventDate}</span>
            <br />
            一覧を見やすく保つため、開催から半年以上経過したイベントはデフォルトで非表示に設定されています。閲覧する場合は表示設定を切り替えてください。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => handleToggleShowOldAuditions(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition cursor-pointer"
            >
              半年以上前のイベントを表示して閲覧する
            </button>
            {fallback && (
              <button
                type="button"
                onClick={() =>
                  navigateTo(getDefaultRouteForAudition(fallback), fallback.id)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800 text-sm font-bold transition cursor-pointer"
              >
                「{fallback.title}」へ移動する
              </button>
            )}
          </div>
        </div>
      );
    }

    if (isUnknownAuditionUrl) {
      const fallback = pickDefaultAudition(visibleAuditions);
      return (
        <div className="max-w-xl mx-auto bg-zinc-50 border border-amber-200 rounded-sm p-8 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-sm bg-amber-50 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-zinc-800">
            指定されたオーディションが見つかりません
          </h2>
          <p className="text-sm text-zinc-600">
            URLに含まれるオーディション（ID: <code className="font-mono text-xs bg-zinc-200/70 px-1.5 py-0.5 rounded-sm">{urlAuditionId}</code>）は存在しないか、すでに削除されています。
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {fallback && (
              <button
                type="button"
                onClick={() =>
                  navigateTo(getDefaultRouteForAudition(fallback), fallback.id)
                }
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition cursor-pointer"
              >
                「{fallback.title}」へ移動する
              </button>
            )}
            {oldAuditionCount > 0 && !showOldAuditions && (
              <button
                type="button"
                onClick={() => handleToggleShowOldAuditions(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-sm font-bold transition cursor-pointer"
              >
                半年以上前のイベントを表示 ({oldAuditionCount}件)
              </button>
            )}
          </div>
        </div>
      );
    }

    if (activeRoute === 'admin-users' && authInfo.user!.role === 'ADMIN') {
      return (
        <AdminUsersPage
          currentUser={authInfo.user!}
          returnAudition={returnAudition}
          onReturnToAudition={
            returnAudition
              ? () => navigateTo('admin-setup', returnAudition.id)
              : undefined
          }
          onCurrentUserChanged={fetchAuthMe}
        />
      );
    }

    if (visibleAuditions.length === 0) {
      if (authInfo.user!.role === 'ADMIN') {
        return (
          <AdminSetupPage
            auditions={visibleAuditions}
            selectedAuditionId=""
            onSelectAudition={(id) => navigateTo('admin-setup', id)}
            onAuditionsChanged={fetchAuditions}
            onAuditionDeleted={handleAuditionDeleted}
            showCreateModal={showCreateModal}
            onOpenCreateModal={() => setShowCreateModal(true)}
            onCloseCreateModal={() => setShowCreateModal(false)}
            showOldAuditions={showOldAuditions}
            oldAuditionCount={oldAuditionCount}
            onToggleShowOldAuditions={handleToggleShowOldAuditions}
          />
        );
      }
      if (oldAuditionCount > 0 && !showOldAuditions) {
        return (
          <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-3">
            <p className="font-bold text-zinc-800">
              直近6ヶ月以内のオーディションがありません
            </p>
            <p className="text-xs text-zinc-500">
              半年以上前のイベントが {oldAuditionCount}件非表示になっています。
            </p>
            <div>
              <button
                type="button"
                onClick={() => handleToggleShowOldAuditions(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
              >
                半年以上前のイベントを表示する ({oldAuditionCount}件)
              </button>
            </div>
          </div>
        );
      }
      return (
        <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-2">
          <p className="font-bold text-zinc-800">
            表示可能なオーディションがまだありません
          </p>
          <p className="text-xs text-zinc-500">
            運営委員が新しいオーディションを作成するまでお待ちください。
          </p>
        </div>
      );
    }

    if (!currentAudition) {
      return (
        <div className="py-16 text-center text-sm text-zinc-500">
          オーディションを切り替え中...
        </div>
      );
    }

    if (activeRoute === 'scoring') {
      return (
        <ScoringPage
          user={authInfo.user!}
          auditionId={currentAudition.id}
          onNavigateToAudition={navigateToAudition}
        />
      );
    }

    if (activeRoute === 'wiki') {
      return (
        <WikiBandsPage
          user={authInfo.user!}
          auditionId={currentAudition.id}
        />
      );
    }

    if (activeRoute === 'results') {
      return authInfo.user!.role === 'ADMIN' ? (
        <AdminDashboardPage
          auditions={visibleAuditions}
          selectedAuditionId={currentAudition.id}
          onAuditionsChanged={async () => {
            await fetchAuditions();
          }}
        />
      ) : (
        <VoterResultsPage
          audition={currentAudition}
          closedAuditions={closedAuditions}
          onNavigateToAudition={navigateToAudition}
        />
      );
    }

    if (activeRoute === 'admin-setup' && authInfo.user!.role === 'ADMIN') {
      return (
        <AdminSetupPage
          auditions={visibleAuditions}
          selectedAuditionId={currentAudition.id}
          onSelectAudition={(id) => navigateTo('admin-setup', id)}
          onAuditionsChanged={fetchAuditions}
          onAuditionDeleted={handleAuditionDeleted}
          showCreateModal={showCreateModal}
          onOpenCreateModal={() => setShowCreateModal(true)}
          onCloseCreateModal={() => setShowCreateModal(false)}
          showOldAuditions={showOldAuditions}
          oldAuditionCount={oldAuditionCount}
          onToggleShowOldAuditions={handleToggleShowOldAuditions}
        />
      );
    }

    return null;
  };

  return (
    <Layout
      user={authInfo.user}
      activeRoute={activeRoute}
      currentAuditionId={currentNavAuditionId}
      onNavigate={navigateByRoute}
      onLogout={handleLogout}
      subHeader={subHeader}
    >
      {renderMainContent()}
      {authInfo.user && !authInfo.user.isGradeConfirmed && (
        <GradeConfirmModal
          user={authInfo.user}
          onConfirmed={(updatedUser) => {
            setAuthInfo((prev) =>
              prev ? { ...prev, user: updatedUser } : prev,
            );
          }}
        />
      )}
    </Layout>
  );
}
