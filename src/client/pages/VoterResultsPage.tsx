import { useCallback, useEffect, useState } from 'react';
import { Award, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { StatusBadge } from '../components/AdminAuditionHeader.tsx';
import type { AuditionScopedRoute } from '../routes.ts';
import type { AuditionDto, VoterResultsResponse } from '../types.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

interface VoterResultsPageProps {
  audition: AuditionDto;
  closedAuditions: AuditionDto[];
  onNavigateToAudition: (auditionId: string, route: AuditionScopedRoute) => void;
}

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

export function VoterResultsPage({
  audition,
  closedAuditions,
  onNavigateToAudition,
}: VoterResultsPageProps) {
  const [results, setResults] = useState<VoterResultsResponse | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ranking' | 'generalFeedback'>('ranking');

  const isClosed = audition.status === 'CLOSED';

  const loadResults = useCallback(async (auditionId: string) => {
    if (!auditionId) return;
    setLoadingResults(true);
    setError(null);
    try {
      const res = await apiJson<VoterResultsResponse>(
        `/api/auditions/${encodeURIComponent(auditionId)}/results`,
      );
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '集計結果の取得に失敗しました');
    } finally {
      setLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    setActiveTab('ranking');
    if (isClosed) {
      void loadResults(audition.id);
    } else {
      setResults(null);
      setError(null);
    }
  }, [audition.id, isClosed, loadResults]);

  if (!isClosed) {
    const latestClosed = closedAuditions[0] ?? null;
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-sm bg-zinc-100 flex items-center justify-center">
          <Award className="h-6 w-6 text-zinc-500" />
        </div>
        <div className="flex items-center justify-center">
          <StatusBadge status={audition.status} />
        </div>
        <h2 className="text-lg font-bold text-zinc-800">
          「{audition.title}」の集計結果はまだ公開されていません
        </h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          オーディションのステータスが「採点終了・集計」に切り替わると、
          こちらから確定した順位と集計結果を閲覧できます。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          {audition.status === 'ACTIVE' && (
            <button
              type="button"
              onClick={() => onNavigateToAudition(audition.id, 'scoring')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm transition cursor-pointer"
            >
              採点画面へ戻る
            </button>
          )}
          {latestClosed && (
            <button
              type="button"
              onClick={() => onNavigateToAudition(latestClosed.id, 'results')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white font-semibold text-sm transition cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              公開済みの「{latestClosed.title}」の結果を見る
            </button>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto bg-rose-50 border border-rose-200 rounded-sm p-6 text-center space-y-3">
        <p className="text-sm font-medium text-rose-800">{error}</p>
        <button
          type="button"
          onClick={() => void loadResults(audition.id)}
          className="px-4 py-2 rounded-sm bg-rose-700 text-white text-sm font-medium cursor-pointer"
        >
          再読み込み
        </button>
      </div>
    );
  }

  const currentAudition = results?.audition ?? audition;
  const rankings = results?.rankings ?? [];
  const generalFeedbacks = results?.generalFeedbacks ?? [];

  return (
    <div className="space-y-5">
      {/* 集計方式・更新ヘッダー */}
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={currentAudition.status} />
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadResults(audition.id)}
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

      {/* タブナビ */}
      <div className="flex items-center flex-wrap gap-2 border-b border-zinc-300 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`px-4 py-2 rounded-sm text-sm font-bold transition cursor-pointer ${
            activeTab === 'ranking'
              ? 'bg-slate-700 text-white'
              : 'bg-zinc-50 text-zinc-600 border border-zinc-300 hover:bg-zinc-100'
          }`}
        >
          ランキング ({rankings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('generalFeedback')}
          className={`px-4 py-2 rounded-sm text-sm font-bold transition cursor-pointer ${
            activeTab === 'generalFeedback'
              ? 'bg-slate-700 text-white'
              : 'bg-zinc-50 text-zinc-600 border border-zinc-300 hover:bg-zinc-100'
          }`}
        >
          全体講評 ({generalFeedbacks.length})
        </button>
      </div>

      {/* コンテンツ */}
      {loadingResults ? (
        <div className="py-12 text-center text-sm text-zinc-500">
          集計データを読み込み中...
        </div>
      ) : activeTab === 'ranking' ? (
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
      ) : (
        <div className="space-y-2.5">
          {generalFeedbacks.map((g) => (
            <div
              key={g.userId}
              className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-zinc-800">
                    {g.userName}
                  </span>
                  {g.grade !== undefined && (
                    <span className="text-xs text-zinc-500">{g.grade}回生</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                      g.permissionType === 'SCORE_AND_COMMENT'
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {g.permissionType === 'SCORE_AND_COMMENT'
                      ? '採点＋コメント'
                      : 'コメントのみ'}
                  </span>
                </div>
                {g.submittedAt && (
                  <span className="text-xs text-zinc-400">
                    {new Date(g.submittedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">
                {g.generalFeedback}
              </p>
            </div>
          ))}
          {generalFeedbacks.length === 0 && (
            <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center text-sm text-zinc-500">
              入力済みの全体講評はまだありません
            </div>
          )}
        </div>
      )}

      {/* 2ファイル Excel / CSV エクスポートパネル */}
      {isClosed && (
        <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel / CSV データエクスポート
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="p-3 rounded-sm bg-zinc-100 border border-zinc-300 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-800">
                  ① 集計結果＆全Rawデータ＆全体講評
                </div>
                <div className="text-[11px] text-zinc-500">
                  ランキング表 + 審査員別計算過程 + 全体講評シート
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/api/auditions/${currentAudition.id}/export?target=summary_and_raw&format=xlsx`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  .xlsx
                </a>
                <a
                  href={`/api/auditions/${currentAudition.id}/export?target=summary_and_raw&format=csv`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-300 text-xs font-semibold transition"
                >
                  .csv
                </a>
              </div>
            </div>

            <div className="p-3 rounded-sm bg-zinc-100 border border-zinc-300 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-zinc-800">
                  ② バンド別講評シート
                </div>
                <div className="text-[11px] text-zinc-500">
                  各バンドの正規化後点数 + コメント + 全体講評シート
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={`/api/auditions/${currentAudition.id}/export?target=band_comments&format=xlsx`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  .xlsx
                </a>
                <a
                  href={`/api/auditions/${currentAudition.id}/export?target=band_comments&format=csv`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-300 text-xs font-semibold transition"
                >
                  .csv
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
