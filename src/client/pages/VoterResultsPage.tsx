import { useCallback, useEffect, useState } from 'react';
import { Award, Calendar, RefreshCw } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { StatusBadge } from '../components/AdminAuditionHeader.tsx';
import type { AuditionDto, VoterResultsResponse } from '../types.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

function getAggregationMethodLabel(
  method: AggregationMethod,
  standardDiff: number,
): string {
  switch (method) {
    case 'DIFF_CORRECTION':
      return `点差補正方式 (定数${standardDiff})`;
    case 'Z_SCORE':
      return 'Zスコア（偏差値）方式';
    case 'RAW_AVERAGE':
      return '単純平均方式';
  }
}

export function VoterResultsPage() {
  const [closedAuditions, setClosedAuditions] = useState<AuditionDto[]>([]);
  const [selectedAuditionId, setSelectedAuditionId] = useState('');
  const [results, setResults] = useState<VoterResultsResponse | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadClosedAuditions = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await apiJson<{ auditions: AuditionDto[] }>(
        '/api/auditions/closed',
      );
      setClosedAuditions(res.auditions);
      if (res.auditions.length > 0) {
        setSelectedAuditionId((prev) =>
          prev && res.auditions.some((a) => a.id === prev)
            ? prev
            : res.auditions[0].id,
        );
      } else {
        setSelectedAuditionId('');
        setResults(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'オーディション一覧の取得に失敗しました',
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadResults = useCallback(async (auditionId: string) => {
    if (!auditionId) return;
    setLoadingResults(true);
    setError(null);
    try {
      const res = await apiJson<VoterResultsResponse>(
        `/api/auditions/${auditionId}/results`,
      );
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '集計結果の取得に失敗しました');
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    void loadClosedAuditions();
  }, [loadClosedAuditions]);

  useEffect(() => {
    if (selectedAuditionId) {
      void loadResults(selectedAuditionId);
    }
  }, [selectedAuditionId, loadResults]);

  if (loadingList) {
    return (
      <div className="py-16 text-center text-sm text-zinc-500">
        集計結果を読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto bg-rose-50 border border-rose-200 rounded-sm p-6 text-center space-y-3">
        <p className="text-sm font-medium text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() =>
            selectedAuditionId
              ? void loadResults(selectedAuditionId)
              : void loadClosedAuditions()
          }
          className="px-4 py-2 rounded-sm bg-rose-700 text-white text-sm font-medium cursor-pointer"
        >
          再読み込み
        </button>
      </div>
    );
  }

  if (closedAuditions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-3">
        <div className="mx-auto h-12 w-12 rounded-sm bg-zinc-100 flex items-center justify-center">
          <Award className="h-6 w-6 text-zinc-500" />
        </div>
        <h2 className="text-lg font-bold text-zinc-800">
          公開中の集計結果はありません
        </h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          オーディションのステータスが「採点終了・集計」に切り替わると、
          こちらから確定した順位と集計結果を閲覧できます。
        </p>
      </div>
    );
  }

  const currentAudition =
    results?.audition ??
    closedAuditions.find((a) => a.id === selectedAuditionId) ??
    closedAuditions[0];
  const rankings = results?.rankings ?? [];

  return (
    <div className="space-y-5">
      {/* 対象オーディション選択ヘッダー */}
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={currentAudition.status} />
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <Calendar className="h-3.5 w-3.5" />
              開催日: {currentAudition.eventDate}
            </span>
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-zinc-800">
            {currentAudition.title} 集計順位
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
            <span className="px-2 py-0.5 rounded-sm bg-zinc-100 border border-zinc-300 font-medium">
              集計方式:{' '}
              {getAggregationMethodLabel(
                currentAudition.aggregationMethod,
                currentAudition.standardDiff,
              )}
            </span>
            <span className="px-2 py-0.5 rounded-sm bg-zinc-100 border border-zinc-300 font-medium">
              ペナルティ減点:{' '}
              {currentAudition.isPenaltyEnabled ? '有効' : '無効'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={selectedAuditionId}
            onChange={(e) => setSelectedAuditionId(e.target.value)}
            aria-label="閲覧するオーディションを選択"
            className="w-full sm:w-auto min-w-0 rounded-sm border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 focus:border-slate-600 focus:outline-none"
          >
            {closedAuditions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} ({a.eventDate})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadResults(selectedAuditionId)}
            disabled={loadingResults}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingResults ? 'animate-spin' : ''}`}
            />
            更新
          </button>
        </div>
      </div>

      {/* ランキングテーブル */}
      {loadingResults ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          集計データを読み込み中...
        </div>
      ) : (
        <div className="bg-zinc-50 border border-zinc-300 rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-zinc-100 border-b border-zinc-300 text-zinc-700 font-bold">
                  <th className="px-3 py-3 whitespace-nowrap">順位</th>
                  <th className="px-3 py-3 whitespace-nowrap">順</th>
                  <th className="px-3 py-3 min-w-[180px]">バンド名 / メンバー</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">投票数</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    素点平均
                    <br />
                    <span className="text-[10px] font-normal text-zinc-500">
                      (魅力/技術/計)
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    正規化平均
                    <br />
                    <span className="text-[10px] font-normal text-zinc-500">
                      (魅力/技術/計)
                    </span>
                  </th>
                  {currentAudition.isPenaltyEnabled && (
                    <th className="px-3 py-3 text-right whitespace-nowrap">
                      ペナルティ減点
                    </th>
                  )}
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-slate-100 text-slate-800">
                    最終スコア
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rankings.map((b) => (
                  <tr key={b.bandId} className="hover:bg-zinc-100/80">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm font-extrabold text-xs ${
                          b.rank === 1
                            ? 'bg-amber-50 text-amber-900 border border-amber-300'
                            : b.rank <= 3
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {b.rank}位{b.isTied ? ' (同率)' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-zinc-500 font-mono">
                      #{b.performanceOrder}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-zinc-800">{b.bandName}</div>
                      <div className="text-[11px] text-zinc-500">
                        {b.memberNames.join(', ') || 'メンバー未設定'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {b.validVoteCount}
                      <span className="text-[11px] text-zinc-400">
                        {' '}
                        (コメ{b.commentCount})
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className="font-semibold text-zinc-800">
                        {b.avgRawTotal.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {b.avgRawCharm.toFixed(1)} / {b.avgRawTech.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className="font-semibold text-zinc-800">
                        {b.activePrePenaltyScore.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {b.activeAvgNormCharm.toFixed(1)} /{' '}
                        {b.activeAvgNormTech.toFixed(1)}
                      </div>
                    </td>
                    {currentAudition.isPenaltyEnabled && (
                      <td className="px-3 py-3 text-right font-mono text-zinc-700">
                        {b.appliedPenalty > 0
                          ? `-${b.appliedPenalty.toFixed(1)}`
                          : '0'}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-mono bg-slate-100">
                      <span className="text-base font-extrabold text-slate-800">
                        {b.activeFinalScore.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
                {rankings.length === 0 && (
                  <tr>
                    <td
                      colSpan={currentAudition.isPenaltyEnabled ? 8 : 7}
                      className="px-4 py-8 text-center text-zinc-500"
                    >
                      バンドが登録されていません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
