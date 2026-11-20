import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { formatGradeLabel, getAcademicYear } from '../../shared/grade.ts';
import { isValidMemberName, normalizeMemberName } from '../../shared/name.ts';
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
  const yearOptions = [academicYear, academicYear - 1, academicYear - 2];
  const [name, setName] = useState<string>(
    normalizeMemberName(user.name ?? ''),
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    yearOptions.includes(user.enrollmentYear)
      ? user.enrollmentYear
      : academicYear,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = normalizeMemberName(name);
    if (!isValidMemberName(normalizedName)) {
      setError(
        '氏名は「苗字 名前」の形式（間に半角または全角スペース）で入力してください。',
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiJson<{ user: AuthUserDto }>(
        '/api/auth/confirm-grade',
        {
          method: 'POST',
          body: JSON.stringify({
            name: normalizedName,
            enrollmentYear: selectedYear,
          }),
        },
      );
      onConfirmed(res.user);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '登録情報の保存に失敗しました。',
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
              氏名・回生（入部年度）の登録
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              初回ログインです。正しい氏名と現在の回生（入部年度）を入力・選択してください（バンド登録や集計表示に使われます）。
            </p>
          </div>
        </div>

        <div>
          <label
            htmlFor="grade-confirm-name"
            className="block text-xs font-bold text-zinc-700 mb-1"
          >
            氏名（苗字と名前の間にスペース）
          </label>
          <input
            id="grade-confirm-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 山田 太郎"
            className="w-full rounded-sm border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-slate-700 focus:outline-none"
          />
          <p className="text-[11px] text-zinc-500 mt-1">
            半角・全角どちらのスペースでも入力できます（保存時に半角スペースへ統一されます）。
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {yearOptions.map((year) => {
            const active = selectedYear === year;
            return (
              <button
                key={year}
                type="button"
                onClick={() => setSelectedYear(year)}
                className={`px-3.5 py-2.5 rounded-sm border text-left transition cursor-pointer flex items-center justify-between ${
                  active
                    ? 'border-slate-700 bg-slate-700 text-white'
                    : 'border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                }`}
              >
                <span className="text-sm font-bold">
                  {formatGradeLabel(year)}
                </span>
                <span
                  className={`text-xs ${
                    active ? 'text-slate-200' : 'text-zinc-500'
                  }`}
                >
                  {year}年度入部
                </span>
              </button>
            );
          })}
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
