import { useEffect, useState } from 'react';
import { AlertCircle, Award, LogIn, Shield, UserCheck, Wrench } from 'lucide-react';
import { apiJson } from '../api/client.ts';
import type { AuthMeResponse, AuthUserDto } from '../types.ts';

interface DevUserItem {
  id: string;
  name: string;
  role: 'ADMIN' | 'VOTER';
  enrollmentYear: number;
  grade: number;
}

interface LoginPageProps {
  authInfo: AuthMeResponse;
  onLoggedIn: (user: AuthUserDto) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_domain:
    '許可されていないドメインのGoogleアカウントです。学内Googleアカウントでログインしてください。',
  unregistered_member:
    '部員マスタに登録されていないアカウントです。運営委員へ登録を依頼してください。',
  unverified_email:
    'メールアドレスが確認されていないためログインできません。',
  oauth_not_configured:
    'Google OAuth クライアント設定が未完了です。環境変数 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を設定するか、開発用ログインをご利用ください。',
};

export function LoginPage({ authInfo, onLoggedIn }: LoginPageProps) {
  const [devUsers, setDevUsers] = useState<DevUserItem[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('error');
    if (errCode) {
      setErrorMsg(ERROR_MESSAGES[errCode] ?? 'ログイン処理中にエラーが発生しました。');
    }
  }, []);

  useEffect(() => {
    if (!authInfo.devLoginEnabled) return;
    apiJson<{ enabled: boolean; users: DevUserItem[] }>('/api/auth/dev-users')
      .then((res) => {
        if (res.enabled) setDevUsers(res.users);
      })
      .catch(() => {});
  }, [authInfo.devLoginEnabled]);

  const handleDevLogin = async (userId: string) => {
    setErrorMsg(null);
    setLoadingId(userId);
    try {
      const res = await apiJson<{ user: AuthUserDto }>('/api/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      onLoggedIn(res.user);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full space-y-6">
        <div className="bg-zinc-50 rounded-sm overflow-hidden border border-zinc-300">
          <div className="border-t-4 border-t-slate-700 border-b border-zinc-300 px-6 py-7 text-center">
            <div className="mx-auto h-12 w-12 rounded-sm bg-slate-700 flex items-center justify-center mb-3">
              <Award className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-800 tracking-tight">
              神大ROCK AUDITION
            </h1>
            <p className="text-xs sm:text-sm text-zinc-600 mt-1">
              神戸大学軽音楽部ROCK オーディション採点・集計システム
            </p>
          </div>

          <div className="p-6 space-y-5">
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-sm p-3.5 text-sm flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              <a
                href="/api/auth/google"
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-sm bg-slate-700 hover:bg-slate-700 text-white font-semibold text-sm sm:text-base transition"
              >
                <LogIn className="h-5 w-5" />
                <span>学内Googleアカウントでログイン</span>
              </a>
              <p className="text-xs text-center text-zinc-500">
                許可ドメイン:{' '}
                <span className="font-mono font-medium text-zinc-700">
                  {authInfo.allowedDomains.join(', ') || '未設定'}
                </span>
              </p>
            </div>

            {authInfo.devLoginEnabled && devUsers.length > 0 && (
              <div className="pt-4 border-t border-zinc-300 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                  <Wrench className="h-4 w-4 shrink-0" />
                  <span>
                    ローカル開発・検証用ダミーログイン（ワンクリックで権限別アカウントに切替可能）
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                  {devUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      disabled={loadingId !== null}
                      onClick={() => handleDevLogin(u.id)}
                      className="w-full text-left px-3.5 py-2.5 rounded-sm border border-zinc-300 hover:border-slate-500 hover:bg-slate-100 transition flex items-center justify-between gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-zinc-800 truncate">
                            {u.name}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {u.grade}回生
                          </span>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs font-semibold shrink-0 ${
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
                        {u.role === 'ADMIN' ? '管理者' : '一般部員'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

