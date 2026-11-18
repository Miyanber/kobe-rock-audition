import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Shield, Trash2, Upload, UserCheck, Users } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { ToastNotification } from '../components/ToastNotification.tsx';
import type { AuditionDto, AuthUserDto, SelectableUserDto } from '../types.ts';
import type { Role } from '../../shared/schema/index.ts';

interface AdminUsersPageProps {
  currentUser: AuthUserDto;
  returnAudition?: AuditionDto | null;
  onReturnToAudition?: () => void;
  onCurrentUserChanged: () => Promise<void>;
}

const SAMPLE_USERS_CSV = `山田 音子,otoko@stu.kobe-u.ac.jp,2026,VOTER
佐藤 リズム,rhythm@stu.kobe-u.ac.jp,2025,ADMIN`;

export function AdminUsersPage({
  currentUser,
  returnAudition,
  onReturnToAudition,
  onCurrentUserChanged,
}: AdminUsersPageProps) {
  const [usersList, setUsersList] = useState<
    Array<SelectableUserDto & { role: Role }>
  >([]);
  const [csvText, setCsvText] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiJson<{
        users: Array<SelectableUserDto & { role: Role }>;
      }>('/api/admin/users');
      setUsersList(res.users);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleBulkUpload = async () => {
    if (!csvText.trim()) return;
    setMessage(null);
    try {
      const res = await apiJson<{
        upsertedCount: number;
        errors: string[];
        users: Array<SelectableUserDto & { role: Role }>;
      }>('/api/admin/users/bulk', {
        method: 'POST',
        body: JSON.stringify({ csvText }),
      });
      setUsersList(res.users);
      setCsvText('');
      setMessage({
        type: res.errors.length > 0 ? 'err' : 'ok',
        text: `${res.upsertedCount}名の部員データを登録・更新しました${
          res.errors.length > 0 ? `（エラー: ${res.errors.join(' / ')}）` : ''
        }`,
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : '一括登録に失敗しました',
      });
    }
  };

  const handleToggleRole = async (
    target: SelectableUserDto & { role: Role },
  ) => {
    const nextRole: Role = target.role === 'ADMIN' ? 'VOTER' : 'ADMIN';
    setMessage(null);
    try {
      await apiJson(`/api/admin/users/${target.id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      await loadUsers();
      if (target.id === currentUser.id) {
        await onCurrentUserChanged();
      }
      setMessage({
        type: 'ok',
        text: `「${target.name}」の権限を ${nextRole} に変更しました`,
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'ロール変更に失敗しました',
      });
    }
  };

  const handleDeleteUser = async (
    target: SelectableUserDto & { role: Role },
  ) => {
    if (
      !window.confirm(
        `「${target.name}」（${target.email}）を部員マスタから削除しますか？\n※この部員に紐づくバンド所属、投票権限、採点データもすべて削除され、元に戻せません。`,
      )
    ) {
      return;
    }
    setMessage(null);
    try {
      await apiJson(`/api/admin/users/${target.id}`, {
        method: 'DELETE',
      });
      await loadUsers();
      setMessage({
        type: 'ok',
        text: `「${target.name}」を部員マスタから削除しました`,
      });
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : '部員の削除に失敗しました',
      });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-zinc-50 border border-zinc-300 rounded-sm p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
              全オーディション共通設定
            </span>
          </div>
          <h1 className="text-base sm:text-lg font-bold text-zinc-800 mt-1">
            部員マスタ・権限管理
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            ここで登録・編集した部員データとロール（ADMIN / VOTER）はすべてのオーディションに共通して適用されます。
          </p>
        </div>

        {returnAudition && onReturnToAudition && (
          <button
            type="button"
            onClick={onReturnToAudition}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-sm bg-white hover:bg-zinc-100 text-zinc-700 border border-zinc-300 text-xs sm:text-sm font-semibold transition cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>「{returnAudition.title}」へ戻る</span>
          </button>
        )}
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

      {/* 部員マスタ CSV/TSV 一括登録 */}
      <section className="bg-zinc-50 border border-zinc-300 rounded-sm p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
            <Upload className="h-5 w-5 text-slate-700" />
            部員マスタ CSV / TSV 一括登録・更新
          </h2>
          <button
            type="button"
            onClick={() => setCsvText(SAMPLE_USERS_CSV)}
            className="text-xs font-semibold text-slate-700 hover:underline cursor-pointer"
          >
            サンプル形式を挿入
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          書式: <code className="bg-zinc-100 px-1.5 py-0.5 rounded">氏名,メールアドレス,入部年度[,ロール(ADMIN/VOTER)]</code>
          （同一メールアドレスは自動上書き更新されます）
        </p>
        <textarea
          rows={4}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`山田 音子,otoko@stu.kobe-u.ac.jp,2026,VOTER\n佐藤 リズム,rhythm@stu.kobe-u.ac.jp,2025,ADMIN`}
          className="w-full rounded-sm border border-zinc-300 px-3.5 py-2.5 text-sm font-mono"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleBulkUpload}
            className="px-4 py-2 rounded-sm bg-slate-700 hover:bg-slate-700 text-white text-sm font-bold cursor-pointer"
          >
            部員を一括登録 / 更新
          </button>
        </div>
      </section>

      {/* 部員一覧 & 権限管理 */}
      <section className="bg-zinc-50 border border-zinc-300 rounded-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-300 flex items-center justify-between">
          <h2 className="text-base font-bold text-zinc-800 flex items-center gap-2">
            <Users className="h-5 w-5 text-zinc-700" />
            部員マスタ・権限管理 ({usersList.length}名)
          </h2>
          <span className="text-xs text-zinc-500">
            ※回生は入部年度から毎年4月基準で自動算出されます
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-zinc-500">読み込み中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-zinc-100 border-b border-zinc-300 font-bold text-zinc-700">
                  <th className="px-4 py-3">氏名</th>
                  <th className="px-4 py-3">メールアドレス</th>
                  <th className="px-4 py-3">入部年度 / 回生</th>
                  <th className="px-4 py-3">ロール</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-zinc-100">
                    <td className="px-4 py-3 font-bold text-zinc-800">
                      {u.name}
                      {u.id === currentUser.id && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          あなた
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-zinc-700">
                      {u.enrollmentYear}年入部（{u.grade}回生）
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-sm text-xs font-bold ${
                          u.role === 'ADMIN'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-zinc-100 text-zinc-700 border border-zinc-300'
                        }`}
                      >
                        {u.role === 'ADMIN' ? (
                          <Shield className="h-3 w-3" />
                        ) : (
                          <UserCheck className="h-3 w-3" />
                        )}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleRole(u)}
                          className={`px-3 py-1.5 rounded-sm text-xs font-bold border transition cursor-pointer ${
                            u.role === 'ADMIN'
                              ? 'bg-zinc-50 hover:bg-zinc-100 text-zinc-700 border-zinc-300'
                              : 'bg-amber-50 hover:bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {u.role === 'ADMIN' ? 'VOTERへ変更' : 'ADMINへ昇格'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u)}
                          disabled={u.id === currentUser.id}
                          title={
                            u.id === currentUser.id
                              ? '自分自身は削除できません'
                              : '部員を削除'
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-sm text-xs font-bold border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

