import { Hono } from 'hono';
import type { AppEnv } from './types.ts';
import type { AppDb } from './db/client.ts';
import { createDbMiddleware } from './middleware/auth.ts';
import { authRoutes } from './routes/auth.ts';
import { auditionRoutes } from './routes/auditions.ts';
import { adminRoutes } from './routes/admin.ts';

export type DbResolver = (c: Parameters<Parameters<typeof createDbMiddleware>[0]>[0]) => Promise<AppDb> | AppDb;

export function createApp(dbResolver: DbResolver) {
  const app = new Hono<AppEnv>();

  app.onError((err, c) => {
    console.error('[API Error]', err);
    const errObj = err as unknown as { status?: unknown };
    const status =
      typeof errObj.status === 'number'
        ? (errObj.status as 400 | 401 | 403 | 404 | 500)
        : 500;
    return c.json(
      {
        error: err.message || 'サーバー内部エラーが発生しました。',
      },
      status,
    );
  });

  app.use('/api/*', createDbMiddleware(dbResolver));

  const apiRoutes = app
    .basePath('/api')
    .get('/health', (c) => c.json({ ok: true, timestamp: Date.now() }))
    .route('/auth', authRoutes)
    .route('/auditions', auditionRoutes)
    .route('/admin', adminRoutes);

  return { app, apiRoutes };
}

// Hono RPC 型推論用
type CreatedApp = ReturnType<typeof createApp>['apiRoutes'];
export type AppType = CreatedApp;
