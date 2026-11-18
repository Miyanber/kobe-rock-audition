import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, Calendar, Radio } from 'lucide-react';
import {
  AUDITION_STATUS_META,
  getAuditionStatusLabel,
} from '../../shared/audition-status.ts';
import { sortAuditionsDesc } from '../routes.ts';
import type { AuditionDto } from '../types.ts';

interface AdminAuditionHeaderProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  isAdmin?: boolean;
  activeAudition?: AuditionDto | null;
  onGoToActiveScoring?: (auditionId: string) => void;
  actionSlot?: ReactNode;
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
  isAdmin = true,
  activeAudition = null,
  onGoToActiveScoring,
  actionSlot,
}: AdminAuditionHeaderProps) {
  if (auditions.length === 0) {
    return null;
  }

  const sorted = sortAuditionsDesc(auditions);
  const latestId = sorted[0]?.id;
  const selected = sorted.find((a) => a.id === selectedAuditionId) ?? sorted[0];
  const isOperatingPast =
    isAdmin &&
    selected &&
    ((latestId && selected.id !== latestId) || selected.status === 'CLOSED');

  const showActiveShortcut =
    selected &&
    selected.status !== 'ACTIVE' &&
    activeAudition &&
    activeAudition.id !== selected.id &&
    onGoToActiveScoring;

  return (
    <div className="mb-5 space-y-2.5">
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-3.5 sm:p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              表示中のオーディション
            </span>
            {selected && <StatusBadge status={selected.status} />}
            {selected && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <Calendar className="h-3.5 w-3.5" />
                {selected.eventDate}
              </span>
            )}
          </div>
          {selected && (
            <p className="text-sm sm:text-base font-bold text-zinc-800 truncate">
              {selected.title}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <select
            aria-label="表示するオーディションを切り替え"
            value={selected?.id ?? ''}
            onChange={(e) => onSelectAudition(e.target.value)}
            className="min-w-0 flex-1 lg:flex-initial lg:min-w-[280px] rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 focus:border-slate-700 focus:outline-none focus:ring-0"
          >
            {sorted.map((aud) => (
              <option key={aud.id} value={aud.id}>
                [{aud.eventDate}] {aud.title} ({getAuditionStatusLabel(aud.status)})
              </option>
            ))}
          </select>
          {actionSlot}
        </div>
      </div>

      {showActiveShortcut && activeAudition && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-sm px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Radio className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>
              現在「<strong>{activeAudition.title}</strong>」（{activeAudition.eventDate}）が採点受付中です
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

      {isOperatingPast && selected && (
        <div
          role="alert"
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-sm px-4 py-3 flex items-start gap-3"
        >
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold">
              ⚠️ 過去のオーディションデータを操作中です（{selected.title} / 開催日:{' '}
              {selected.eventDate}）
            </p>
            <p className="text-xs text-amber-800 mt-0.5">
              現在選択されている開催回は最新ではないか、すでに採点終了・集計済みです。誤編集・誤更新にご注意ください。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
