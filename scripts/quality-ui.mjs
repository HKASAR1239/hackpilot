import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { chromium } from 'playwright';
import { createApp } from '../engine/server.mjs';
import { casePlan, caseBundle, caseBrief } from '../tests/case-fixture.mjs';
import { qualityResponder } from '../tests/quality-fixture.mjs';
const dir = await mkdtemp(join(tmpdir(), 'hp-quality-ui-'));
const app = await createApp({
  dataDir: dir,
  port: 0,
  previewPort: 0,
  production: true,
  runnerOptions: { generate: qualityResponder(casePlan(), caseBundle()) },
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  const m = await app.store.create({
    brief: caseBrief,
    url: '',
    hours: 1,
    provider: 'codex',
    locale: 'en',
  });
  await app.runner.start(m.id);
  while (app.runner.running.size) await new Promise((r) => setTimeout(r, 20));
  assert.equal(m.status, 'completed', m.error);
  const exported = await fetch(
    `http://127.0.0.1:${app.port}/api/missions/${m.id}/export`,
  );
  assert.equal(exported.status, 200);
  const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  assert.ok(files['hackpilot/reference.json']);
  assert.ok(files['hackpilot/review.json']);
  assert.ok(files['calculs.xlsx']);
  assert.equal(
    JSON.parse(strFromU8(files['hackpilot/review.json'])).checks.length,
    3,
  );
  await page.goto(`http://127.0.0.1:${app.port}/#project=${m.id}&tab=overview`);
  await page.locator('#language').selectOption('en');
  await page
    .getByRole('heading', { name: 'Decisions and evidence', exact: true })
    .waitFor();
  assert.equal(await page.locator('.quality-criterion').count(), 3);
  assert.match(await page.locator('.quality-facts').innerText(), /3\/3/);
  await page.getByText('Approaches compared', { exact: true }).click();
  await page.getByText('A manual workflow', { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole('heading', { name: 'Decisions and evidence', exact: true })
    .waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    'mobile overflow',
  );
  await page.locator('#language').selectOption('fr');
  await page
    .getByRole('heading', { name: 'Décisions et preuves', exact: true })
    .waitFor();
  assert.deepEqual(errors, []);
  await mkdir('validation', { recursive: true });
  await page.screenshot({ path: 'validation/quality-mobile.png' });
  console.log(
    'Quality evidence, criteria, saved count, language switching, reload, and mobile width: passed.',
  );
} finally {
  await browser.close();
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
