import { AlertTriangle, Calendar } from 'lucide-react';
import {
  AUDITION_STATUS_META,
  getAuditionStatusLabel,
} from '../../shared/audition-status.ts';
import type { AuditionDto } from '../types.ts';

interface AdminAuditionHeaderProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
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
}: AdminAuditionHeaderProps) {
  if (auditions.length === 0) {
    return null;
  }

  // APIから開催日降順（eventDate DESC）で受け取っている想定だが念のため降順ソートを保証
  const sorted = [...auditions].sort((a, b) =>
    b.eventDate.localeCompare(a.eventDate),
  );
  const latestId = sorted[0]?.id;
  const selected = sorted.find((a) => a.id === selectedAuditionId) ?? sorted[0];
  const isOperatingPast =
    selected &&
    ((latestId && selected.id !== latestId) || selected.status === 'CLOSED');

  return (
    <div className="mb-5 space-y-2.5">
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            操作対象オーディション
          </span>
          {selected && <StatusBadge status={selected.status} />}
          {selected && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Calendar className="h-3.5 w-3.5" />
              開催日: {selected.eventDate}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="操作対象のオーディションを選択"
            value={selected?.id ?? ''}
            onChange={(e) => onSelectAudition(e.target.value)}
            className="w-full sm:w-auto min-w-[280px] rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800 focus:border-slate-700 focus:outline-none focus:ring-0"
          >
            {sorted.map((aud) => (
              <option key={aud.id} value={aud.id}>
                [{aud.eventDate}] {aud.title} ({getAuditionStatusLabel(aud.status)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {isOperatingPast && selected && (
        <div
          role="alert"
          className="bg-amber-50  border-amber-200 text-amber-900 rounded-sm px-4 py-3 flex items-start gap-3"
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

