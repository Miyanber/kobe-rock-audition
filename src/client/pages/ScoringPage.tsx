import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CloudOff,
  Eye,
  Lock,
  Music,
  RefreshCw,
  Save,
  Send,
  Unlock,
  Wifi,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { ToastNotification } from '../components/ToastNotification.tsx';
import { useScoreDrafts } from '../hooks/useScoreDrafts.ts';
import type { AuthUserDto, CurrentAuditionPayload } from '../types.ts';
import type { AppRoute } from '../components/Layout.tsx';

interface ScoringPageProps {
  user: AuthUserDto;
  onNavigate: (route: AppRoute) => void;
}

export function ScoringPage({ user, onNavigate }: ScoringPageProps) {
  const [data, setData] = useState<CurrentAuditionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingBandId, setSavingBandId] = useState<string | null>(null);
  const [submittingAll, setSubmittingAll] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<CurrentAuditionPayload>('/api/auditions/current');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrent();
  }, [loadCurrent]);

  const activeAudition = data?.activeAudition ?? null;
  const voterEntry = data?.voterEntry ?? null;

  const {
    drafts,
    updateDraft,
    markSaved,
    syncPendingDrafts,
    isOnline,
    isSyncing,
    dirtyCount,
    syncMessage,
  } = useScoreDrafts(activeAudition?.id, user.id, data?.myScores ?? []);

  const ownBandSet = useMemo(
    () => new Set(data?.ownBandIds ?? []),
    [data?.ownBandIds],
  );

  const targetBands = useMemo(
    () => (data?.bands ?? []).filter((b) => !ownBandSet.has(b.id)),
    [data?.bands, ownBandSet],
  );

  const isCommentOnly = voterEntry?.permissionType === 'COMMENT_ONLY';

  const completionStatus = useMemo(() => {
    let completed = 0;
    for (const band of targetBands) {
      const d = drafts[band.id];
      if (!d) continue;
      const hasComment = d.comment.trim().length > 0;
      const hasScores = d.techScore !== null && d.charmScore !== null;
      if (isCommentOnly ? hasComment : hasComment && hasScores) {
        completed++;
      }
    }
    return {
      completed,
      total: targetBands.length,
      allDone: targetBands.length > 0 && completed === targetBands.length,
    };
  }, [targetBands, drafts, isCommentOnly]);

  const showToast = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => {
      setFeedback((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleSaveSingleBand = async (bandId: string, bandName: string) => {
    if (!activeAudition) return;
    const d = drafts[bandId];
    const comment = (d?.comment ?? '').trim();
    const techScore = isCommentOnly ? null : (d?.techScore ?? null);
    const charmScore = isCommentOnly ? null : (d?.charmScore ?? null);

    if (!comment) {
      showToast('error', `「${bandName}」のコメントを入力してください`);
      return;
    }
    if (!isCommentOnly && (techScore === null || charmScore === null)) {
      showToast('error', `「${bandName}」の魅力点・技術点を両方入力してください`);
      return;
    }

    if (!navigator.onLine) {
      showToast(
        'error',
        '現在オフラインのため端末内に下書き保存しました。通信復旧後に自動送信されます。',
      );
      return;
    }

    setSavingBandId(bandId);
    try {
      await apiJson(`/api/auditions/${activeAudition.id}/scores/${bandId}`, {
        method: 'PUT',
        body: JSON.stringify({ techScore, charmScore, comment }),
      });
      markSaved([bandId]);
      showToast('success', `「${bandName}」の採点を保存しました`);
    } catch (err) {
      showToast(
        'error',
        err instanceof Error ? err.message : '保存に失敗しました（下書きは保持されています）',
      );
    } finally {
      setSavingBandId(null);
    }
  };

  const handleFinalSubmit = async () => {
    if (!activeAudition) return;
    if (!navigator.onLine) {
      showToast('error', 'オフラインのため送信できません。通信復旧後に再度お試しください。');
      return;
    }

    setSubmittingAll(true);
    try {
      const payload = {
        scores: targetBands.map((b) => {
          const d = drafts[b.id];
          return {
            bandId: b.id,
            techScore: isCommentOnly ? null : (d?.techScore ?? null),
            charmScore: isCommentOnly ? null : (d?.charmScore ?? null),
            comment: d?.comment ?? '',
          };
        }),
        markSubmitted: true,
      };
      await apiJson(`/api/auditions/${activeAudition.id}/scores/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      markSaved(targetBands.map((b) => b.id));
      await loadCurrent();
      setShowPreviewModal(false);
      showToast('success', '全対象バンドの採点・コメントを提出完了しました！');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : '最終提出に失敗しました');
    } finally {
      setSubmittingAll(false);
    }
  };

  const myPreviewList = useMemo(() => {
    return targetBands
      .map((b) => {
        const d = drafts[b.id];
        const tech = isCommentOnly ? null : (d?.techScore ?? null);
        const charm = isCommentOnly ? null : (d?.charmScore ?? null);
        const total = tech !== null && charm !== null ? tech + charm : null;
        return {
          band: b,
          tech,
          charm,
          total,
          comment: d?.comment ?? '',
        };
      })
      .sort((a, b) => {
        if (a.total === null && b.total === null) {
          return a.band.performanceOrder - b.band.performanceOrder;
        }
        if (a.total === null) return 1;
        if (b.total === null) return -1;
        if (b.total !== a.total) return b.total - a.total;
        return a.band.performanceOrder - b.band.performanceOrder;
      });
  }, [targetBands, drafts, isCommentOnly]);

  if (loading) {
    return (
      <div className="py-16 text-center text-zinc-500 text-sm">
        採点データを読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-sm p-6 text-center space-y-3">
        <p className="text-rose-800 font-medium">{error}</p>
        <button
          type="button"
          onClick={loadCurrent}
          className="px-4 py-2 rounded-sm bg-rose-700 text-white text-sm font-medium cursor-pointer"
        >
          再読み込み
        </button>
      </div>
    );
  }

  // 1. ACTIVEなオーディションが存在しない場合
  if (!activeAudition) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-sm bg-zinc-100 flex items-center justify-center">
          <Music className="h-6 w-6 text-zinc-500" />
        </div>
        <h2 className="text-lg font-bold text-zinc-800">
          現在公開中（ACTIVE）のオーディションはありません
        </h2>
        <p className="text-sm text-zinc-600">
          採点受付が開始されるまでお待ちください。
          {data?.draftAudition &&
            `現在「${data.draftAudition.title}」の出演バンドエントリー（Wiki）を受付中です。`}
        </p>
        {data?.draftAudition && (
          <button
            type="button"
            onClick={() => onNavigate('wiki')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-700 text-white font-semibold text-sm transition cursor-pointer"
          >
            <Music className="h-4 w-4" />
            出演バンドWiki登録・編集へ進む
          </button>
        )}
      </div>
    );
  }

  // 2. AuditionVoters に未登録のユーザーには専用案内画面を表示
  if (!voterEntry) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-amber-200 rounded-sm p-8 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-sm bg-amber-50 flex items-center justify-center">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-zinc-800">
          採点・コメント対象者に登録されていません
        </h2>
        <p className="text-sm text-zinc-600 leading-relaxed">
          現在開催中の「<span className="font-semibold">{activeAudition.title}</span>
          」について、あなたのアカウント（<span className="font-mono">{user.email}</span>
          ）には採点・コメント権限が割り当てられていません。
          <br />
          採点参加が必要な場合は、渉外・運営委員（ADMIN）へ参加権限の付与をご依頼ください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* 開催回情報 & 提出ステータスヘッダー */}
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                採点受付中
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                {isCommentOnly ? '権限: コメント入力のみ' : '権限: 採点＋コメント'}
              </span>
              {voterEntry.isSubmitted ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  提出済（再編集可）
                </span>
              ) : (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  未提出
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-zinc-800 mt-1.5">
              {activeAudition.title}
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              開催日: {activeAudition.eventDate}
              {activeAudition.deadline && ` / 締切: ${activeAudition.deadline.replace('T', ' ')}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium border ${
                isOnline
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" />
                  オンライン（自動下書き保存中）
                </>
              ) : (
                <>
                  <CloudOff className="h-3.5 w-3.5" />
                  オフライン（端末に下書き保存中）
                </>
              )}
            </span>

            {dirtyCount > 0 && isOnline && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={syncPendingDrafts}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-semibold bg-slate-700 hover:bg-slate-700 text-white transition cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                未同期 ({dirtyCount}件) を同期
              </button>
            )}
          </div>
        </div>

        {/* 進捗バー */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
            <span>
              対象バンド入力進捗（自バンド {ownBandSet.size} 組除外済み）
            </span>
            <span className="font-bold text-zinc-800">
              {completionStatus.completed} / {completionStatus.total} バンド完了
            </span>
          </div>
          <div className="w-full h-2.5 bg-zinc-100 rounded-sm overflow-hidden">
            <div
              className="h-full bg-slate-700 transition-all duration-300"
              style={{
                width: `${
                  completionStatus.total > 0
                    ? Math.round((completionStatus.completed / completionStatus.total) * 100)
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* 通知トースト */}
      <ToastNotification
        message={
          feedback || syncMessage
            ? {
                text: feedback?.text ?? syncMessage ?? '',
                type: feedback?.type === 'error' ? 'error' : 'success',
              }
            : null
        }
        onClose={feedback ? () => setFeedback(null) : undefined}
      />

      {/* タイムテーブル & 採点カード一覧 */}
      <div className="space-y-4">
        {data?.bands.map((band) => {
          const isOwn = ownBandSet.has(band.id);

          if (isOwn) {
            return (
              <div
                key={band.id}
                className="bg-zinc-200/60 border border-zinc-300 text-zinc-600 rounded-sm p-4 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center justify-center h-7 w-7 rounded-sm bg-zinc-200 text-zinc-700 font-bold text-xs">
                      #{band.performanceOrder}
                    </span>
                    <div>
                      <h3 className="font-bold text-zinc-700 text-base">
                        {band.name}
                      </h3>
                      <p className="text-xs text-zinc-500">
                        メンバー: {band.members.map((m) => m.name).join(' / ') || '未設定'}
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs bg-zinc-200 text-zinc-600">
                    <Ban className="h-3.5 w-3.5" />
                    自バンドのため採点対象外（自動除外）
                  </span>
                </div>
              </div>
            );
          }

          const draft = drafts[band.id] ?? {
            bandId: band.id,
            techScore: null,
            charmScore: null,
            comment: '',
            locked: false,
            dirty: false,
            localUpdatedAt: 0,
          };

          const tech = draft.techScore;
          const charm = draft.charmScore;
          const total =
            tech !== null && charm !== null ? tech + charm : null;
          const hasComment = draft.comment.trim().length > 0;
          const isCompleted = isCommentOnly
            ? hasComment
            : hasComment && tech !== null && charm !== null;

          return (
            <div
              key={band.id}
              className={`bg-zinc-50 border rounded-sm p-4 sm:p-5 transition ${
                draft.locked
                  ? 'border-slate-300 bg-slate-100'
                  : isCompleted
                    ? 'border-emerald-300'
                    : 'border-zinc-300'
              }`}
            >
              {/* カードヘッダー */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3.5 border-b border-zinc-300">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-sm bg-slate-700 text-white font-bold text-sm shrink-0">
                    {band.performanceOrder}
                  </span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-zinc-800 text-base sm:text-lg">
                        {band.name}
                      </h3>
                      {draft.dirty ? (
                        <span className="px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-amber-50 text-amber-800">
                          未保存の下書き
                        </span>
                      ) : isCompleted ? (
                        <span className="px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-50 text-emerald-800">
                          保存済
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-zinc-100 text-zinc-600">
                          未入力
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      出演メンバー:{' '}
                      {band.members.map((m) => `${m.name}(${m.grade}回)`).join(', ') ||
                        '未登録'}
                    </p>
                  </div>
                </div>

                {/* 誤操作防止ロックトグル & 合計点表示 */}
                <div className="flex items-center gap-2.5 self-end sm:self-auto">
                  {!isCommentOnly && (
                    <div className="px-3.5 py-1.5 rounded-sm bg-slate-700 text-white text-center min-w-[92px]">
                      <div className="text-[10px] text-zinc-300 leading-none">
                        合計点
                      </div>
                      <div className="text-lg font-extrabold leading-tight tabular-nums">
                        {total !== null ? total : '--'}
                        <span className="text-xs font-normal text-zinc-400">
                          /100
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      updateDraft(band.id, { locked: !draft.locked }, false)
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border transition cursor-pointer ${
                      draft.locked
                        ? 'bg-slate-700 text-white border-slate-700'
                        : 'bg-zinc-100 hover:bg-zinc-100 text-zinc-700 border-zinc-300'
                    }`}
                    title="スマホスクロール時の誤操作防止ロック"
                  >
                    {draft.locked ? (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        ロック中
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        編集可
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 点数入力欄 (SCORE_AND_COMMENT のみ表示) */}
              {!isCommentOnly && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  {/* 魅力点 (0-50) */}
                  <div className="bg-zinc-100 rounded-sm p-3.5 border border-zinc-300 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`charm-${band.id}`}
                        className="text-sm font-bold text-zinc-800"
                      >
                        魅力点（0〜50）
                      </label>
                      <input
                        id={`charm-${band.id}`}
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        disabled={draft.locked}
                        value={charm ?? ''}
                        placeholder="0-50"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            updateDraft(band.id, { charmScore: null });
                          } else {
                            const num = Math.max(0, Math.min(50, Number(val)));
                            updateDraft(band.id, { charmScore: num });
                          }
                        }}
                        className="w-20 text-right font-bold text-base rounded-sm border border-zinc-300 bg-zinc-50 px-2.5 py-1 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      disabled={draft.locked}
                      value={charm ?? 25}
                      onChange={(e) =>
                        updateDraft(band.id, { charmScore: Number(e.target.value) })
                      }
                      className="w-full h-2.5 cursor-pointer disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>0</span>
                      <span>25</span>
                      <span>50</span>
                    </div>
                  </div>

                  {/* 技術点 (0-50) */}
                  <div className="bg-zinc-100 rounded-sm p-3.5 border border-zinc-300 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor={`tech-${band.id}`}
                        className="text-sm font-bold text-zinc-800"
                      >
                        技術点（0〜50）
                      </label>
                      <input
                        id={`tech-${band.id}`}
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        disabled={draft.locked}
                        value={tech ?? ''}
                        placeholder="0-50"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            updateDraft(band.id, { techScore: null });
                          } else {
                            const num = Math.max(0, Math.min(50, Number(val)));
                            updateDraft(band.id, { techScore: num });
                          }
                        }}
                        className="w-20 text-right font-bold text-base rounded-sm border border-zinc-300 bg-zinc-50 px-2.5 py-1 disabled:bg-zinc-100 disabled:text-zinc-500"
                      />
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={1}
                      disabled={draft.locked}
                      value={tech ?? 25}
                      onChange={(e) =>
                        updateDraft(band.id, { techScore: Number(e.target.value) })
                      }
                      className="w-full h-2.5 cursor-pointer disabled:opacity-50"
                    />
                    <div className="flex justify-between text-[11px] text-zinc-400">
                      <span>0</span>
                      <span>25</span>
                      <span>50</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 定性コメント */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor={`comment-${band.id}`}
                    className="text-sm font-bold text-zinc-800"
                  >
                    講評コメント <span className="text-rose-500">*必須</span>
                  </label>
                  <span className="text-xs text-zinc-400">
                    {draft.comment.length} 文字
                  </span>
                </div>
                <textarea
                  id={`comment-${band.id}`}
                  rows={3}
                  disabled={draft.locked}
                  value={draft.comment}
                  onChange={(e) =>
                    updateDraft(band.id, { comment: e.target.value })
                  }
                  placeholder="演奏・表現・アレンジなどについてのコメントを入力してください..."
                  className="w-full rounded-sm border border-zinc-300 px-3.5 py-2.5 text-sm focus:border-slate-700 focus:outline-none focus:ring-0 disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </div>

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={savingBandId === band.id}
                  onClick={() => handleSaveSingleBand(band.id, band.name)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-xs sm:text-sm font-semibold transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {savingBandId === band.id ? '保存中...' : 'このバンドを保存'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 下部固定アクションバー */}
      <div className="fixed bottom-0 inset-x-0 z-20 bg-zinc-50 border-t border-zinc-300 px-3 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          <div className="text-xs sm:text-sm text-zinc-700 font-medium">
            完了:{' '}
            <span className="font-bold text-slate-700">
              {completionStatus.completed}/{completionStatus.total}
            </span>
            {dirtyCount > 0 && (
              <span className="ml-2 text-amber-600 font-semibold">
                (未送信 {dirtyCount})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-sm bg-zinc-100 hover:bg-zinc-100 text-zinc-800 text-xs sm:text-sm font-semibold transition cursor-pointer"
            >
              <Eye className="h-4 w-4" />
              <span>マイ順位確認</span>
            </button>

            <button
              type="button"
              disabled={submittingAll}
              onClick={handleFinalSubmit}
              className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold transition disabled:opacity-50 cursor-pointer"
            >
              <Send className="h-4 w-4" />
              <span>
                {submittingAll
                  ? '提出処理中...'
                  : voterEntry.isSubmitted
                    ? '内容を更新提出する'
                    : '最終提出する'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* マイ採点・順位確認モーダル */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-700/60 flex items-center justify-center p-4">
          <div className="bg-zinc-50 rounded-sm max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-300 flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-zinc-800">
                  自分が付けた点数・順位プレビュー
                </h2>
                <p className="text-xs text-zinc-500">
                  提出前のバランス確認にご利用ください（自バンドは自動除外済み）
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 rounded-sm hover:bg-zinc-100 text-zinc-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-2.5">
              {myPreviewList.map((item, idx) => (
                <div
                  key={item.band.id}
                  className="border border-zinc-300 rounded-sm p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-sm bg-slate-100 text-slate-800 font-bold text-xs shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-sm text-zinc-800 truncate">
                        #{item.band.performanceOrder} {item.band.name}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                      {item.comment || '（コメント未入力）'}
                    </p>
                  </div>

                  {!isCommentOnly && (
                    <div className="text-right shrink-0">
                      <div className="text-base font-extrabold text-zinc-800 tabular-nums">
                        {item.total !== null ? `${item.total}点` : '未入力'}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        魅力:{item.charm ?? '-'} / 技術:{item.tech ?? '-'}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-zinc-300 bg-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-sm border border-zinc-300 bg-zinc-50 text-sm font-medium text-zinc-700 cursor-pointer"
              >
                戻る
              </button>
              <button
                type="button"
                disabled={submittingAll}
                onClick={handleFinalSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                このまま最終提出する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

