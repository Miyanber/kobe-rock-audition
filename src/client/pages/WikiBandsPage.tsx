import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit3,
  Lock,
  Plus,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { ToastNotification } from '../components/ToastNotification.tsx';
import type {
  AuditionDto,
  AuthUserDto,
  BandWithMembersDto,
  SelectableUserDto,
} from '../types.ts';
import { StatusBadge } from '../components/AdminAuditionHeader.tsx';

interface WikiBandsPageProps {
  user: AuthUserDto;
  auditionId: string;
}

export function WikiBandsPage({ user, auditionId }: WikiBandsPageProps) {
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
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSelectableUsers = useCallback(async () => {
    try {
      const usersRes = await apiJson<{ users: SelectableUserDto[] }>(
        '/api/auditions/users/selectable',
      );
      setAllUsers(usersRes.users);
    } catch {
      // ignore
    }
  }, []);

  const loadBandsForAudition = useCallback(async (audId: string) => {
    if (!audId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiJson<{
        audition: AuditionDto;
        bands: BandWithMembersDto[];
        ownBandIds: string[];
        canEditWiki: boolean;
      }>(`/api/auditions/${encodeURIComponent(audId)}/bands`);
      setAudition(res.audition);
      setBands(res.bands);
      setOwnBandIds(res.ownBandIds);
      setCanEditWiki(res.canEditWiki);
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'バンド情報の取得に失敗しました',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSelectableUsers();
  }, [loadSelectableUsers]);

  useEffect(() => {
    void loadBandsForAudition(auditionId);
  }, [auditionId, loadBandsForAudition]);

  const sortedBands = useMemo(
    () =>
      [...bands].sort((a, b) => {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return b.performanceOrder - a.performanceOrder;
      }),
    [bands],
  );

  const editingBand = useMemo(
    () => (editingBandId ? bands.find((b) => b.id === editingBandId) ?? null : null),
    [bands, editingBandId],
  );

  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        `${u.grade}回生`.includes(q),
    );
  }, [allUsers, memberSearch]);

  const openCreateModal = () => {
    setEditingBandId(null);
    setBandName('');
    setSelectedMemberIds([user.id]);
    setMemberSearch('');
    setModalOpen(true);
  };

  const openEditModal = (band: BandWithMembersDto) => {
    setEditingBandId(band.id);
    setBandName(band.name);
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

  if (!audition) {
    return (
      <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-300 rounded-sm p-8 text-center">
        <p className="font-bold text-zinc-800">
          オーディション情報の読み込みに失敗しました
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {message?.text ?? '指定されたオーディションが見つからないか、表示できません。'}
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
              出演バンド登録・一覧
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              「バンド募集中」の期間中は、全部員でバンド登録・メンバー選択ができます。募集締切後は閲覧専用になります。
            </p>
          </div>

          {canEditWiki && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition cursor-pointer shrink-0 self-start sm:self-auto"
            >
              <Plus className="h-4 w-4" />
              バンドを登録
            </button>
          )}
        </div>

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
                ? 'バンド募集終了のため閲覧のみ / 管理者権限で編集可'
                : 'バンド募集終了のため閲覧のみ'}
            </div>
          )}
        </div>
      </div>

      <ToastNotification
        message={
          message
            ? {
                text: message.text,
                type: message.type === 'err' ? 'error' : 'success',
              }
            : null
        }
        onClose={() => setMessage(null)}
      />

      {/* バンド一覧 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sortedBands.map((band) => {
          const isOwn = ownBandIds.includes(band.id);
          return (
            <div
              key={band.id}
              className={`bg-zinc-50 border rounded-sm p-3.5 sm:p-4 space-y-2.5 ${
                isOwn ? 'border-slate-300 ring-1' : 'border-zinc-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center h-7 w-7 rounded-sm bg-slate-700 text-white font-bold text-xs shrink-0">
                    {band.performanceOrder}
                  </span>
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-zinc-800 text-sm sm:text-base truncate">
                      {band.name}
                    </h3>
                    {isOwn && (
                      <span className="inline-block text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded-sm shrink-0">
                        あなたが所属
                      </span>
                    )}
                  </div>
                </div>

                {canEditWiki && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditModal(band)}
                      className="p-1.5 rounded-sm text-zinc-600 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                      title="編集"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBand(band)}
                      className="p-1.5 rounded-sm text-zinc-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                      title="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {band.members.length === 0 ? (
                  <span className="text-xs text-zinc-400">未設定</span>
                ) : (
                  band.members.map((m) => (
                    <span
                      key={m.userId}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-medium border ${
                        m.userId === user.id
                          ? 'bg-slate-100 border-slate-300 text-slate-800 font-semibold'
                          : 'bg-zinc-100 border-zinc-300 text-zinc-700'
                      }`}
                    >
                      <span>{m.name}</span>
                      <span className="text-[10px] text-zinc-500">
                        {m.grade}回
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}

        {sortedBands.length === 0 && (
          <div className="col-span-full bg-zinc-50 border border-dashed border-zinc-300 rounded-sm p-10 text-center text-sm text-zinc-500">
            まだバンドが登録されていません。「バンドを登録」ボタンから追加してください。
          </div>
        )}
      </div>

      {/* バンド登録・編集モーダル */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-700/60 flex items-center justify-center p-4">
          <div className="bg-zinc-50 rounded-sm max-w-xl w-full max-h-[90dvh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-300 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-bold text-zinc-800">
                {editingBandId ? 'バンド情報の編集' : '新規バンド登録'}
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
              <div className="space-y-1">
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

              {/* メンバー選択 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    所属メンバー選択
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
                            {u.name} {u.grade}回
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
                    placeholder="氏名・回生で検索..."
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
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-800 truncate">
                            {u.name}
                          </span>
                          <span className="text-xs text-zinc-500 shrink-0">
                            {u.grade}回生
                          </span>
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

              {editingBand && (
                <div className="bg-zinc-100 border border-zinc-200 rounded-sm px-3 py-2 text-xs text-zinc-600 flex items-center justify-between gap-2 flex-wrap">
                  <span>最終更新者: {editingBand.updatedByName ?? 'システム'}</span>
                  <span>
                    更新日時: {new Date(editingBand.updatedAt).toLocaleString('ja-JP')}
                  </span>
                </div>
              )}

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

