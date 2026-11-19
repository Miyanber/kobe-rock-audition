import type { MiddlewareHandler } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../types.ts';
import { users } from '../db/schema.ts';
import { verifySessionCookie } from '../lib/session.ts';
import type { AppDb } from '../db/client.ts';

export function createDbMiddleware(dbResolver: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => Promise<AppDb> | AppDb): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const db = await dbResolver(c);
    c.set('db', db);

    const userId = await verifySessionCookie(c);
    if (userId) {
      const [found] = await db
        .select({
          id: users.id,
          name: users.name,
          role: users.role,
          enrollmentYear: users.enrollmentYear,
          isGradeConfirmed: users.isGradeConfirmed,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      c.set('user', found ?? null);
    } else {
      c.set('user', null);
    }

    await next();
  };
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '認証が必要です。ログインしてください。' }, 401);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '認証が必要です。' }, 401);
  }
  if (user.role !== 'ADMIN') {
    return c.json({ error: '管理者（ADMIN）権限が必要です。' }, 403);
  }
  await next();
};

