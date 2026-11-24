import { useState } from 'react';
import { ArrowLeft, BookOpen, ChevronDown, List, Shield, UserCheck } from 'lucide-react';
import {
  operationsManual,
  userGuideManual,
  type CompiledManualDoc,
} from 'virtual:manual-docs';
import type { AuditionDto, AuthUserDto } from '../types.ts';

interface ManualPageProps {
  user: AuthUserDto;
  returnAudition: AuditionDto | null;
  onReturnToApp: () => void;
}

type AdminManualTab = 'operations' | 'user-guide';

export function ManualPage({
  user,
  returnAudition,
  onReturnToApp,
}: ManualPageProps) {
  const isAdmin = user.role === 'ADMIN';
  const [selectedTab, setSelectedTab] = useState<AdminManualTab>('operations');
  const [mobileTocOpen, setMobileTocOpen] = useState(false);

  const activeDoc: CompiledManualDoc =
    isAdmin && selectedTab === 'operations'
      ? operationsManual
      : userGuideManual;
  const isShowingAdminDoc = isAdmin && selectedTab === 'operations';

  const handleTocClick = (id: string) => {
    setMobileTocOpen(false);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <BookOpen className="h-4 w-4" />
              操作マニュアル
            </span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                isShowingAdminDoc
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {isShowingAdminDoc ? (
                <>
                  <Shield className="h-3 w-3" />
                  管理者向け
                </>
              ) : (
                <>
                  <UserCheck className="h-3 w-3" />
                  一般部員向け
                </>
              )}
            </span>
          </div>
          <p className="text-xs text-zinc-600">
            {isAdmin
              ? '運営委員向けの運用手順と、一般部員向けガイドの両方を確認できます。'
              : 'バンド登録から当日の採点・結果確認までの操作手順を確認できます。'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div
              className="inline-flex rounded-sm border border-zinc-300 bg-zinc-200/70 p-0.5"
              role="tablist"
              aria-label="マニュアル種別"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === 'operations'}
                onClick={() => setSelectedTab('operations')}
                className={`px-3 py-1.5 rounded-sm text-xs font-bold transition cursor-pointer ${
                  selectedTab === 'operations'
                    ? 'bg-slate-700 text-white'
                    : 'text-zinc-700 hover:bg-white'
                }`}
              >
                運営マニュアル
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={selectedTab === 'user-guide'}
                onClick={() => setSelectedTab('user-guide')}
                className={`px-3 py-1.5 rounded-sm text-xs font-bold transition cursor-pointer ${
                  selectedTab === 'user-guide'
                    ? 'bg-slate-700 text-white'
                    : 'text-zinc-700 hover:bg-white'
                }`}
              >
                一般部員向けガイド
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onReturnToApp}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-700 text-xs font-bold transition cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>
              {returnAudition ? `「${returnAudition.title}」へ戻る` : 'アプリに戻る'}
            </span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-4 items-start">
        <aside className="bg-zinc-50 border border-zinc-300 rounded-sm lg:sticky lg:top-28">
          <button
            type="button"
            onClick={() => setMobileTocOpen((prev) => !prev)}
            aria-expanded={mobileTocOpen}
            className="w-full lg:hidden flex items-center justify-between px-4 py-3 text-xs font-bold text-zinc-800 cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5">
              <List className="h-4 w-4 text-slate-700" />
              目次
            </span>
            <ChevronDown
              className={`h-4 w-4 text-zinc-500 transition-transform ${
                mobileTocOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <div className="hidden lg:flex items-center gap-1.5 px-4 py-3 border-b border-zinc-200 text-xs font-bold text-zinc-800">
            <List className="h-4 w-4 text-slate-700" />
            <span>目次</span>
          </div>

          <nav
            aria-label="マニュアル目次"
            className={`${
              mobileTocOpen ? 'block border-t border-zinc-200' : 'hidden'
            } lg:block px-3 py-2.5 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto space-y-0.5`}
          >
            {activeDoc.toc.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  handleTocClick(item.id);
                }}
                className={`block rounded-sm py-1.5 px-2 text-xs transition hover:bg-zinc-200/70 hover:text-slate-900 ${
                  item.level === 2
                    ? 'font-bold text-zinc-800'
                    : 'pl-4 text-zinc-600'
                }`}
              >
                {item.text}
              </a>
            ))}
          </nav>
        </aside>

        <article
          className="manual-prose bg-white border border-zinc-300 rounded-sm p-5 sm:p-8 min-w-0"
          dangerouslySetInnerHTML={{ __html: activeDoc.html }}
        />
      </div>
    </div>
  );
}
