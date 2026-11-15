import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Lock,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import type {
  AuditionDto,
  AuthUserDto,
  BandWithMembersDto,
  CurrentAuditionPayload,
  SelectableUserDto,
} from '../types.ts';
import { StatusBadge } from '../components/AdminAuditionHeader.tsx';

interface WikiBandsPageProps {
  user: AuthUserDto;
}

export function WikiBandsPage({ user }: WikiBandsPageProps) {
  const [auditionOptions, setAuditionOptions] = useState<AuditionDto[]>([]);
  const [selectedAuditionId, setSelectedAuditionId] = useState<string>('');
  const [audition, setAudition] = useState<AuditionDto | null>(null);
  const [bands, setBands] = useState<BandWithMembersDto[]>([]);
  const [ownBandIds, setOwnBandIds] = useState<string[]>([]);
  const [canEditWiki, setCanEditWiki] = useState(false);
  const [allUsers, setAllUsers] = useState<SelectableUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  // モーダルフォーム用ステート
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBandId, setEditingBandId] = useState<string | null>(null);
  const [bandName, setBandName] = useState('');
  const [performanceOrder, setPerformanceOrder] = useState(1);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAuditionChoices = useCallback(async () => {
    setLoading(true);
    try {
      const [currentRes, draftsRes, usersRes] = await Promise.all([
        apiJson<CurrentAuditionPayload>('/api/auditions/current'),
        apiJson<{ auditions: AuditionDto[] }>('/api/auditions/drafts'),
        apiJson<{ users: SelectableUserDto[] }>('/api/auditions/users/selectable'),
      ]);

      setAllUsers(usersRes.users);

      const map = new Map<string, AuditionDto>();
      for (const d of draftsRes.auditions) map.set(d.id, d);
      if (currentRes.activeAudition) {
        map.set(currentRes.activeAudition.id, currentRes.activeAudition);
      }

      const list = Array.from(map.values()).sort((a, b) =>
        b.eventDate.localeCompare(a.eventDate),
      );
      setAuditionOptions(list);

      // DRAFT があればそれを優先選択
      const defaultTarget = draftsRes.auditions[0] ?? currentRes.activeAudition ?? list[0];
      if (defaultTarget) {
        setSelectedAuditionId((prev) => (prev && map.has(prev) ? prev : defaultTarget.id));
      }
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'データ取得に失敗しました',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBandsForAudition = useCallback(async (audId: string) => {
    if (!audId) return;
    try {
      const res = await apiJson<{
        audition: AuditionDto;
        bands: BandWithMembersDto[];
        ownBandIds: string[];
        canEditWiki: boolean;
      }>(`/api/auditions/${audId}/bands`);
      setAudition(res.audition);
      setBands(res.bands);
      setOwnBandIds(res.ownBandIds);
      setCanEditWiki(res.canEditWiki);
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'バンド情報の取得に失敗しました',
      });
    }
  }, []);

  useEffect(() => {
    void loadAuditionChoices();
  }, [loadAuditionChoices]);

  useEffect(() => {
    if (selectedAuditionId) {
      void loadBandsForAudition(selectedAuditionId);
    }
  }, [selectedAuditionId, loadBandsForAudition]);

  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        `${u.grade}回生`.includes(q),
    );
  }, [allUsers, memberSearch]);

  const openCreateModal = () => {
    const nextOrder =
      bands.length > 0
        ? Math.max(...bands.map((b) => b.performanceOrder)) + 1
        : 1;
    setEditingBandId(null);
    setBandName('');
    setPerformanceOrder(nextOrder);
    setSelectedMemberIds([user.id]);
    setMemberSearch('');
    setModalOpen(true);
  };

  const openEditModal = (band: BandWithMembersDto) => {
    setEditingBandId(band.id);
    setBandName(band.name);
    setPerformanceOrder(band.performanceOrder);
    setSelectedMemberIds(band.members.map((m) => m.userId));
    setMemberSearch('');
    setModalOpen(true);
  };

  const toggleMember = (uid: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const handleSubmitBand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!audition || !bandName.trim()) return;

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: bandName.trim(),
        performanceOrder: Number(performanceOrder),
        memberUserIds: selectedMemberIds,
      };
      if (editingBandId) {
        await apiJson(`/api/auditions/${audition.id}/bands/${editingBandId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMessage({ type: 'ok', text: `「${payload.name}」を更新しました` });
      } else {
        await apiJson(`/api/auditions/${audition.id}/bands`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMessage({ type: 'ok', text: `「${payload.name}」を新規登録しました` });
      }
      setModalOpen(false);
      await loadBandsForAudition(audition.id);
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : '保存に失敗しました',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBand = async (band: BandWithMembersDto) => {
    if (!audition) return;
    if (!window.confirm(`バンド「${band.name}」を削除しますか？`)) return;

    try {
      await apiJson(`/api/auditions/${audition.id}/bands/${band.id}`, {
        method: 'DELETE',
      });
      setMessage({ type: 'ok', text: `「${band.name}」を削除しました` });
      await loadBandsForAudition(audition.id);
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : '削除に失敗しました',
      });
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-zinc-500">読み込み中...</div>;
  }

  if (auditionOptions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center">
        <p className="font-bold text-zinc-800">
          表示可能なオーディション（DRAFT / ACTIVE）がまだありません
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          運営委員が新しいオーディションを作成すると、ここにバンドエントリーWikiが表示されます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ヘッダー */}
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-zinc-800">
              出演バンド エントリー・共同編集（Wiki）
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              準備期間（DRAFT）中は全部員でバンド登録・メンバー選択が可能です。採点開始（ACTIVE）と同時に一般編集は自動ロックされます。
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedAuditionId}
              onChange={(e) => setSelectedAuditionId(e.target.value)}
              className="rounded-sm border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-800"
            >
              {auditionOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  [{opt.eventDate}] {opt.title} ({opt.status})
                </option>
              ))}
            </select>

            {canEditWiki && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                バンドを登録
              </button>
            )}
          </div>
        </div>

        {audition && (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-300 flex-wrap">
            <div className="flex items-center gap-2">
              <StatusBadge status={audition.status} />
              <span className="text-xs text-zinc-500">
                登録バンド数: <strong className="text-zinc-800">{bands.length}</strong> 組
              </span>
            </div>

            {audition.status !== 'DRAFT' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-sm">
                <Lock className="h-3.5 w-3.5" />
                {user.role === 'ADMIN'
                  ? '採点公開中（一般部員ロック中・ADMIN権限で編集可）'
                  : '採点公開中のため閲覧専用です（編集ロック）'}
              </div>
            )}
          </div>
        )}
      </div>

      {message && (
        <div
          className={`rounded-sm px-4 py-3 text-sm font-medium border ${
            message.type === 'err'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* バンド一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bands.map((band) => {
          const isOwn = ownBandIds.includes(band.id);
          return (
            <div
              key={band.id}
              className={`bg-zinc-50 border rounded-sm p-4 sm:p-5 flex flex-col justify-between gap-4 ${
                isOwn ? 'border-slate-300 ring-1' : 'border-zinc-300'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="inline-flex items-center justify-center h-8 w-8 rounded-sm bg-slate-700 text-white font-bold text-sm shrink-0">
                      {band.performanceOrder}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-zinc-800 text-base truncate">
                        {band.name}
                      </h3>
                      {isOwn && (
                        <span className="inline-block text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-sm mt-0.5">
                          あなたが所属
                        </span>
                      )}
                    </div>
                  </div>

                  {canEditWiki && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(band)}
                        className="p-2 rounded-sm text-zinc-600 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        title="編集"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBand(band)}
                        className="p-2 rounded-sm text-zinc-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 mb-1.5">
                    <Users className="h-3.5 w-3.5" />
                    メンバー ({band.members.length}名)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {band.members.length === 0 ? (
                      <span className="text-xs text-zinc-400">未設定</span>
                    ) : (
                      band.members.map((m) => (
                        <span
                          key={m.userId}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-medium border ${
                            m.userId === user.id
                              ? 'bg-slate-100 border-slate-300 text-slate-800 font-semibold'
                              : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                          }`}
                        >
                          {m.name}
                          <span className="text-[10px] text-zinc-500">
                            ({m.grade}回)
                          </span>
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2.5 border-t border-zinc-300 flex items-center justify-between text-[11px] text-zinc-400">
                <span>最終更新者: {band.updatedByName ?? 'システム'}</span>
                <span>{new Date(band.updatedAt).toLocaleString('ja-JP')}</span>
              </div>
            </div>
          );
        })}

        {bands.length === 0 && (
          <div className="col-span-full bg-zinc-50 border border-dashed border-zinc-300 rounded-sm p-10 text-center text-sm text-zinc-500">
            まだバンドが登録されていません。「バンドを登録」ボタンから追加してください。
          </div>
        )}
      </div>

      {/* バンド登録・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-700/60 flex items-center justify-center p-4">
          <div className="bg-zinc-50 rounded-sm max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-300 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-zinc-800">
                {editingBandId ? 'バンド情報の編集' : '新規バンド登録（Wiki）'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-sm hover:bg-zinc-100 text-zinc-500 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBand} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="sm:col-span-3 space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    バンド名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={bandName}
                    onChange={(e) => setBandName(e.target.value)}
                    placeholder="例: The Rokko Distortion"
                    className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none focus:ring-0"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    出演順 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    required
                    value={performanceOrder}
                    onChange={(e) => setPerformanceOrder(Number(e.target.value))}
                    className="w-full rounded-sm border border-zinc-300 px-3 py-2 text-sm focus:border-slate-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* メンバー選択（部員マスタ検索） */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    所属メンバー選択（部員マスタから選択・表記揺れ防止）
                  </label>
                  <span className="text-xs font-semibold text-slate-700">
                    {selectedMemberIds.length}名選択中
                  </span>
                </div>

                {/* 選択中チップ */}
                {selectedMemberIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-100 rounded-sm border border-slate-300">
                    {selectedMemberIds.map((uid) => {
                      const u = allUsers.find((item) => item.id === uid);
                      if (!u) return null;
                      return (
                        <button
                          key={uid}
                          type="button"
                          onClick={() => toggleMember(uid)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm bg-zinc-50 border border-slate-300 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition cursor-pointer"
                        >
                          <span>
                            {u.name} ({u.grade}回)
                          </span>
                          <X className="h-3 w-3" />
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <Search className="h-4 w-4 text-zinc-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="氏名・メールアドレス・回生で検索..."
                    className="w-full rounded-sm border border-zinc-300 pl-9 pr-3 py-2 text-sm focus:border-slate-700 focus:outline-none"
                  />
                </div>

                <div className="border border-zinc-300 rounded-sm max-h-52 overflow-y-auto divide-y divide-slate-100">
                  {filteredUsers.map((u) => {
                    const checked = selectedMemberIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleMember(u.id)}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 hover:bg-zinc-100 transition cursor-pointer ${
                          checked ? 'bg-slate-100' : ''
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-800 truncate">
                            {u.name}{' '}
                            <span className="text-xs text-zinc-500">
                              ({u.grade}回生)
                            </span>
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono truncate">
                            {u.email}
                          </div>
                        </div>
                        <span
                          className={`h-5 w-5 rounded-sm border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-slate-700 border-slate-700 text-white'
                              : 'border-zinc-300 bg-zinc-50'
                          }`}
                        >
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <div className="p-4 text-center text-xs text-zinc-400">
                      一致する部員が見つかりません
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-300 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-sm border border-zinc-300 text-sm font-medium text-zinc-700 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold disabled:opacity-50 cursor-pointer"
                >
                  {saving ? '保存中...' : '保存する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

