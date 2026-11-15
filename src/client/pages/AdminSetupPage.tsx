import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FilePlus2,
  Play,
  Upload,
  UserCheck,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { AdminAuditionHeader } from '../components/AdminAuditionHeader.tsx';
import type {
  AdminVoterMonitorDto,
  AuditionDto,
  SelectableUserDto,
} from '../types.ts';
import type { AuditionStatus, PermissionType } from '../../shared/schema/index.ts';

interface AdminSetupPageProps {
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  onAuditionsChanged: () => Promise<void>;
}

const SAMPLE_BANDS_CSV = `1,Opening Session,六甲 健太 / 三宮 翔
2,Harbor Blues,灘 花子`;

export function AdminSetupPage({
  auditions,
  selectedAuditionId,
  onSelectAudition,
  onAuditionsChanged,
}: AdminSetupPageProps) {
  // 新規オーディション作成フォーム
  const [newTitle, setNewTitle] = useState('');
  const [newEventDate, setNewEventDate] = useState('2026-12-25');
  const [newDeadline, setNewDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  // バンド一括登録
  const [bandsCsv, setBandsCsv] = useState('');
  const [replaceBands, setReplaceBands] = useState(false);
  const [bandUploadResult, setBandUploadResult] = useState<{
    insertedCount: number;
    warnings: string[];
  } | null>(null);

  // 参加者権限一括設定
  const [allUsers, setAllUsers] = useState<SelectableUserDto[]>([]);
  const [currentVoters, setCurrentVoters] = useState<AdminVoterMonitorDto[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [performerFilter, setPerformerFilter] = useState<
    'ALL' | 'PERFORMERS_ONLY' | 'NON_PERFORMERS_ONLY'
  >('ALL');
  const [bulkPermType, setBulkPermType] =
    useState<PermissionType>('SCORE_AND_COMMENT');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedAudition = auditions.find((a) => a.id === selectedAuditionId);

  const loadContext = async () => {
    const usersRes = await apiJson<{ users: SelectableUserDto[] }>(
      '/api/admin/users',
    );
    setAllUsers(usersRes.users);
    if (selectedAuditionId) {
      const votersRes = await apiJson<{ voters: AdminVoterMonitorDto[] }>(
        `/api/admin/auditions/${selectedAuditionId}/voters`,
      );
      setCurrentVoters(votersRes.voters);
    }
  };

  useEffect(() => {
    void loadContext();
  }, [selectedAuditionId]);

  const availableYears = useMemo(() => {
    const set = new Set(allUsers.map((u) => u.enrollmentYear));
    return Array.from(set).sort((a, b) => b - a);
  }, [allUsers]);

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage((prev) => (prev === msg ? null : prev)), 5000);
  };

  const handleCreateAudition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await apiJson<{ audition: AuditionDto }>('/api/admin/auditions', {
        method: 'POST',
        body: JSON.stringify({
          title: newTitle.trim(),
          eventDate: newEventDate,
          deadline: newDeadline || null,
        }),
      });
      setNewTitle('');
      await onAuditionsChanged();
      onSelectAudition(res.audition.id);
      showToast(`新規オーディション「${res.audition.title}」を DRAFT 状態で作成しました`);
    } finally {
      setCreating(false);
    }
  };

  const handleChangeStatus = async (status: AuditionStatus) => {
    if (!selectedAudition) return;
    if (
      status === 'ACTIVE' &&
      !window.confirm(
        `「${selectedAudition.title}」を ACTIVE（公開中）に切り替えますか？\n※現在 ACTIVE な他のオーディションは自動的に CLOSED に変更され、Wikiの一般編集がロックされます。`,
      )
    ) {
      return;
    }
    await apiJson(`/api/admin/auditions/${selectedAudition.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await onAuditionsChanged();
    showToast(`ステータスを ${status} に切り替えました`);
  };

  const handleBulkBands = async () => {
    if (!selectedAudition || !bandsCsv.trim()) return;
    const res = await apiJson<{ insertedCount: number; warnings: string[] }>(
      `/api/admin/auditions/${selectedAudition.id}/bands/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({ csvText: bandsCsv, replaceExisting: replaceBands }),
      },
    );
    setBandUploadResult(res);
    showToast(`${res.insertedCount}件のバンドを一括登録しました`);
  };

  const handleBulkVotersByCondition = async (action: 'ASSIGN' | 'REMOVE') => {
    if (!selectedAudition) return;
    const res = await apiJson<{ affectedCount: number }>(
      `/api/admin/auditions/${selectedAudition.id}/voters/bulk`,
      {
        method: 'POST',
        body: JSON.stringify({
          mode: 'BY_CONDITION',
          enrollmentYears: selectedYears.length > 0 ? selectedYears : undefined,
          performerFilter,
          permissionType: bulkPermType,
          action,
        }),
      },
    );
    await loadContext();
    showToast(
      action === 'ASSIGN'
        ? `${res.affectedCount}名に参加権限（${bulkPermType}）を一括付与しました`
        : `${res.affectedCount}名の参加権限を一括解除しました`,
    );
  };

  const handleSingleVoterAssign = async (
    userId: string,
    permissionType: PermissionType | 'REMOVE',
  ) => {
    if (!selectedAudition) return;
    await apiJson(`/api/admin/auditions/${selectedAudition.id}/voters/bulk`, {
      method: 'POST',
      body: JSON.stringify({
        mode: 'BY_IDS',
        userIds: [userId],
        permissionType: permissionType === 'REMOVE' ? undefined : permissionType,
        action: permissionType === 'REMOVE' ? 'REMOVE' : 'ASSIGN',
      }),
    });
    await loadContext();
  };

  const voterMap = useMemo(
    () => new Map(currentVoters.map((v) => [v.userId, v])),
    [currentVoters],
  );

  return (
    <div className="space-y-6">
      <AdminAuditionHeader
        auditions={auditions}
        selectedAuditionId={selectedAuditionId}
        onSelectAudition={onSelectAudition}
      />

      {statusMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-sm px-4 py-3 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* 1. 新規オーディション作成 */}
      <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-4">
        <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
          <FilePlus2 className="h-5 w-5 text-slate-700" />
          新規オーディション開催回の作成（DRAFT）
        </h2>

        <form
          onSubmit={handleCreateAudition}
          className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div className="sm:col-span-2 space-y-1">
            <label className="block text-xs font-bold text-zinc-700">
              開催回名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例: 2027 春ライブオーディション"
              className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-zinc-700">
              開催日 <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
          >
            {creating ? '作成中...' : 'DRAFTで作成'}
          </button>
        </form>
      </section>

      {selectedAudition && (
        <>
          {/* 2. ステータス切替 */}
          <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-3">
            <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-600" />
              公開ステータス切替（対象: {selectedAudition.title}）
            </h2>
            <p className="text-xs text-zinc-500">
              DRAFT（準備中・Wiki一般編集可）→ ACTIVE（公開中・採点受付・Wiki自動ロック＆他ACTIVE自動CLOSED）→
              CLOSED（採点締切）
            </p>
            <div className="flex flex-wrap gap-2.5">
              {(['DRAFT', 'ACTIVE', 'CLOSED'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => handleChangeStatus(st)}
                  className={`px-4 py-2 rounded-sm text-sm font-bold border transition cursor-pointer ${
                    selectedAudition.status === st
                      ? 'bg-slate-700 text-white border-slate-900'
                      : 'bg-zinc-100 hover:bg-zinc-100 text-zinc-700 border-zinc-300'
                  }`}
                >
                  {st}
                  {st === 'DRAFT' && '（準備・Wiki受付）'}
                  {st === 'ACTIVE' && '（採点公開中）'}
                  {st === 'CLOSED' && '（終了・締切）'}
                </button>
              ))}
            </div>
          </section>

          {/* 3. バンド・出演順・メンバー CSV一括登録 */}
          <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
                <Upload className="h-5 w-5 text-slate-700" />
                参加バンド・出演順・メンバー 一括登録（CSV / TSV）
              </h2>
              <button
                type="button"
                onClick={() => setBandsCsv(SAMPLE_BANDS_CSV)}
                className="text-xs font-semibold text-slate-700 hover:underline cursor-pointer"
              >
                サンプル形式を挿入
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              書式: <code className="bg-zinc-100 px-1.5 py-0.5 rounded">出演順,バンド名,メンバー1 / メンバー2</code>（氏名またはメールアドレスで部員マスタと自動紐付け）
            </p>
            <textarea
              rows={5}
              value={bandsCsv}
              onChange={(e) => setBandsCsv(e.target.value)}
              placeholder={`1,The Rokko Distortion,六甲 健太 / 三宮 翔\n2,Portliner Echo,灘 花子`}
              className="w-full rounded-sm border border-zinc-300 px-3.5 py-2.5 text-sm font-mono"
            />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceBands}
                  onChange={(e) => setReplaceBands(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-rose-600"
                />
                既存のバンド一覧をすべて置き換える（チェックしない場合は追記）
              </label>

              <button
                type="button"
                onClick={handleBulkBands}
                className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold cursor-pointer"
              >
                バンド一括登録を実行
              </button>
            </div>

            {bandUploadResult && bandUploadResult.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-sm p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold">メンバー紐付けの警告:</p>
                <ul className="list-disc pl-5">
                  {bandUploadResult.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 4. 参加者権限一括設定 */}
          <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-4">
            <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-slate-700" />
              採点・コメント参加権限（AuditionVoters）一括設定
            </h2>

            <div className="bg-zinc-100 border border-zinc-300 rounded-sm p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-bold text-zinc-700 mb-1.5">
                    入部年度で絞り込み（未選択時は全年度）
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availableYears.map((yr) => {
                      const active = selectedYears.includes(yr);
                      return (
                        <button
                          key={yr}
                          type="button"
                          onClick={() =>
                            setSelectedYears((prev) =>
                              prev.includes(yr)
                                ? prev.filter((y) => y !== yr)
                                : [...prev, yr],
                            )
                          }
                          className={`px-2.5 py-1 rounded-sm text-xs font-semibold border cursor-pointer ${
                            active
                              ? 'bg-slate-700 text-white border-slate-700'
                              : 'bg-zinc-50 text-zinc-700 border-zinc-300'
                          }`}
                        >
                          {yr}年入部
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-zinc-700 mb-1.5">
                    出演有無フィルタ
                  </div>
                  <select
                    value={performerFilter}
                    onChange={(e) =>
                      setPerformerFilter(
                        e.target.value as
                          | 'ALL'
                          | 'PERFORMERS_ONLY'
                          | 'NON_PERFORMERS_ONLY',
                      )
                    }
                    className="w-full rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="ALL">全部員（出演・非出演すべて）</option>
                    <option value="PERFORMERS_ONLY">出演バンドメンバーのみ</option>
                    <option value="NON_PERFORMERS_ONLY">非出演者のみ</option>
                  </select>
                </div>

                <div>
                  <div className="text-xs font-bold text-zinc-700 mb-1.5">
                    付与する権限区分
                  </div>
                  <select
                    value={bulkPermType}
                    onChange={(e) =>
                      setBulkPermType(e.target.value as PermissionType)
                    }
                    className="w-full rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold"
                  >
                    <option value="SCORE_AND_COMMENT">
                      SCORE_AND_COMMENT（採点＋コメント）
                    </option>
                    <option value="COMMENT_ONLY">
                      COMMENT_ONLY（コメントのみ）
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleBulkVotersByCondition('REMOVE')}
                  className="px-3.5 py-2 rounded-sm border border-rose-300 text-rose-700 bg-zinc-50 hover:bg-rose-50 text-xs font-bold cursor-pointer"
                >
                  条件に合う部員の権限を解除
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkVotersByCondition('ASSIGN')}
                  className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
                >
                  条件に合う部員へ一括付与
                </button>
              </div>
            </div>

            {/* 個別確認・変更テーブル */}
            <div className="overflow-x-auto border border-zinc-300 rounded-sm">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="bg-zinc-100 border-b border-zinc-300 font-bold text-zinc-700">
                    <th className="px-3 py-2.5">氏名</th>
                    <th className="px-3 py-2.5">回生 (入部年度)</th>
                    <th className="px-3 py-2.5">現在の参加権限</th>
                    <th className="px-3 py-2.5 text-right">個別変更</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allUsers.map((u) => {
                    const entry = voterMap.get(u.id);
                    return (
                      <tr key={u.id}>
                        <td className="px-3 py-2.5 font-medium text-zinc-800">
                          {u.name}
                          <div className="text-[11px] text-zinc-400 font-mono">
                            {u.email}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-zinc-600">
                          {u.grade}回生 ({u.enrollmentYear})
                        </td>
                        <td className="px-3 py-2.5">
                          {entry ? (
                            <span
                              className={`px-2 py-0.5 rounded-sm text-xs font-semibold ${
                                entry.permissionType === 'SCORE_AND_COMMENT'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {entry.permissionType === 'SCORE_AND_COMMENT'
                                ? '採点＋コメント'
                                : 'コメントのみ'}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">未登録（対象外）</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleSingleVoterAssign(u.id, 'SCORE_AND_COMMENT')
                              }
                              className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-100 text-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              採点+コメ
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleSingleVoterAssign(u.id, 'COMMENT_ONLY')
                              }
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-50 text-amber-800 text-[11px] font-semibold cursor-pointer"
                            >
                              コメのみ
                            </button>
                            {entry && (
                              <button
                                type="button"
                                onClick={() => handleSingleVoterAssign(u.id, 'REMOVE')}
                                className="px-2 py-1 rounded bg-rose-50 hover:bg-rose-50 text-rose-700 text-[11px] font-semibold cursor-pointer"
                              >
                                解除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

