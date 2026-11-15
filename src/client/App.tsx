import { useCallback, useEffect, useState } from 'react';
import { apiJson } from './api/client.ts';
import { Layout, type AppRoute } from './components/Layout.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { ScoringPage } from './pages/ScoringPage.tsx';
import { WikiBandsPage } from './pages/WikiBandsPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { AdminSetupPage } from './pages/AdminSetupPage.tsx';
import { AdminUsersPage } from './pages/AdminUsersPage.tsx';
import type { AuditionDto, AuthMeResponse, AuthUserDto } from './types.ts';

export function App() {
  const [authInfo, setAuthInfo] = useState<AuthMeResponse | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeRoute, setActiveRoute] = useState<AppRoute>('scoring');

  // 管理者画面共通のオーディション一覧・選択中オーディションID
  const [adminAuditions, setAdminAuditions] = useState<AuditionDto[]>([]);
  const [selectedAdminAuditionId, setSelectedAdminAuditionId] = useState<string>('');

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
      }
    } catch {
      // 非ADMIN等では無視
    }
  }, []);

  useEffect(() => {
    void fetchAuthMe();
  }, [fetchAuthMe]);

  useEffect(() => {
    if (authInfo?.user?.role === 'ADMIN') {
      void fetchAdminAuditions();
    } else if (authInfo?.user && activeRoute.startsWith('admin-')) {
      setActiveRoute('scoring');
    }
  }, [authInfo?.user, fetchAdminAuditions, activeRoute]);

  const handleLoggedIn = (user: AuthUserDto) => {
    setAuthInfo((prev) => (prev ? { ...prev, user } : null));
    if (user.role === 'ADMIN') {
      void fetchAdminAuditions();
    }
  };

  const handleLogout = async () => {
    await apiJson('/api/auth/logout', { method: 'POST' });
    setAuthInfo((prev) => (prev ? { ...prev, user: null } : null));
    setActiveRoute('scoring');
  };

  if (loadingAuth || !authInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-500">
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
      onNavigate={setActiveRoute}
      onLogout={handleLogout}
    >
      {activeRoute === 'scoring' && (
        <ScoringPage user={user} onNavigate={setActiveRoute} />
      )}
      {activeRoute === 'wiki' && <WikiBandsPage user={user} />}
      {activeRoute === 'admin-dashboard' && user.role === 'ADMIN' && (
        <AdminDashboardPage
          auditions={adminAuditions}
          selectedAuditionId={selectedAdminAuditionId}
          onSelectAudition={setSelectedAdminAuditionId}
          onAuditionsChanged={fetchAdminAuditions}
        />
      )}
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

