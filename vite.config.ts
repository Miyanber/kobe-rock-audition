import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function loadDevVars(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function honoDevApiPlugin(): Plugin {
  return {
    name: 'hono-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) {
          return next();
        }
        try {
          const mod = await server.ssrLoadModule('/src/server/dev-entry.ts');
          const honoApp = mod.default;

          const protocol =
            (req.headers['x-forwarded-proto'] as string) || 'http';
          const host = req.headers.host || 'localhost:5173';
          const url = `${protocol}://${host}${req.url}`;

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) headers.append(key, v);
            } else if (value !== undefined) {
              headers.set(key, value);
            }
          }

          let body: Buffer | undefined;
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            if (chunks.length > 0) {
              body = Buffer.concat(chunks);
            }
          }

          const webRequest = new Request(url, {
            method: req.method,
            headers,
            body: body ? new Uint8Array(body) : undefined,
          });

          const devVars = loadDevVars(path.resolve(__dirname, '.dev.vars'));
          const webResponse: Response = await honoApp.fetch(webRequest, devVars);

          res.statusCode = webResponse.status;
          webResponse.headers.forEach((value, key) => {
            if (key.toLowerCase() === 'set-cookie') {
              const existing = res.getHeader('set-cookie');
              const list = Array.isArray(existing)
                ? existing
                : existing
                  ? [String(existing)]
                  : [];
              res.setHeader('set-cookie', [...list, value]);
            } else {
              res.setHeader(key, value);
            }
          });

          const arrayBuf = await webResponse.arrayBuffer();
          res.end(Buffer.from(arrayBuf));
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), honoDevApiPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});

