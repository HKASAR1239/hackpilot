import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../engine/server.mjs';

const dataDir = await mkdtemp(join(tmpdir(), 'hackpilot-e2e-'));
let app;
try {
  app = await createApp({ dataDir, port: 0, previewPort: 0, production: true });
  const origin = `http://127.0.0.1:${app.port}`;
  console.log(`Isolated end-to-end test: ${origin}`);
  const child = spawn(process.execPath, ['scripts/e2e.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, HACKPILOT_URL: origin },
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  process.exitCode = code;
} finally {
  await app?.close();
  await rm(dataDir, { recursive: true, force: true });
}
