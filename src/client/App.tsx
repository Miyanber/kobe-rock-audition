import { useCallback, useEffect, useState } from 'react';
import { apiJson } from './api/client.ts';
import { Layout } from './components/Layout.tsx';
import {
  getPathForRoute,
  isAdminOnlyRoute,
  normalizePathname,
  resolveRouteFromPathname,
  type AppRoute,
} from './routes.ts';
import { LoginPage } from './pages/LoginPage.tsx';
import { ScoringPage } from './pages/ScoringPage.tsx';
import { WikiBandsPage } from './pages/WikiBandsPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminSetupPage } from './pages/AdminSetupPage.tsx';
import { AdminUsersPage } from './pages/AdminUsersPage.tsx';
import { VoterResultsPage } from './pages/VoterResultsPage.tsx';
import type { AuditionDto, AuthMeResponse, AuthUserDto } from './types.ts';

export function App() {
  const [authInfo, setAuthInfo] = useState<AuthMeResponse | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeRoute, setActiveRoute] = useState<AppRoute>(
    () => resolveRouteFromPathname(window.location.pathname) ?? 'scoring',
  );

  // 管理者画面共通のオーディション一覧・選択中オーディションID
  const [adminAuditions, setAdminAuditions] = useState<AuditionDto[]>([]);
  const [selectedAdminAuditionId, setSelectedAdminAuditionId] = useState<string>('');

  const navigate = useCallback(
    (route: AppRoute, options?: { replace?: boolean }) => {
      const targetPath = getPathForRoute(route);
      if (window.location.pathname !== targetPath) {
        if (options?.replace) {
          window.history.replaceState(null, '', targetPath);
        } else {
          window.history.pushState(null, '', targetPath);
        }
      }
      setActiveRoute(route);
    },
    [],
  );

  useEffect(() => {
    const handlePopState = () => {
      const resolved = resolveRouteFromPathname(window.location.pathname);
      setActiveRoute(resolved ?? 'scoring');
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

  const fetchAdminAuditions = useCallback(async () => {
    try {
      const res = await apiJson<{ auditions: AuditionDto[] }>('/api/admin/auditions');
      setAdminAuditions(res.auditions);
      if (res.auditions.length > 0) {
        setSelectedAdminAuditionId((prev) => {
          if (prev && res.auditions.some((a) => a.id === prev)) return prev;
          const active = res.auditions.find((a) => a.status === 'ACTIVE');
          return active?.id ?? res.auditions[0].id;
        });
      } else {
        setSelectedAdminAuditionId('');
      }
    } catch {
      // 非ADMIN等では無視
    }
  }, []);

  useEffect(() => {
    void fetchAuthMe();
  }, [fetchAuthMe]);

  useEffect(() => {
    if (!authInfo?.user) return;
    if (authInfo.user.role === 'ADMIN') {
      void fetchAdminAuditions();
    } else if (isAdminOnlyRoute(activeRoute)) {
      navigate('scoring', { replace: true });
      return;
    }

    const currentPath = normalizePathname(window.location.pathname);
    const resolved = resolveRouteFromPathname(currentPath);
    const expectedPath = getPathForRoute(activeRoute);
    if (resolved === null || currentPath === '/' || currentPath !== expectedPath) {
      window.history.replaceState(null, '', expectedPath);
    }
  }, [authInfo?.user, fetchAdminAuditions, activeRoute, navigate]);

  const handleLoggedIn = (user: AuthUserDto) => {
    setAuthInfo((prev) => (prev ? { ...prev, user } : null));
    if (user.role === 'ADMIN') {
      void fetchAdminAuditions();
    }
  };

  const handleLogout = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setAuthInfo((prev) => (prev ? { ...prev, user: null } : null));
    window.history.replaceState(null, '', '/');
    setActiveRoute('scoring');
  };

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

  const user = authInfo.user;

  return (
    <Layout
      user={user}
      activeRoute={activeRoute}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {activeRoute === 'scoring' && (
        <ScoringPage user={user} onNavigate={navigate} />
      )}
      {activeRoute === 'wiki' && <WikiBandsPage user={user} />}
      {activeRoute === 'results' &&
        (user.role === 'ADMIN' ? (
          <AdminDashboardPage
            auditions={adminAuditions}
            selectedAuditionId={selectedAdminAuditionId}
            onSelectAudition={setSelectedAdminAuditionId}
            onAuditionsChanged={fetchAdminAuditions}
          />
        ) : (
          <VoterResultsPage />
        ))}
      {activeRoute === 'admin-setup' && user.role === 'ADMIN' && (
        <AdminSetupPage
          auditions={adminAuditions}
          selectedAuditionId={selectedAdminAuditionId}
          onSelectAudition={setSelectedAdminAuditionId}
          onAuditionsChanged={fetchAdminAuditions}
        />
      )}
      {activeRoute === 'admin-users' && user.role === 'ADMIN' && (
        <AdminUsersPage
          currentUser={user}
          auditions={adminAuditions}
          selectedAuditionId={selectedAdminAuditionId}
          onSelectAudition={setSelectedAdminAuditionId}
          onCurrentUserChanged={fetchAuthMe}
        />
      )}
    </Layout>
  );
}

