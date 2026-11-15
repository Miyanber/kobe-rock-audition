import { drizzle } from 'drizzle-orm/d1';
import * as schema from './server/db/schema.ts';
import { createApp } from './server/app.ts';
import type { EnvBindings } from './server/types.ts';

const { app } = createApp((c) => {
  if (!c.env.DB) {
    throw new Error('Cloudflare D1 binding (DB) が設定されていません。');
  }
  return drizzle(c.env.DB, { schema });
});

export default {
  async fetch(request: Request, env: EnvBindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return app.fetch(request, env, ctx);
  },
};

