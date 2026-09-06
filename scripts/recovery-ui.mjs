import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../engine/server.mjs';
import { createSchedule } from '../engine/schedule.mjs';
const dir = await mkdtemp(join(tmpdir(), 'hp-recovery-ui-'));
const app = await createApp({
  dataDir: dir,
  port: 0,
  previewPort: 0,
  production: true,
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const m = await app.store.create({
    brief: 'Synthetic transport recovery check.',
    hours: 0.5,
    provider: 'codex',
    locale: 'en',
    workflowVersion: 2,
  });
  m.status = 'running';
  m.currentCall = {
    purpose: 'planning',
    status: 'running',
    reasoningEffort: 'xhigh',
    startedAt: new Date().toISOString(),
    connectionStatus: 'retrying',
  };
  await app.store.save(m);
  await page.goto(`http://127.0.0.1:${app.port}/#project=${m.id}&tab=overview`);
  await page.locator('#language').selectOption('en');
  await page
    .getByText('The model connection was interrupted.', { exact: false })
    .waitFor();
  await page.locator('#language').selectOption('fr');
  await page
    .getByText('Connexion au modèle interrompue.', { exact: false })
    .waitFor();
  m.status = 'failed';
  m.schedule = createSchedule({
    hours: 0.5,
    deadlineAt: new Date(Date.now() + 120000).toISOString(),
  });
  await app.store.save(m);
  await page.reload();
  await page
    .getByText('La reprise conserve cette échéance.', { exact: false })
    .waitFor();
  assert.equal(
    await page
      .getByText('Connexion au modèle interrompue.', { exact: false })
      .count(),
    0,
  );
  await page.getByRole('link', { name: 'Modifier l’échéance' }).click();
  await page.getByText('Jalons et échéance', { exact: true }).waitFor();
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    'Live reconnect notice, stopped state, deadline recovery link, FR/EN and mobile: passed.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
