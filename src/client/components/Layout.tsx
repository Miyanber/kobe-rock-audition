import type { ReactNode } from 'react';
import {
  Award,
  ClipboardCheck,
  FileSpreadsheet,
  LogOut,
  Music,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import type { AuthUserDto } from '../types.ts';

export type AppRoute =
  | 'scoring'
  | 'wiki'
  | 'admin-dashboard'
  | 'admin-setup'
  | 'admin-users';

interface LayoutProps {
  user: AuthUserDto;
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
  children: ReactNode;
}

export function Layout({
  user,
  activeRoute,
  onNavigate,
  onLogout,
  children,
}: LayoutProps) {
  const isAdmin = user.role === 'ADMIN';

  const navItems: Array<{
    id: AppRoute;
    label: string;
    icon: typeof ClipboardCheck;
    adminOnly?: boolean;
  }> = [
    { id: 'scoring', label: '採点入力', icon: ClipboardCheck },
    { id: 'wiki', label: 'バンドWiki', icon: Music },
    { id: 'admin-dashboard', label: '集計・管理', icon: FileSpreadsheet, adminOnly: true },
    { id: 'admin-setup', label: '開催回・設定', icon: Settings, adminOnly: true },
    { id: 'admin-users', label: '部員マスタ', icon: Users, adminOnly: true },
  ];

  const visibleNav = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-100">
      <header className="sticky top-0 z-30 bg-slate-700 text-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-sm bg-slate-600 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5 text-white" />
              </div>
              <div className="truncate">
                <span className="font-bold tracking-tight text-sm sm:text-base">
                  Kobe Rock Audition
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 text-xs bg-slate-700 px-3 py-1.5 rounded-sm border border-slate-700">
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                    <Shield className="h-3.5 w-3.5" />
                    ADMIN
                  </span>
                )}
                <span className="font-medium text-slate-100">{user.name}</span>
                <span className="text-zinc-400">({user.grade}回生)</span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                title="ログアウト"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">ログアウト</span>
              </button>
            </div>
          </div>

          <nav className="flex items-center gap-1 overflow-x-auto pb-2 -mx-1 px-1">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = activeRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-slate-700 text-white'
                      : 'text-zinc-300 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5">
        {children}
      </main>
    </div>
  );
}

