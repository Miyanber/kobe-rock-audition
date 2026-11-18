import type { ReactNode } from 'react';
import { ArrowRight, Music, Radio } from 'lucide-react';
import {
  AUDITION_STATUS_META,
  getAuditionStatusLabel,
} from '../../shared/audition-status.ts';
import { getAcademicYearFromDateString } from '../../shared/grade.ts';
import { sortAuditionsDesc, type AuditionScopedRoute } from '../routes.ts';
import type { AuditionDto } from '../types.ts';

interface AdminAuditionHeaderProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  activeRoute?: AuditionScopedRoute;
  showStatusBanners?: boolean;
  activeAudition?: AuditionDto | null;
  draftAudition?: AuditionDto | null;
  onGoToActiveScoring?: (auditionId: string) => void;
  onGoToDraftBands?: (auditionId: string) => void;
  actionSlot?: ReactNode;
  showOldAuditions?: boolean;
  oldAuditionCount?: number;
  onToggleShowOldAuditions?: (show: boolean) => void;
}

export function StatusBadge({ status }: { status: AuditionDto['status'] }) {
  const meta = AUDITION_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold border ${meta.badgeClassName}`}
    >
      {meta.label}
    </span>
  );
}

export function AdminAuditionHeader({
  auditions,
  selectedAuditionId,
  onSelectAudition,
  activeRoute,
  showStatusBanners = true,
  activeAudition = null,
  draftAudition = null,
  onGoToActiveScoring,
  onGoToDraftBands,
  actionSlot,
  showOldAuditions = false,
  oldAuditionCount = 0,
  onToggleShowOldAuditions,
}: AdminAuditionHeaderProps) {
  if (auditions.length === 0) {
    return null;
  }

  const sorted = sortAuditionsDesc(auditions);
  const selected = sorted.find((a) => a.id === selectedAuditionId) ?? sorted[0];

  const showActiveShortcut = Boolean(
    showStatusBanners &&
      activeRoute === 'scoring' &&
      selected &&
      activeAudition &&
      activeAudition.id !== selected.id &&
      onGoToActiveScoring,
  );

  const showDraftShortcut = Boolean(
    showStatusBanners &&
      activeRoute === 'wiki' &&
      selected &&
      draftAudition &&
      draftAudition.id !== selected.id &&
      onGoToDraftBands,
  );

  return (
    <div className="mb-5 space-y-2.5">
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-3.5 sm:p-4 space-y-2.5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                表示中のイベント
              </span>
              {selected && <StatusBadge status={selected.status} />}
            </div>
            {selected && (
              <p className="text-sm sm:text-base font-bold text-zinc-800 truncate">
                {selected.title}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto">
            <select
              aria-label="表示するイベントを切り替え"
              value={selected?.id ?? ''}
              onChange={(e) => onSelectAudition(e.target.value)}
              className="min-w-0 flex-1 lg:flex-initial lg:min-w-[280px] rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 focus:border-slate-700 focus:outline-none focus:ring-0"
            >
              {sorted.map((aud) => (
                <option key={aud.id} value={aud.id}>
                  [{getAcademicYearFromDateString(aud.eventDate)}] {aud.title} -{' '}
                  {getAuditionStatusLabel(aud.status)}
                </option>
              ))}
            </select>
            {actionSlot}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-zinc-500">
            ※操作や入力を行う前に、正しいイベントを選択しているかご確認ください。
          </p>
          {(oldAuditionCount > 0 || showOldAuditions) &&
            onToggleShowOldAuditions && (
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOldAuditions}
                  onChange={(e) => onToggleShowOldAuditions(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-slate-700"
                />
                <span>
                  半年以上前のイベントを表示
                  {oldAuditionCount > 0 ? ` (${oldAuditionCount}件)` : ''}
                </span>
              </label>
            )}
        </div>
      </div>

      {showActiveShortcut && activeAudition && onGoToActiveScoring && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-sm px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Radio className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              現在「<strong>{activeAudition.title}</strong>」が採点受付中です
            </span>
          </div>
          <button
            type="button"
            onClick={() => onGoToActiveScoring(activeAudition.id)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition cursor-pointer shrink-0"
          >
            <span>採点画面へ移動</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {showDraftShortcut && draftAudition && onGoToDraftBands && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-sm px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Music className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              現在「<strong>{draftAudition.title}</strong>」のバンド募集中です
            </span>
          </div>
          <button
            type="button"
            onClick={() => onGoToDraftBands(draftAudition.id)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold transition cursor-pointer shrink-0"
          >
            <span>バンド登録へ移動</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
