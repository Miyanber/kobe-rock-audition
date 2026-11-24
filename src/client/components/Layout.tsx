import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Award, ChevronDown, HelpCircle, LogOut, Shield } from 'lucide-react';
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const manualHref = getPathForRoute('manual', currentAuditionId);
  const isManualActive = activeRoute === 'manual';

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

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

            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div ref={accountMenuRef} className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((prev) => !prev)}
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="menu"
                  title="アカウントメニュー"
                  className="inline-flex items-center gap-1.5 sm:gap-2 text-xs bg-slate-600/50 hover:bg-slate-600 sm:bg-slate-700 sm:hover:bg-slate-600 px-2 sm:px-3 py-1 sm:py-1.5 rounded-sm border border-slate-600 sm:border-slate-600/80 transition cursor-pointer min-w-0 max-w-[165px] sm:max-w-none"
                >
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
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-slate-300 shrink-0 transition-transform ${
                      accountMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    aria-label="アカウントメニュー"
                    className="absolute right-0 mt-1.5 w-60 rounded-sm border border-zinc-300 bg-white text-zinc-800 shadow-lg z-40 overflow-hidden"
                  >
                    <div className="px-3.5 py-2.5 bg-zinc-50 border-b border-zinc-200 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-zinc-800 truncate">
                          {user.name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-semibold shrink-0 ${
                            isAdmin
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-zinc-200 text-zinc-700'
                          }`}
                        >
                          {isAdmin && <Shield className="h-3 w-3" />}
                          {isAdmin ? '管理者' : '一般部員'}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {user.grade}回生（{user.enrollmentYear}年度入部）
                      </p>
                    </div>
                    <div className="p-1.5">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          onLogout();
                        }}
                        className="w-full inline-flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs font-semibold text-rose-700 hover:bg-rose-50 transition cursor-pointer text-left"
                      >
                        <LogOut className="h-3.5 w-3.5 shrink-0" />
                        <span>ログアウト</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <a
                href={manualHref}
                aria-label="マニュアル"
                aria-current={isManualActive ? 'page' : undefined}
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
                  setAccountMenuOpen(false);
                  onNavigate('manual');
                }}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-sm border transition cursor-pointer shrink-0 ${
                  isManualActive
                    ? 'bg-slate-600 text-white border-slate-500'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600'
                }`}
                title="操作マニュアルを表示"
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">マニュアル</span>
              </a>
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
                      setAccountMenuOpen(false);
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
