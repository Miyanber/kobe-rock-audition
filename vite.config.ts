import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { Marked, Renderer } from 'marked';
import fs from 'node:fs';
import path from 'node:path';

interface ManualTocItem {
  id: string;
  level: 2 | 3;
  text: string;
}

interface CompiledManualDoc {
  title: string;
  html: string;
  toc: ManualTocItem[];
}

const VIRTUAL_MANUAL_DOCS_ID = 'virtual:manual-docs';
const RESOLVED_VIRTUAL_MANUAL_DOCS_ID = `\0${VIRTUAL_MANUAL_DOCS_ID}`;
const MANUAL_IMAGES_PREFIX = '/manual-images/';

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

function rewriteManualImagePath(src: string): string {
  if (src.startsWith('./images/')) {
    return `${MANUAL_IMAGES_PREFIX}${src.slice('./images/'.length)}`;
  }
  if (src.startsWith('images/')) {
    return `${MANUAL_IMAGES_PREFIX}${src.slice('images/'.length)}`;
  }
  return src;
}

function rewriteManualHtmlImages(html: string): string {
  return html.replace(
    /(src=["'])(?:\.\/)?images\//g,
    `$1${MANUAL_IMAGES_PREFIX}`,
  );
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderManualFigure(href: string, alt: string, title?: string | null): string {
  const rewrittenHref = escapeHtmlAttr(rewriteManualImagePath(href));
  const escapedAlt = escapeHtmlAttr(alt);
  const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
  const imgTag = `<img src="${rewrittenHref}" alt="${escapedAlt}"${titleAttr} loading="lazy" />`;
  if (!alt.trim()) {
    return `<figure class="manual-figure">${imgTag}</figure>\n`;
  }
  return `<figure class="manual-figure">${imgTag}<figcaption>${escapedAlt}</figcaption></figure>\n`;
}

function compileManualMarkdown(
  markdownPath: string,
  docKey: string,
): CompiledManualDoc {
  const source = fs.readFileSync(markdownPath, 'utf8');
  const toc: ManualTocItem[] = [];
  let title = '';
  let sectionIndex = 0;

  const baseRenderer = new Renderer();
  const marked = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      heading(token) {
        const rendered = this.parser.parseInline(token.tokens);
        const plainText = stripHtmlTags(rendered);
        if (token.depth === 1 && !title) {
          title = plainText;
        }
        if (token.depth === 2 || token.depth === 3) {
          sectionIndex += 1;
          const id = `${docKey}-sec-${sectionIndex}`;
          toc.push({
            id,
            level: token.depth,
            text: plainText,
          });
          return `<h${token.depth} id="${id}">${rendered}</h${token.depth}>\n`;
        }
        return `<h${token.depth}>${rendered}</h${token.depth}>\n`;
      },
      paragraph(token) {
        if (token.tokens.length === 1 && token.tokens[0].type === 'image') {
          const img = token.tokens[0];
          return renderManualFigure(img.href, img.text, img.title);
        }
        return `<p>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
      image(token) {
        return renderManualFigure(token.href, token.text, token.title);
      },
      html(token) {
        return rewriteManualHtmlImages(token.text);
      },
      table(token) {
        return `<div class="manual-table-wrap">${baseRenderer.table.call(this, token)}</div>\n`;
      },
    },
  });

  const html = marked.parse(source, { async: false });
  return {
    title,
    html,
    toc,
  };
}

function manualDocsPlugin(): Plugin {
  const docsDir = path.resolve(__dirname, 'docs');
  const imagesDir = path.join(docsDir, 'images');
  const operationsPath = path.join(docsDir, 'OPERATIONS.md');
  const userGuidePath = path.join(docsDir, 'USER_GUIDE.md');

  return {
    name: 'manual-docs',
    resolveId(id) {
      if (id === VIRTUAL_MANUAL_DOCS_ID) {
        return RESOLVED_VIRTUAL_MANUAL_DOCS_ID;
      }
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_MANUAL_DOCS_ID) {
        return undefined;
      }
      const operationsManual = compileManualMarkdown(
        operationsPath,
        'operations',
      );
      const userGuideManual = compileManualMarkdown(
        userGuidePath,
        'user-guide',
      );
      return [
        `export const operationsManual = ${JSON.stringify(operationsManual)};`,
        `export const userGuideManual = ${JSON.stringify(userGuideManual)};`,
      ].join('\n');
    },
    configureServer(server) {
      server.watcher.add([operationsPath, userGuidePath]);

      const invalidate = (filePath: string) => {
        const normalized = path.resolve(filePath);
        if (
          normalized === path.resolve(operationsPath) ||
          normalized === path.resolve(userGuidePath)
        ) {
          const mod = server.moduleGraph.getModuleById(
            RESOLVED_VIRTUAL_MANUAL_DOCS_ID,
          );
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: 'full-reload' });
        }
      };

      server.watcher.on('change', invalidate);

      server.middlewares.use((req, res, next) => {
        const reqPath = (req.url ?? '').split('?')[0];
        if (!reqPath.startsWith(MANUAL_IMAGES_PREFIX)) {
          return next();
        }
        const fileName = path.basename(
          decodeURIComponent(reqPath.slice(MANUAL_IMAGES_PREFIX.length)),
        );
        const targetPath = path.join(imagesDir, fileName);
        if (!fileName || !fs.existsSync(targetPath)) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const ext = path.extname(fileName).toLowerCase();
        const mimeType = IMAGE_MIME_TYPES[ext] ?? 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        res.end(fs.readFileSync(targetPath));
      });
    },
    generateBundle() {
      if (!fs.existsSync(imagesDir)) {
        return;
      }
      for (const entry of fs.readdirSync(imagesDir, { withFileTypes: true })) {
        if (!entry.isFile()) continue;
        const ext = path.extname(entry.name).toLowerCase();
        if (!IMAGE_MIME_TYPES[ext]) continue;
        this.emitFile({
          type: 'asset',
          fileName: `manual-images/${entry.name}`,
          source: fs.readFileSync(path.join(imagesDir, entry.name)),
        });
      }
    },
  };
}

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
  plugins: [react(), tailwindcss(), manualDocsPlugin(), honoDevApiPlugin()],
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

