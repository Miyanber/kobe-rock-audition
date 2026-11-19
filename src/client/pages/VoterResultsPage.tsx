import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  Clock,
  Download,
  FileSpreadsheet,
  MessageSquareText,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { StatusBadge } from '../components/AdminAuditionHeader.tsx';
import type { AuditionScopedRoute } from '../routes.ts';
import type { AuditionDto, VoterResultsResponse } from '../types.ts';
import { round2 } from '../../shared/aggregation.ts';
import type {
  AggregationMethod,
  PermissionType,
} from '../../shared/schema/index.ts';

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
  const [activeTab, setActiveTab] = useState<
    'ranking' | 'bandComments' | 'generalFeedback'
  >('ranking');
  const [selectedCommentBandId, setSelectedCommentBandId] = useState<string>('');
  const [commentPermissionFilter, setCommentPermissionFilter] = useState<
    'ALL' | PermissionType
  >('ALL');
  const [commentSearchQuery, setCommentSearchQuery] = useState('');

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
    setSelectedCommentBandId('');
    setCommentPermissionFilter('ALL');
    setCommentSearchQuery('');
    if (isClosed) {
      void loadResults(audition.id);
    } else {
      setResults(null);
      setError(null);
    }
  }, [audition.id, isClosed, loadResults]);

  const orderedBands = useMemo(
    () =>
      [...(results?.rankings ?? [])].sort(
        (a, b) => a.performanceOrder - b.performanceOrder,
      ),
    [results?.rankings],
  );

  const selectedCommentBand = useMemo(
    () => orderedBands.find((b) => b.bandId === selectedCommentBandId) ?? null,
    [orderedBands, selectedCommentBandId],
  );

  const allSelectedBandComments = useMemo(() => {
    if (!selectedCommentBandId) return [];
    return (results?.bandComments ?? []).filter(
      (v) => v.bandId === selectedCommentBandId,
    );
  }, [results?.bandComments, selectedCommentBandId]);

  const filteredSelectedBandComments = useMemo(() => {
    const normalizedQuery = commentSearchQuery.trim().toLowerCase();
    return allSelectedBandComments.filter((v) => {
      if (
        commentPermissionFilter !== 'ALL' &&
        v.permissionType !== commentPermissionFilter
      ) {
        return false;
      }
      if (normalizedQuery) {
        const matchesEvaluator = v.evaluatorName
          .toLowerCase()
          .includes(normalizedQuery);
        const matchesComment = v.comment
          .toLowerCase()
          .includes(normalizedQuery);
        if (!matchesEvaluator && !matchesComment) {
          return false;
        }
      }
      return true;
    });
  }, [allSelectedBandComments, commentPermissionFilter, commentSearchQuery]);

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
    const isPendingSubmission = error.includes('未提出');
    return (
      <div
        className={`max-w-2xl mx-auto border rounded-sm p-6 text-center space-y-3 ${
          isPendingSubmission
            ? 'bg-amber-50 border-amber-200'
            : 'bg-rose-50 border-rose-200'
        }`}
      >
        {isPendingSubmission && (
          <div className="mx-auto h-10 w-10 rounded-sm bg-amber-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-700" />
          </div>
        )}
        <p
          className={`text-sm font-medium ${
            isPendingSubmission ? 'text-amber-900' : 'text-rose-800'
          }`}
        >
          {error}
        </p>
        <button
          type="button"
          onClick={() => void loadResults(audition.id)}
          className={`px-4 py-2 rounded-sm text-white text-sm font-medium cursor-pointer ${
            isPendingSubmission
              ? 'bg-amber-700 hover:bg-amber-800'
              : 'bg-rose-700 hover:bg-rose-800'
          }`}
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
      <div className="grid grid-cols-3 sm:inline-flex gap-1 bg-zinc-200/70 p-1 rounded-sm border border-zinc-300">
        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`w-full sm:w-auto flex items-center justify-center gap-1 px-2.5 sm:px-4 py-2 rounded-sm text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'ranking'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'bg-white/80 sm:bg-transparent text-zinc-700 hover:bg-white'
          }`}
        >
          <span>ランキング</span>
          <span className="text-[11px] opacity-80">({rankings.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('bandComments')}
          className={`w-full sm:w-auto flex items-center justify-center gap-1 px-2.5 sm:px-4 py-2 rounded-sm text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'bandComments'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'bg-white/80 sm:bg-transparent text-zinc-700 hover:bg-white'
          }`}
        >
          <span>バンド別講評</span>
          <span className="text-[11px] opacity-80">({orderedBands.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('generalFeedback')}
          className={`w-full sm:w-auto flex items-center justify-center gap-1 px-2.5 sm:px-4 py-2 rounded-sm text-xs sm:text-sm font-bold transition cursor-pointer ${
            activeTab === 'generalFeedback'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'bg-white/80 sm:bg-transparent text-zinc-700 hover:bg-white'
          }`}
        >
          <span>全体講評</span>
          <span className="text-[11px] opacity-80">
            ({generalFeedbacks.length})
          </span>
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
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCommentBandId(b.bandId);
                          setActiveTab('bandComments');
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                      >
                        <MessageSquareText className="h-3 w-3" />
                        講評を見る ({b.commentCount})
                      </button>
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
      ) : activeTab === 'bandComments' ? (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm font-bold text-zinc-800 flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-slate-700" />
                <span>バンド別講評・正規化後スコア一覧</span>
                {selectedCommentBand && (
                  <span className="text-xs font-semibold text-zinc-500">
                    （表示件数: {filteredSelectedBandComments.length}件）
                  </span>
                )}
              </div>
              {(commentPermissionFilter !== 'ALL' ||
                commentSearchQuery.trim() !== '') && (
                <button
                  type="button"
                  onClick={() => {
                    setCommentPermissionFilter('ALL');
                    setCommentSearchQuery('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-900 hover:underline cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  絞り込みをリセット
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="voter-band-comment-select"
                  className="block text-xs font-bold text-zinc-700 mb-1"
                >
                  バンド選択
                </label>
                <select
                  id="voter-band-comment-select"
                  value={selectedCommentBandId}
                  onChange={(e) => setSelectedCommentBandId(e.target.value)}
                  className="w-full rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-zinc-800 focus:border-slate-700 focus:outline-none"
                >
                  <option value="">-- バンドを選択してください --</option>
                  {orderedBands.map((b) => (
                    <option key={b.bandId} value={b.bandId}>
                      #{b.performanceOrder} {b.bandName} ({b.commentCount}件)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="voter-band-comment-permission"
                  className="block text-xs font-bold text-zinc-700 mb-1"
                >
                  権限区分
                </label>
                <select
                  id="voter-band-comment-permission"
                  value={commentPermissionFilter}
                  disabled={!selectedCommentBand}
                  onChange={(e) =>
                    setCommentPermissionFilter(
                      e.target.value as 'ALL' | PermissionType,
                    )
                  }
                  className="w-full rounded-sm border border-zinc-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-zinc-800 focus:border-slate-700 focus:outline-none disabled:opacity-50"
                >
                  <option value="ALL">すべて</option>
                  <option value="SCORE_AND_COMMENT">採点＋コメント</option>
                  <option value="COMMENT_ONLY">コメントのみ</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="voter-band-comment-search"
                  className="block text-xs font-bold text-zinc-700 mb-1"
                >
                  キーワード検索（採点者名・コメント）
                </label>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="voter-band-comment-search"
                    type="text"
                    disabled={!selectedCommentBand}
                    value={commentSearchQuery}
                    onChange={(e) => setCommentSearchQuery(e.target.value)}
                    placeholder="採点者名やコメントで検索..."
                    className="w-full rounded-sm border border-zinc-300 bg-white pl-8 pr-8 py-1.5 text-xs sm:text-sm focus:border-slate-700 focus:outline-none disabled:opacity-50"
                  />
                  {commentSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCommentSearchQuery('')}
                      aria-label="検索をクリア"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {!selectedCommentBand ? (
            <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center text-sm text-zinc-500">
              {orderedBands.length === 0
                ? 'バンドが登録されていません'
                : '上のプルダウンからバンドを選択すると、講評と正規化後スコアが表示されます。'}
            </div>
          ) : (
            <div className="bg-zinc-50 border border-zinc-300 rounded-sm overflow-hidden">
              <div className="px-4 py-3 bg-zinc-100 border-b border-zinc-300 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-sm bg-slate-700 text-white text-xs font-bold">
                      #{selectedCommentBand.performanceOrder}
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-zinc-800">
                      {selectedCommentBand.bandName}
                    </h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-white border border-zinc-300 text-xs font-bold text-slate-800">
                      {selectedCommentBand.rank}位
                      {selectedCommentBand.isTied ? ' (同率)' : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    メンバー:{' '}
                    {selectedCommentBand.memberNames.join(', ') || '未設定'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2 py-1 rounded-sm bg-white border border-zinc-300 text-zinc-700">
                    表示 {filteredSelectedBandComments.length} / 全
                    {allSelectedBandComments.length}件（有効採点{' '}
                    {selectedCommentBand.validVoteCount}）
                  </span>
                  <span className="px-2 py-1 rounded-sm bg-slate-700 text-white font-bold">
                    平均 魅力{' '}
                    {round2(selectedCommentBand.activeAvgNormCharm).toFixed(2)}{' '}
                    / 技術{' '}
                    {round2(selectedCommentBand.activeAvgNormTech).toFixed(2)} /
                    最終{' '}
                    {round2(selectedCommentBand.activeFinalScore).toFixed(2)}
                  </span>
                </div>
              </div>

              {filteredSelectedBandComments.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-500 bg-white">
                  （条件に一致する採点・コメントデータはありません）
                </div>
              ) : (
                <div className="overflow-x-auto bg-white">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-600 font-bold">
                        <th className="px-3 py-2.5 whitespace-nowrap">
                          採点者名
                        </th>
                        <th className="px-3 py-2.5 whitespace-nowrap">
                          権限区分
                        </th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">
                          正規化後_魅力点
                        </th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">
                          正規化後_技術点
                        </th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">
                          正規化後_合計点
                        </th>
                        <th className="px-3 py-2.5 min-w-[260px]">コメント</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSelectedBandComments.map((v) => (
                        <tr
                          key={`${v.bandId}-${v.evaluatorUserId}`}
                          className="hover:bg-zinc-50/80 align-top"
                        >
                          <td className="px-3 py-2.5 font-semibold text-zinc-800 whitespace-nowrap">
                            {v.evaluatorName}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold ${
                                v.permissionType === 'SCORE_AND_COMMENT'
                                  ? 'bg-slate-100 text-slate-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {v.permissionType === 'SCORE_AND_COMMENT'
                                ? '採点＋コメント'
                                : 'コメントのみ'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                            {v.activeNormalized
                              ? round2(v.activeNormalized.normCharm).toFixed(2)
                              : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">
                            {v.activeNormalized
                              ? round2(v.activeNormalized.normTech).toFixed(2)
                              : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {v.activeNormalized
                              ? round2(v.activeNormalized.normTotal).toFixed(2)
                              : '-'}
                          </td>
                          <td className="px-3 py-2.5 text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">
                            {v.comment.trim() || '（コメントなし）'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
