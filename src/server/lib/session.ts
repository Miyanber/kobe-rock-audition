import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import type { AppEnv, EnvBindings } from '../types.ts';

export const SESSION_COOKIE_NAME = 'kra_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7日間

export interface RuntimeConfig {
  googleClientId: string;
  googleClientSecret: string;
  allowedDomains: string[];
  initialAdminEmails: string[];
  sessionSecret: string;
  allowUnregisteredDomainUsers: boolean;
  enableDevLogin: boolean;
}

function readEnvValue(bindings: EnvBindings | undefined, key: keyof EnvBindings): string {
  const fromBinding = bindings?.[key];
  if (typeof fromBinding === 'string' && fromBinding.length > 0) {
    return fromBinding;
  }
  if (typeof process !== 'undefined' && process.env && typeof process.env[key] === 'string') {
    return process.env[key] as string;
  }
  return '';
}

export function getRuntimeConfig(c: Context<AppEnv>): RuntimeConfig {
  const bindings = c.env;
  const allowedRaw = readEnvValue(bindings, 'ALLOWED_GOOGLE_DOMAIN') || 'stu.kobe-u.ac.jp';
  const adminRaw = readEnvValue(bindings, 'INITIAL_ADMIN_EMAILS') || 'admin@stu.kobe-u.ac.jp';
  const allowUnregRaw = readEnvValue(bindings, 'ALLOW_UNREGISTERED_DOMAIN_USERS') || 'true';
  const devLoginRaw = readEnvValue(bindings, 'ENABLE_DEV_LOGIN');

  // 本番Workersで明示的に 'false' とされない限り、ローカル開発では有効化しやすい設定
  const enableDevLogin =
    devLoginRaw === 'true' ||
    (devLoginRaw === '' && !readEnvValue(bindings, 'GOOGLE_CLIENT_ID'));

  return {
    googleClientId: readEnvValue(bindings, 'GOOGLE_CLIENT_ID'),
    googleClientSecret: readEnvValue(bindings, 'GOOGLE_CLIENT_SECRET'),
    allowedDomains: allowedRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    initialAdminEmails: adminRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    sessionSecret:
      readEnvValue(bindings, 'SESSION_SECRET') ||
      'local-dev-insecure-session-secret-change-in-production',
    allowUnregisteredDomainUsers: allowUnregRaw.toLowerCase() !== 'false',
    enableDevLogin,
  };
}

export function isAllowedDomainEmail(email: string, config: RuntimeConfig): boolean {
  const lower = email.trim().toLowerCase();
  if (config.initialAdminEmails.includes(lower)) return true;
  const domain = lower.split('@')[1] ?? '';
  if (!domain) return false;
  return config.allowedDomains.includes(domain);
}

export async function issueSessionCookie(
  c: Context<AppEnv>,
  userId: string,
): Promise<void> {
  const config = getRuntimeConfig(c);
  const nowSec = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      sub: userId,
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SECONDS,
    },
    config.sessionSecret,
    'HS256',
  );

  const isHttps = c.req.url.startsWith('https://');
  setCookie(c, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
}

export async function verifySessionCookie(
  c: Context<AppEnv>,
): Promise<string | null> {
  const token = getCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;

  const config = getRuntimeConfig(c);
  try {
    const payload = await verify(token, config.sessionSecret, 'HS256');
    if (typeof payload.sub === 'string' && payload.sub.length > 0) {
      return payload.sub;
    }
    return null;
  } catch {
    return null;
  }
}

