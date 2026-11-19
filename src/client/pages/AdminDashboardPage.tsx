import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { ToastNotification } from '../components/ToastNotification.tsx';
import { ToggleSwitch } from '../components/ToggleSwitch.tsx';
import type {
  AdminResultsResponse,
  AdminVoterMonitorDto,
  AuditionDto,
} from '../types.ts';
import { calculateGrade } from '../../shared/grade.ts';
import type { AggregationMethod } from '../../shared/schema/index.ts';

interface AdminDashboardPageProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onAuditionsChanged: () => Promise<void>;
}

export function AdminDashboardPage({
  auditions,
  selectedAuditionId,
  onAuditionsChanged,
}: AdminDashboardPageProps) {
  const [results, setResults] = useState<AdminResultsResponse | null>(null);
  const [votersData, setVotersData] = useState<{
    voters: AdminVoterMonitorDto[];
    summary: { totalVoters: number; submittedCount: number; unsubmittedCount: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'ranking' | 'voters' | 'generalFeedback'
  >('ranking');
  const [onlyUnsubmitted, setOnlyUnsubmitted] = useState(false);
  const [showEmptyFeedbacks, setShowEmptyFeedbacks] = useState(false);
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<string, string>>({});
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

  const unsubmittedVoters = useMemo(
    () => (votersData?.voters ?? []).filter((v) => !v.isSubmitted),
    [votersData],
  );

  const handleCopyUnsubmittedList = async () => {
    if (unsubmittedVoters.length === 0) return;

    const byGrade = new Map<number, AdminVoterMonitorDto[]>();
    for (const v of unsubmittedVoters) {
      const list = byGrade.get(v.grade) ?? [];
      list.push(v);
      byGrade.set(v.grade, list);
    }

    const sortedGrades = Array.from(byGrade.keys()).sort((a, b) => b - a);
    const title = audition?.title ?? '';
    const lines: string[] = [
      `【${title}オーディション 採点・コメント 未提出者一覧（${unsubmittedVoters.length}名）】`,
    ];

    for (const grade of sortedGrades) {
      lines.push('');
      lines.push(`■ ${grade}回生`);
      const members = byGrade.get(grade) ?? [];
      for (const m of members) {
        const suffix =
          m.permissionType === 'COMMENT_ONLY' ? '（コメントのみ）' : '';
        lines.push(`・${m.name}${suffix}`);
      }
    }

    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    showToast(`未提出者 ${unsubmittedVoters.length}名のリストをコピーしました`);
  };

  if (auditions.length === 0) {
    return (
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center text-sm text-zinc-600">
        オーディションがまだ作成されていません。「開催回・設定」タブから新規作成してください。
      </div>
    );
  }

  const audition = results?.audition;
  const bandResults = results?.aggregation.bandResults ?? [];
  const generalFeedbacks = results?.aggregation.generalFeedbacks ?? [];
  const enteredFeedbackCount = useMemo(
    () => generalFeedbacks.filter((g) => g.generalFeedback.trim().length > 0).length,
    [generalFeedbacks],
  );
  const filteredGeneralFeedbacks = useMemo(() => {
    if (showEmptyFeedbacks) return generalFeedbacks;
    return generalFeedbacks.filter((g) => g.generalFeedback.trim().length > 0);
  }, [generalFeedbacks, showEmptyFeedbacks]);

  return (
    <div className="space-y-5">
      <ToastNotification
        message={statusMsg ? { text: statusMsg, type: 'success' } : null}
        onClose={() => setStatusMsg(null)}
      />

      {/* 運用設定 */}
      {audition && (
        <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
              <Sliders className="h-4 w-4 text-slate-700" />
              集計アルゴリズム設定
            </h2>
            <button
              type="button"
              onClick={loadDashboard}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-slate-700 cursor-pointer"
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
                  label: `点差補正方式・定数${audition.standardDiff}`,
                },
                { id: 'Z_SCORE', label: 'Zスコア偏差値方式' },
                { id: 'RAW_AVERAGE', label: '単純平均方式' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleUpdateSettings({ aggregationMethod: m.id })}
                className={`px-3 py-2 rounded-sm text-xs font-bold border transition cursor-pointer ${audition.aggregationMethod === m.id
                  ? 'bg-slate-700 text-white border-slate-700'
                  : 'bg-zinc-100 hover:bg-zinc-100 text-zinc-700 border-zinc-300'
                  }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-300">
            <div className="flex flex-wrap items-center gap-4">
              <ToggleSwitch
                checked={audition.isPenaltyEnabled}
                onChange={(checked) =>
                  handleUpdateSettings({ isPenaltyEnabled: checked })
                }
                size="sm"
                label="ペナルティ減点を有効化"
              />

              <ToggleSwitch
                checked={showComparison}
                onChange={setShowComparison}
                size="sm"
                label="3方式比較列"
              />
            </div>
          </div>
        </div>
      )}

      {/* タブナビ */}
      <div className="flex items-center flex-wrap gap-2 border-b border-zinc-300 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('ranking')}
          className={`px-4 py-2 rounded-sm text-sm font-bold transition cursor-pointer ${activeTab === 'ranking'
            ? 'bg-slate-700 text-white'
            : 'bg-zinc-50 text-zinc-600 border border-zinc-300 hover:bg-zinc-100'
            }`}
        >
          ランキング ({bandResults.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('voters')}
          className={`px-4 py-2 rounded-sm text-sm font-bold transition cursor-pointer ${activeTab === 'voters'
            ? 'bg-slate-700 text-white'
            : 'bg-zinc-50 text-zinc-600 border border-zinc-300 hover:bg-zinc-100'
            }`}
        >
          提出状況 ({votersData?.summary.unsubmittedCount ?? 0}名未提出)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('generalFeedback')}
          className={`px-4 py-2 rounded-sm text-sm font-bold transition cursor-pointer ${activeTab === 'generalFeedback'
            ? 'bg-slate-700 text-white'
            : 'bg-zinc-50 text-zinc-600 border border-zinc-300 hover:bg-zinc-100'
            }`}
        >
          全体講評 ({enteredFeedbackCount})
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">集計中...</div>
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
                  {audition?.isPenaltyEnabled && (
                    <th className="px-3 py-3 whitespace-nowrap">ペナルティ減点</th>
                  )}
                  <th className="px-3 py-3 text-right whitespace-nowrap bg-slate-100 text-slate-800">
                    最終スコア
                  </th>
                  {showComparison && (
                    <>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-zinc-600">
                        比較:点差補正
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-zinc-600">
                        比較:Z偏差値
                      </th>
                      <th className="px-3 py-3 text-right whitespace-nowrap text-zinc-600">
                        比較:単純平均
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bandResults.map((b) => (
                  <tr key={b.bandId} className="hover:bg-zinc-100/80">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm font-extrabold text-xs ${b.rank === 1
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
                    {audition?.isPenaltyEnabled && (
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
                            className="w-16 rounded-sm border border-zinc-300 px-2 py-1 text-right text-xs font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePenalty(b.bandId, b.bandName)}
                            className="px-2 py-1 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            適用
                          </button>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-mono bg-slate-100">
                      <span className="text-base font-extrabold text-slate-800">
                        {b.activeFinalScore.toFixed(2)}
                      </span>
                    </td>
                    {showComparison && (
                      <>
                        <td className="px-3 py-3 text-right font-mono text-zinc-600">
                          {b.diffMethod.finalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-zinc-600">
                          {b.zScoreMethod.finalScore.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-zinc-600">
                          {b.rawMethod.finalScore.toFixed(2)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {bandResults.length === 0 && (
                  <tr>
                    <td
                      colSpan={
                        7 +
                        (audition?.isPenaltyEnabled ? 1 : 0) +
                        (showComparison ? 3 : 0)
                      }
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
      ) : activeTab === 'voters' ? (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                対象者計:{' '}
                <strong className="text-zinc-800">
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

            <div className="flex items-center gap-4 flex-wrap">
              <ToggleSwitch
                checked={onlyUnsubmitted}
                onChange={setOnlyUnsubmitted}
                size="sm"
                label="未提出者のみ表示"
              />

              <button
                type="button"
                disabled={unsubmittedVoters.length === 0}
                onClick={() => void handleCopyUnsubmittedList()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>未提出者リストをコピー</span>
              </button>
            </div>
          </div>

          <div className="bg-zinc-50 border border-zinc-300 rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-zinc-100 border-b border-zinc-300 font-bold text-zinc-700">
                    <th className="px-4 py-3">ステータス</th>
                    <th className="px-4 py-3">氏名</th>
                    <th className="px-4 py-3">回生</th>
                    <th className="px-4 py-3">参加権限</th>
                    <th className="px-4 py-3 text-right">入力進捗・自バンド除外</th>
                    <th className="px-4 py-3">提出日時</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVoters.map((v) => (
                    <tr key={v.id} className="hover:bg-zinc-100">
                      <td className="px-4 py-3">
                        {v.isSubmitted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-emerald-50 text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            提出済
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-rose-50 text-rose-800">
                            <Clock className="h-3.5 w-3.5" />
                            未提出
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-zinc-800">{v.name}</div>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{v.grade}回生</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-sm text-xs font-semibold ${v.permissionType === 'SCORE_AND_COMMENT'
                            ? 'bg-slate-100 text-slate-700'
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
                          <span className="text-[11px] text-zinc-400">
                            {' '}
                            (自{v.ownBandCount})
                          </span>
                        )}
                        <div className="text-[11px] font-sans mt-0.5">
                          全体講評:{' '}
                          <span
                            className={
                              v.generalFeedback?.trim()
                                ? 'text-emerald-700 font-semibold'
                                : 'text-zinc-400'
                            }
                          >
                            {v.generalFeedback?.trim() ? '入力済' : '未入力'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {v.submittedAt
                          ? new Date(v.submittedAt).toLocaleString('ja-JP')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                  {filteredVoters.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
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
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-sm">
              <span>
                全体講評入力済:{' '}
                <strong className="text-zinc-800">
                  {enteredFeedbackCount} / {generalFeedbacks.length}名
                </strong>
              </span>
            </div>

            <ToggleSwitch
              checked={showEmptyFeedbacks}
              onChange={setShowEmptyFeedbacks}
              size="sm"
              label="未入力者も表示"
            />
          </div>

          <div className="space-y-2.5">
            {filteredGeneralFeedbacks.map((g) => (
              <div
                key={g.userId}
                className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-zinc-800">
                      {g.userName}
                    </span>
                    {g.enrollmentYear !== undefined && (
                      <span className="text-xs text-zinc-500">
                        {calculateGrade(g.enrollmentYear)}回生
                      </span>
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
                    {g.isSubmitted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-50 text-emerald-800">
                        <CheckCircle2 className="h-3 w-3" />
                        提出済
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-rose-50 text-rose-800">
                        <Clock className="h-3 w-3" />
                        未提出
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-400">
                    {g.submittedAt
                      ? new Date(g.submittedAt).toLocaleString('ja-JP')
                      : '-'}
                  </span>
                </div>
                <p className="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">
                  {g.generalFeedback.trim() || '（未入力）'}
                </p>
              </div>
            ))}
            {filteredGeneralFeedbacks.length === 0 && (
              <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center text-sm text-zinc-500">
                入力済みの全体講評はまだありません
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2ファイル Excel / CSV エクスポートパネル */}
      {audition && (
        <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-zinc-800 flex items-center gap-1.5">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Excel / CSV データエクスポート
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* ファイル1 */}
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
                  href={`/api/admin/auditions/${audition.id}/export?target=summary_and_raw&format=xlsx`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  .xlsx
                </a>
                <a
                  href={`/api/admin/auditions/${audition.id}/export?target=summary_and_raw&format=csv`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border border-zinc-300 text-xs font-semibold transition"
                >
                  .csv
                </a>
              </div>
            </div>

            {/* ファイル2 */}
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
                  href={`/api/admin/auditions/${audition.id}/export?target=band_comments&format=xlsx`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  .xlsx
                </a>
                <a
                  href={`/api/admin/auditions/${audition.id}/export?target=band_comments&format=csv`}
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

