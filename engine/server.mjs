import {
  EXECUTION_LIMIT_MINUTES,
  CALL_LIMIT_MINUTES,
  MAX_CALLS,
  MAX_INPUT,
  MAX_OUTPUT,
} from '../lib/execution-limits.mjs';
import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import { Store } from './store.mjs';
import { Runner } from './runner.mjs';
import { capabilities, generationSettings } from './provider.mjs';
import { Documents, MAX_FILE_BYTES, documentError } from './documents.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export async function safeRead(base, path) {
  if (
    !path ||
    path.includes('\\') ||
    path.split('/').some((p) => p === '..' || p === '.') ||
    path.startsWith('/')
  )
    throw Object.assign(new Error('Chemin refusé.'), { status: 400 });
  const actual = await realpath(join(base, path));
  const canonical = await realpath(base);
  if (!actual.startsWith(canonical + sep))
    throw Object.assign(new Error('Chemin refusé.'), { status: 400 });
  return readFile(actual);
}
export async function createApp({
  dataDir = process.env.HACKPILOT_DATA_DIR || join(root, '.hackpilot'),
  port = Number(process.env.PORT) || 4318,
  previewPort = Number(process.env.HACKPILOT_PREVIEW_PORT) || 4319,
  production = false,
  runnerOptions = {},
} = {}) {
  const store = new Store(resolve(dataDir));
  await store.init();
  const documents = new Documents(store.root);
  await documents.init();
  let apiPort = port;
  const reply = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(JSON.stringify(data));
  };
  const preview = http.createServer(async (req, res) => {
    try {
      const p = new URL(req.url, 'http://127.0.0.1').pathname;
      const match = p.match(/^\/p\/([a-f0-9-]{36})\/(.*)$/);
      if (!match) {
        res.writeHead(404);
        res.end('Prototype introuvable');
        return;
      }
      const m = store.get(match[1]);
      const path = decodeURIComponent(match[2] || 'index.html');
      if (!m.files.includes(path)) {
        res.writeHead(404);
        res.end('Fichier introuvable');
        return;
      }
      const data = await safeRead(join(store.dir(m.id), 'project'), path);
      res.writeHead(200, {
        'Content-Type': mime[extname(path)] || 'text/plain',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'",
      });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Prototype introuvable');
    }
  });
  await new Promise((yes, no) => {
    preview.once('error', no);
    preview.listen(previewPort, '127.0.0.1', yes);
  });
  const actualPreviewPort = preview.address().port;
  const runner = new Runner(
    store,
    'http://127.0.0.1:' + actualPreviewPort,
    runnerOptions,
  );
  const server = http.createServer(async (req, res) => {
    try {
      const allowedHosts = new Set([
        '127.0.0.1:' + apiPort,
        'localhost:' + apiPort,
        '127.0.0.1:4317',
        'localhost:4317',
      ]);
      if (!allowedHosts.has(req.headers.host)) {
        reply(res, 403, { error: 'Hôte non autorisé.' });
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1:' + apiPort),
        path = url.pathname;
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin) {
          const origin = new URL(req.headers.origin);
          if (
            !['http:', 'https:'].includes(origin.protocol) ||
            !allowedHosts.has(origin.host)
          )
            throw Object.assign(new Error('Origine non autorisée.'), {
              status: 403,
            });
        }
        if (
          !(
            path === '/api/documents' &&
            req.method === 'POST' &&
            req.headers['content-type'] === 'application/octet-stream'
          ) &&
          !String(req.headers['content-type']).startsWith('application/json')
        )
          throw Object.assign(new Error('Un corps JSON est requis.'), {
            status: 415,
          });
      }
      async function body() {
        const chunks = [];
        let size = 0;
        for await (const c of req) {
          size += c.length;
          if (size > 80000)
            throw Object.assign(new Error('Brief trop volumineux.'), {
              status: 413,
            });
          chunks.push(c);
        }
        try {
          return JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch {
          throw Object.assign(new Error('JSON invalide.'), { status: 400 });
        }
      }
      if (path === '/api/documents' && req.method === 'POST') {
        if (Number(req.headers['content-length']) > MAX_FILE_BYTES)
          throw documentError('file_size', 413);
        let filename;
        try {
          filename = decodeURIComponent(
            String(req.headers['x-file-name'] || ''),
          );
        } catch {
          throw documentError('format');
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_FILE_BYTES) throw documentError('file_size', 413);
          chunks.push(chunk);
        }
        const controller = new AbortController();
        const disconnect = () => {
          if (!res.writableEnded) controller.abort();
        };
        res.once('close', disconnect);
        try {
          const doc = await documents.add(Buffer.concat(chunks), filename, {
            signal: controller.signal,
          });
          reply(res, 201, doc);
        } finally {
          res.off('close', disconnect);
        }
        return;
      }
      if (path === '/api/health') {
        reply(res, 200, {
          ok: true,
          version: '0.0.6',
          providers: await capabilities(),
          generation: generationSettings(),
          active: runner.running.size,
          limits: {
            minutes: EXECUTION_LIMIT_MINUTES,
            callMinutes: CALL_LIMIT_MINUTES,
            repairs: 2,
            calls: MAX_CALLS,
            inputTokens: MAX_INPUT,
            outputTokens: MAX_OUTPUT,
          },
          scope: 'adaptive-deliverables',
        });
        return;
      }
      if (path === '/api/missions' && req.method === 'GET') {
        reply(res, 200, store.list());
        return;
      }
      if (path === '/api/missions' && req.method === 'POST') {
        const raw = await body();
        if (!raw || typeof raw !== 'object' || Array.isArray(raw))
          throw Object.assign(new Error('Brief ou URL invalide.'), {
            status: 400,
          });
        const input = {
          brief: raw.brief,
          url: raw.url,
          provider: raw.provider,
          hours: raw.hours,
          locale: raw.locale || 'fr',
          documents: await documents.resolve(raw.documentIds),
        };
        if (!['fr', 'en'].includes(input.locale))
          throw Object.assign(new Error('Langue invalide.'), { status: 400 });
        if (
          typeof input.brief !== 'string' ||
          typeof input.url !== 'string' ||
          input.brief.length > 40000 ||
          input.url.length > 2000
        )
          throw Object.assign(new Error('Brief ou URL invalide.'), {
            status: 400,
          });
        if (
          input.brief.trim().length < 30 &&
          !input.url.trim() &&
          !input.documents.length
        )
          throw Object.assign(
            new Error('Ajoutez un brief, une URL ou un document.'),
            { status: 400 },
          );
        if (
          !['auto', 'codex', 'demo'].includes(input.provider) ||
          !Number.isFinite(input.hours) ||
          input.hours < 1 ||
          input.hours > 720
        )
          throw Object.assign(new Error('Moteur ou durée invalide.'), {
            status: 400,
          });
        if (runner.running.size)
          throw Object.assign(new Error('Une mission est déjà en cours.'), {
            status: 409,
          });
        const m = await store.create(input);
        await runner.start(m.id);
        reply(res, 201, m);
        return;
      }
      const match = path.match(
        /^\/api\/missions\/([a-f0-9-]{36})(?:\/(resume|cancel|file|download|export|screenshot))?$/,
      );
      if (match) {
        const m = store.get(match[1]),
          action = match[2];
        if (!action && req.method === 'GET') {
          reply(res, 200, m);
          return;
        }
        if (action === 'resume' && req.method === 'POST') {
          await body();
          await runner.start(m.id);
          reply(res, 200, { ok: true });
          return;
        }
        if (action === 'cancel' && req.method === 'POST') {
          await body();
          reply(res, 200, { cancelled: runner.cancel(m.id) });
          return;
        }
        if (['file', 'download'].includes(action) && req.method === 'GET') {
          const file = url.searchParams.get('path');
          if (!m.files.includes(file))
            throw Object.assign(new Error('Fichier introuvable.'), {
              status: 404,
            });
          const data = await safeRead(join(store.dir(m.id), 'project'), file);
          if (action === 'download') {
            res.writeHead(200, {
              'Content-Type': mime[extname(file)] || 'application/octet-stream',
              'Content-Disposition':
                'attachment; filename="' + file.split('/').at(-1) + '"',
              'X-Content-Type-Options': 'nosniff',
              'Cache-Control': 'no-store',
            });
            res.end(data);
            return;
          }
          if (/\.(pdf|pptx|xlsx)$/i.test(file))
            throw Object.assign(new Error('Ce fichier doit être téléchargé.'), {
              status: 400,
            });
          reply(res, 200, {
            path: file,
            content: data.toString(),
          });
          return;
        }
        if (action === 'screenshot' && req.method === 'GET') {
          const data = await readFile(join(store.dir(m.id), 'screenshot.png'));
          res.writeHead(200, {
            'Content-Type': 'image/png',
            'Cache-Control': 'no-store',
          });
          res.end(data);
          return;
        }
        if (action === 'export' && req.method === 'GET') {
          const files = {};
          for (const f of m.files)
            files[f] = new Uint8Array(
              await safeRead(join(store.dir(m.id), 'project'), f),
            );
          files['hackpilot/submission.md'] = strToU8(
            m.submission ||
              'Mission incomplète ; voir les résultats des tests.',
          );
          files['hackpilot/strategy.json'] = strToU8(
            JSON.stringify(m.plan, null, 2),
          );
          files['hackpilot/tests.json'] = strToU8(
            JSON.stringify(
              { scenarios: m.originalTests, results: m.tests },
              null,
              2,
            ),
          );
          files['hackpilot/provenance.json'] = strToU8(
            JSON.stringify(
              {
                provider: m.provider,
                generationSettings: m.generationSettings,
                createdAt: m.createdAt,
                usage: m.usage,
                sources: m.sources.map(({ text: _text, ...s }) => s),
              },
              null,
              2,
            ),
          );
          if (m.design)
            files['hackpilot/reference.json'] = strToU8(
              JSON.stringify(m.design, null, 2),
            );
          if (m.review)
            files['hackpilot/review.json'] = strToU8(
              JSON.stringify(m.review, null, 2),
            );
          if (m.calls)
            files['hackpilot/calls.json'] = strToU8(
              JSON.stringify(m.calls, null, 2),
            );
          const zip = zipSync(files);
          res.writeHead(200, {
            'Content-Type': 'application/zip',
            'Content-Disposition':
              'attachment; filename="hackpilot-' + m.id.slice(0, 8) + '.zip"',
          });
          res.end(zip);
          return;
        }
      }
      if (production && !path.startsWith('/api/')) {
        const base = join(root, 'dist/client'),
          p = decodeURIComponent(path).replace(/^\//, '') || 'index.html';
        try {
          const data = await safeRead(base, p);
          res.writeHead(200, {
            'Content-Type': mime[extname(p)] || 'application/octet-stream',
            'X-Content-Type-Options': 'nosniff',
          });
          res.end(data);
          return;
        } catch {}
      }
      reply(res, 404, { error: 'Route introuvable.' });
    } catch (e) {
      reply(res, e.status || 500, {
        code: e.code,
        error:
          e.code === 'ENOENT'
            ? 'Fichier introuvable.'
            : e.message || 'Erreur interne.',
      });
    }
  });
  try {
    await new Promise((yes, no) => {
      server.once('error', no);
      server.listen(port, '127.0.0.1', yes);
    });
    apiPort = server.address().port;
  } catch (e) {
    await new Promise((r) => preview.close(r));
    throw e;
  }
  return {
    server,
    preview,
    store,
    runner,
    port: apiPort,
    previewPort: actualPreviewPort,
    close: async () => {
      for (const id of runner.running.keys()) runner.cancel(id);
      await Promise.all([
        new Promise((r) => server.close(r)),
        new Promise((r) => preview.close(r)),
      ]);
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const production = process.argv.includes('--production');
  const app = await createApp({
    production,
    port: Number(process.env.PORT) || (production ? 4317 : 4318),
  });
  console.log(
    'HackPilot ' +
      (production ? 'http://127.0.0.1:' : 'API http://127.0.0.1:') +
      app.port,
  );
  console.log('Prototype origin http://127.0.0.1:' + app.previewPort);
  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, async () => {
      await app.close();
      process.exit(0);
    });
}
