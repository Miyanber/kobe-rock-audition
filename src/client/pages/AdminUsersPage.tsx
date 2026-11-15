import { useCallback, useEffect, useState } from 'react';
import { Shield, Upload, UserCheck, Users } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import { AdminAuditionHeader } from '../components/AdminAuditionHeader.tsx';
import type { AuditionDto, AuthUserDto, SelectableUserDto } from '../types.ts';
import type { Role } from '../../shared/schema/index.ts';

interface AdminUsersPageProps {
  currentUser: AuthUserDto;
  auditions: AuditionDto[];
  selectedAuditionId: string;
  onSelectAudition: (id: string) => void;
  onCurrentUserChanged: () => Promise<void>;
}

const SAMPLE_USERS_CSV = `山田 音子,otoko@stu.kobe-u.ac.jp,2026,VOTER
佐藤 リズム,rhythm@stu.kobe-u.ac.jp,2025,ADMIN`;

export function AdminUsersPage({
  currentUser,
  auditions,
  selectedAuditionId,
  onSelectAudition,
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

  return (
    <div className="space-y-5">
      <AdminAuditionHeader
        auditions={auditions}
        selectedAuditionId={selectedAuditionId}
        onSelectAudition={onSelectAudition}
      />

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium border ${
            message.type === 'err'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* 部員マスタ CSV/TSV 一括登録 */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Upload className="h-5 w-5 text-indigo-600" />
            部員マスタ CSV / TSV 一括登録・更新
          </h2>
          <button
            type="button"
            onClick={() => setCsvText(SAMPLE_USERS_CSV)}
            className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
          >
            サンプル形式を挿入
          </button>
        </div>
        <p className="text-xs text-slate-500">
          書式: <code className="bg-slate-100 px-1.5 py-0.5 rounded">氏名,メールアドレス,入部年度[,ロール(ADMIN/VOTER)]</code>
          （同一メールアドレスは自動上書き更新されます）
        </p>
        <textarea
          rows={4}
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          placeholder={`山田 音子,otoko@stu.kobe-u.ac.jp,2026,VOTER\n佐藤 リズム,rhythm@stu.kobe-u.ac.jp,2025,ADMIN`}
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono"
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleBulkUpload}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold cursor-pointer"
          >
            部員を一括登録 / 更新
          </button>
        </div>
      </section>

      {/* 部員一覧 & 権限管理 */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-700" />
            部員マスタ・権限管理 ({usersList.length}名)
          </h2>
          <span className="text-xs text-slate-500">
            ※回生は入部年度から毎年4月基準で自動算出されます
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">読み込み中...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <th className="px-4 py-3">氏名</th>
                  <th className="px-4 py-3">メールアドレス</th>
                  <th className="px-4 py-3">入部年度 / 回生</th>
                  <th className="px-4 py-3">ロール</th>
                  <th className="px-4 py-3 text-right">権限変更</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {u.name}
                      {u.id === currentUser.id && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                          あなた
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {u.enrollmentYear}年入部（{u.grade}回生）
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          u.role === 'ADMIN'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
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
                      <button
                        type="button"
                        onClick={() => handleToggleRole(u)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${
                          u.role === 'ADMIN'
                            ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                            : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {u.role === 'ADMIN' ? 'VOTERへ変更' : 'ADMINへ昇格'}
                      </button>
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

