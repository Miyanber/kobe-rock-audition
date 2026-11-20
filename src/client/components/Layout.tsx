import type { ReactNode } from 'react';
import { Award, LogOut, Shield } from 'lucide-react';
import type { AuthUserDto } from '../types.ts';
import { getPathForRoute, NAV_ITEMS, type AppRoute } from '../routes.ts';

export type { AppRoute } from '../routes.ts';

interface LayoutProps {
  user: AuthUserDto;
  activeRoute: AppRoute;
  currentAuditionId: string | null;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
  subHeader?: ReactNode;
  children: ReactNode;
}

export function Layout({
  user,
  activeRoute,
  currentAuditionId,
  onNavigate,
  onLogout,
  subHeader,
  children,
}: LayoutProps) {
  const isAdmin = user.role === 'ADMIN';

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-100">
      <header className="sticky top-0 z-30 bg-slate-700 text-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14 gap-2 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
              <div className="h-8 w-8 rounded-sm bg-slate-600 flex items-center justify-center shrink-0">
                <Award className="h-5 w-5 text-white" />
              </div>
              <div className="truncate">
                <span className="font-bold tracking-tight text-sm sm:text-base">
                  神大ROCK AUDITION
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs bg-slate-600/50 sm:bg-slate-700 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm border border-slate-600 sm:border-slate-700 min-w-0">
                {isAdmin && (
                  <span
                    className="inline-flex items-center gap-1 text-amber-300 font-semibold shrink-0"
                    title="管理者"
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">管理者</span>
                  </span>
                )}
                <span className="font-medium text-slate-100 truncate">
                  {user.name}
                </span>
                <span className="hidden sm:inline text-zinc-400 shrink-0">
                  ({user.grade}回生)
                </span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-600 text-slate-200 border border-slate-600 sm:border-slate-700 transition cursor-pointer shrink-0"
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
              const href = getPathForRoute(item.id, currentAuditionId);
              const isGlobalTab = item.id === 'admin-users';
              return (
                <div
                  key={item.id}
                  className={
                    isGlobalTab
                      ? 'flex items-center pl-2 ml-1 border-l border-slate-500/60 shrink-0'
                      : 'shrink-0'
                  }
                >
                  <a
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={(e) => {
                      if (
                        e.metaKey ||
                        e.ctrlKey ||
                        e.shiftKey ||
                        e.altKey ||
                        e.button !== 0
                      ) {
                        return;
                      }
                      e.preventDefault();
                      onNavigate(item.id);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs sm:text-sm font-medium whitespace-nowrap transition cursor-pointer ${
                      active
                        ? 'bg-slate-600 text-white'
                        : 'text-zinc-300 hover:text-white hover:bg-slate-600/60'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </a>
                </div>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 py-5">
        {subHeader}
        {children}
      </main>
    </div>
  );
}
