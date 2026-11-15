import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { AdminAuditionHeader } from '../components/AdminAuditionHeader.tsx';
import type {
  AdminResultsResponse,
  AdminVoterMonitorDto,
  AuditionDto,
} from '../types.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

interface AdminDashboardPageProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  onAuditionsChanged: () => Promise<void>;
}

export function AdminDashboardPage({
  auditions,
  selectedAuditionId,
  onSelectAudition,
  onAuditionsChanged,
}: AdminDashboardPageProps) {
  const [results, setResults] = useState<AdminResultsResponse | null>(null);
  const [votersData, setVotersData] = useState<{
    voters: AdminVoterMonitorDto[];
    summary: { totalVoters: number; submittedCount: number; unsubmittedCount: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(true);
  const [activeTab, setActiveTab] = useState<'ranking' | 'evaluators' | 'voters'>(
    'ranking',
  );
  const [onlyUnsubmitted, setOnlyUnsubmitted] = useState(false);
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<string, string>>({});
  const [standardDiffDraft, setStandardDiffDraft] = useState('10');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!selectedAuditionId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [resData, votersRes] = await Promise.all([
        apiJson<AdminResultsResponse>(
          `/api/admin/auditions/${selectedAuditionId}/results`,
        ),
        apiJson<{
          voters: AdminVoterMonitorDto[];
          summary: {
            totalVoters: number;
            submittedCount: number;
            unsubmittedCount: number;
          };
        }>(`/api/admin/auditions/${selectedAuditionId}/voters`),
      ]);

      setResults(resData);
      setVotersData(votersRes);
      setStandardDiffDraft(String(resData.audition.standardDiff));

      const pMap: Record<string, string> = {};
      for (const b of resData.bands) {
        pMap[b.id] = String(b.penaltyDeduction);
      }
      setPenaltyDrafts(pMap);
    } finally {
      setLoading(false);
    }
  }, [selectedAuditionId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const showToast = (text: string) => {
    setStatusMsg(text);
    setTimeout(() => setStatusMsg((prev) => (prev === text ? null : prev)), 3500);
  };

  const handleUpdateSettings = async (patch: {
    isPenaltyEnabled?: boolean;
    aggregationMethod?: AggregationMethod;
    standardDiff?: number;
  }) => {
    if (!selectedAuditionId) return;
    await apiJson(`/api/admin/auditions/${selectedAuditionId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await Promise.all([onAuditionsChanged(), loadDashboard()]);
    showToast('集計・ペナルティ設定を更新しました');
  };

  const handleSavePenalty = async (bandId: string, bandName: string) => {
    if (!selectedAuditionId) return;
    const val = Number(penaltyDrafts[bandId] ?? 0);
    if (Number.isNaN(val) || val < 0) return;

    await apiJson(
      `/api/admin/auditions/${selectedAuditionId}/bands/${bandId}/penalty`,
      {
        method: 'PATCH',
        body: JSON.stringify({ penaltyDeduction: val }),
      },
    );
    await loadDashboard();
    showToast(`「${bandName}」のペナルティ減点を ${val} 点に更新しました`);
  };

  const filteredVoters = useMemo(() => {
    if (!votersData) return [];
    if (!onlyUnsubmitted) return votersData.voters;
    return votersData.voters.filter((v) => !v.isSubmitted);
  }, [votersData, onlyUnsubmitted]);

  if (auditions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
        オーディションがまだ作成されていません。「開催回・設定」タブから新規作成してください。
      </div>
    );
  }

  const audition = results?.audition;
  const bandResults = results?.aggregation.bandResults ?? [];
  const evaluatorStats = results?.aggregation.evaluatorStats ?? [];

  return (
    <div className="space-y-5">
      <AdminAuditionHeader
        auditions={auditions}
        selectedAuditionId={selectedAuditionId}
        onSelectAudition={onSelectAudition}
      />

      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-2.5 text-sm font-medium">
          {statusMsg}
        </div>
      )}

      {/* 運用設定 & エクスポート操作パネル */}
      {audition && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 集計設定 & ペナルティ切替 */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-indigo-600" />
                集計アルゴリズム・ペナルティ運用設定
              </h2>
              <button
                type="button"
                onClick={loadDashboard}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-indigo-700 cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                最新再集計
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    id: 'DIFF_CORRECTION',
                    label: `点差補正方式 (定数${audition.standardDiff})`,
                  },
                  { id: 'Z_SCORE', label: 'Zスコア（偏差値）方式' },
                  { id: 'RAW_AVERAGE', label: '単純平均方式' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleUpdateSettings({ aggregationMethod: m.id })}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                    audition.aggregationMethod === m.id
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">
                  点差補正定数:
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={standardDiffDraft}
                  onChange={(e) => setStandardDiffDraft(e.target.value)}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-right"
                />
                <button
                  type="button"
                  onClick={() => {
                    const num = Number(standardDiffDraft);
                    if (num > 0) void handleUpdateSettings({ standardDiff: num });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-xs font-semibold cursor-pointer"
                >
                  定数変更
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audition.isPenaltyEnabled}
                    onChange={(e) =>
                      handleUpdateSettings({ isPenaltyEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  ペナルティ減点を有効化 (is_penalty_enabled)
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showComparison}
                    onChange={(e) => setShowComparison(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  3方式比較列
                </label>
              </div>
            </div>
          </div>

          {/* 2ファイル Excel / CSV エクスポートパネル */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              Excel / CSV データエクスポート（2ファイル構成）
            </h2>

            <div className="space-y-2.5">
              {/* ファイル1 */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    ① 集計結果＆全Rawデータ（2シート）
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ランキング表 + 審査員別基準値＆計算過程
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`/api/admin/auditions/${audition.id}/export?target=summary_and_raw&format=xlsx`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    .xlsx
                  </a>
                  <a
                    href={`/api/admin/auditions/${audition.id}/export?target=summary_and_raw&format=csv`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold transition"
                  >
                    .csv
                  </a>
                </div>
              </div>

              {/* ファイル2 */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900">
                    ② バンド別講評シート（各バンド1シート）
                  </div>
                  <div className="text-[11px] text-slate-500">
                    正規化後点数(魅力/技術/合計) + コメント
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <a
                    href={`/api/admin/auditions/${audition.id}/export?target=band_comments&format=xlsx`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition"
                  >
                    <Download className="h-3.5 w-3.5" />
                    .xlsx
                  </a>
                  <a
                    href={`/api/admin/auditions/${audition.id}/export?target=band_comments&format=csv`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold transition"
                  >
                    .csv
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* タブナビ */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'ranking'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          ランキング・ペナルティ ({bandResults.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('voters')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'voters'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          提出状況・未提出者 ({votersData?.summary.unsubmittedCount ?? 0}名未提出)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('evaluators')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition cursor-pointer ${
            activeTab === 'evaluators'
              ? 'bg-slate-900 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          審査員別 基準値・補正係数 ({evaluatorStats.length})
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-slate-500">集計中...</div>
      ) : activeTab === 'ranking' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                  <th className="px-3 py-3 whitespace-nowrap">順位</th>
                  <th className="px-3 py-3 whitespace-nowrap">順</th>
                  <th className="px-3 py-3 min-w-[180px]">バンド名 / メンバー</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">投票数</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    素点平均
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      (魅力/技術/計)
                    </span>
                  </th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">
                    正規化平均
                    <br />
                    <span className="text-[10px] font-normal text-slate-500">
                      (魅力/技術/計)
                    </span>
                  </th>
                  <th className="px-3 py-3 whitespace-nowrap">ペナルティ減点</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-indigo-50/70 text-indigo-900">
                    最終スコア
                  </th>
                  {showComparison && (
                    <>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-slate-600">
                        比較:点差補正
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-slate-600">
                        比較:Z偏差値
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-slate-600">
                        比較:単純平均
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bandResults.map((b) => (
                  <tr key={b.bandId} className="hover:bg-slate-50/80">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-extrabold text-xs ${
                          b.rank === 1
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : b.rank <= 3
                              ? 'bg-indigo-100 text-indigo-900'
                              : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {b.rank}位{b.isTied ? ' (同率)' : ''}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500 font-mono">
                      #{b.performanceOrder}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-bold text-slate-900">{b.bandName}</div>
                      <div className="text-[11px] text-slate-500">
                        {b.memberNames.join(', ') || 'メンバー未設定'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      {b.validVoteCount}
                      <span className="text-[11px] text-slate-400">
                        {' '}
                        (コメ{b.commentCount})
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className="font-semibold text-slate-900">
                        {b.avgRawTotal.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.avgRawCharm.toFixed(1)} / {b.avgRawTech.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono">
                      <div className="font-semibold text-slate-900">
                        {b.activePrePenaltyScore.toFixed(2)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {b.activeAvgNormCharm.toFixed(1)} /{' '}
                        {b.activeAvgNormTech.toFixed(1)}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={penaltyDrafts[b.bandId] ?? '0'}
                          onChange={(e) =>
                            setPenaltyDrafts((prev) => ({
                              ...prev,
                              [b.bandId]: e.target.value,
                            }))
                          }
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-right text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleSavePenalty(b.bandId, b.bandName)}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          適用
                        </button>
                      </div>
                      {!audition?.isPenaltyEnabled && b.penaltyDeduction > 0 && (
                        <div className="text-[10px] text-amber-600 mt-0.5">
                          ※制度無効中（減点なし）
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono bg-indigo-50/40">
                      <span className="text-base font-extrabold text-indigo-800">
                        {b.activeFinalScore.toFixed(2)}
                      </span>
                    </td>
                    {showComparison && (
                      <>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {b.diffMethod.finalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {b.zScoreMethod.finalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">
                          {b.rawMethod.finalScore.toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {bandResults.length === 0 && (
                  <tr>
                    <td
                      colSpan={showComparison ? 11 : 8}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      バンドが登録されていません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'voters' ? (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                対象者計:{' '}
                <strong className="text-slate-900">
                  {votersData?.summary.totalVoters ?? 0}名
                </strong>
              </span>
              <span className="text-emerald-700 font-semibold">
                提出済: {votersData?.summary.submittedCount ?? 0}名
              </span>
              <span className="text-rose-700 font-semibold">
                未提出: {votersData?.summary.unsubmittedCount ?? 0}名
              </span>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyUnsubmitted}
                onChange={(e) => setOnlyUnsubmitted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              未提出者のみ表示
            </label>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="px-4 py-3">ステータス</th>
                    <th className="px-4 py-3">氏名 / メール</th>
                    <th className="px-4 py-3">回生</th>
                    <th className="px-4 py-3">参加権限</th>
                    <th className="px-4 py-3 text-right">入力進捗 (自バンド除外)</th>
                    <th className="px-4 py-3">提出日時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVoters.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {v.isSubmitted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            提出済
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                            <Clock className="h-3.5 w-3.5" />
                            未提出
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{v.name}</div>
                        <div className="text-xs text-slate-400 font-mono">
                          {v.email}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{v.grade}回生</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                            v.permissionType === 'SCORE_AND_COMMENT'
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {v.permissionType === 'SCORE_AND_COMMENT'
                            ? '採点＋コメント'
                            : 'コメントのみ'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {v.completedBandCount} / {v.targetBandCount} バンド
                        {v.ownBandCount > 0 && (
                          <span className="text-[11px] text-slate-400">
                            {' '}
                            (自{v.ownBandCount})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {v.submittedAt
                          ? new Date(v.submittedAt).toLocaleString('ja-JP')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredVoters.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        該当する対象者はいません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <th className="px-4 py-3">審査員名</th>
                  <th className="px-4 py-3">権限区分</th>
                  <th className="px-4 py-3 text-right">有効採点数</th>
                  <th className="px-4 py-3 text-right">最高点(MAX)</th>
                  <th className="px-4 py-3 text-right">最低点(MIN)</th>
                  <th className="px-4 py-3 text-right">点差(Diff)</th>
                  <th className="px-4 py-3 text-right">
                    補正係数 ({audition?.standardDiff ?? 10}/Diff)
                  </th>
                  <th className="px-4 py-3 text-right">素点平均</th>
                  <th className="px-4 py-3 text-right">標準偏差</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {evaluatorStats.map((e) => (
                  <tr key={e.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-sans font-bold text-slate-900">
                      {e.userName}
                    </td>
                    <td className="px-4 py-3 font-sans text-xs">
                      {e.permissionType === 'SCORE_AND_COMMENT'
                        ? '採点＋コメント'
                        : 'コメントのみ'}
                    </td>
                    <td className="px-4 py-3 text-right">{e.validVoteCount}</td>
                    <td className="px-4 py-3 text-right">
                      {e.maxScore !== null ? e.maxScore.toFixed(1) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.minScore !== null ? e.minScore.toFixed(1) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.diff !== null ? e.diff.toFixed(1) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-700">
                      {e.correctionFactor.toFixed(3)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.meanScore !== null ? e.meanScore.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.stdDev !== null ? e.stdDev.toFixed(2) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

