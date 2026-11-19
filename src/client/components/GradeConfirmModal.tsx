import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { formatGradeLabel, getAcademicYear } from '../../shared/grade.ts';
import type { AuthUserDto } from '../types.ts';

interface GradeConfirmModalProps {
  user: AuthUserDto;
  onConfirmed: (updatedUser: AuthUserDto) => void;
}

export function GradeConfirmModal({
  user,
  onConfirmed,
}: GradeConfirmModalProps) {
  const academicYear = getAcademicYear();
  const [selectedYear, setSelectedYear] = useState<number>(
    user.enrollmentYear || academicYear,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearOptions = Array.from({ length: 8 }, (_, idx) => academicYear - idx);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiJson<{ user: AuthUserDto }>(
        '/api/auth/confirm-grade',
        {
          method: 'POST',
          body: JSON.stringify({ enrollmentYear: selectedYear }),
        },
      );
      onConfirmed(res.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '回生の保存に失敗しました。',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="grade-confirm-title"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-sm border border-zinc-300 bg-white p-6 shadow-lg space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-sm bg-slate-100 p-2 text-slate-700 shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2
              id="grade-confirm-title"
              className="text-base font-bold text-zinc-800"
            >
              回生（入部年度）の確認
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {user.name} さんの初回ログインです。学籍番号から推定された回生を確認し、必要に応じて修正してください（バンド登録や集計表示に使われます）。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {yearOptions.slice(0, 4).map((year) => {
            const active = selectedYear === year;
            return (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-2.5 rounded-sm border text-left transition cursor-pointer ${
                  active
                    ? 'border-slate-700 bg-slate-700 text-white'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <div className="text-sm font-bold">
                  {formatGradeLabel(year)}
                </div>
                <div
                  className={`text-[11px] ${
                    active ? 'text-slate-200' : 'text-zinc-500'
                  }`}
                >
                  {year}年度入部
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <label
            htmlFor="grade-confirm-select"
            className="block text-xs font-bold text-zinc-700 mb-1"
          >
            その他の年度（5回生・院生・OB/OGなど）
          </label>
          <select
            id="grade-confirm-select"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="w-full rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {formatGradeLabel(year)}（{year}年度入部）
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-sm border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? '保存中...' : 'この回生で確定する'}
          </button>
        </div>
      </form>
    </div>
  );
}
