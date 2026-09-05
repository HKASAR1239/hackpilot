import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createApp } from '../engine/server.mjs';
import { verify } from '../engine/verifier.mjs';
import { pdfFixture } from '../tests/fixtures.mjs';
const dataDir = await mkdtemp(join(tmpdir(), 'hackpilot-workspace-'));
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const app = await createApp({
  dataDir,
  port: 0,
  previewPort: 0,
  production: true,
  runnerOptions: {
    verify: async (input) => {
      await gate;
      return verify(input);
    },
  },
});
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const base = `http://127.0.0.1:${app.port}`;
const checks = [],
  errors = [];
let launches = 0;
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.method() === 'POST' && request.url().endsWith('/api/missions'))
    launches++;
});
async function selected(name) {
  await page
    .getByRole('tab', { name, exact: true })
    .locator(':scope[aria-selected="true"]')
    .waitFor();
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  const brief =
    'Préparer une démonstration de coordination des surplus alimentaires avec persistance après rechargement.';
  await page.locator('#brief').fill(brief);
  await page.locator('#hours').fill('1');
  await page.getByText('Paramètres de génération', { exact: true }).click();
  await page.locator('#provider').selectOption('demo');
  await page.locator('#document-files').setInputFiles({
    name: 'assignment.pdf',
    mimeType: 'application/pdf',
    buffer: pdfFixture(),
  });
  await page.locator('.uploaded-document').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#brief').inputValue(), brief);
  assert.equal(await page.locator('#hours').inputValue(), '1');
  assert.equal(await page.locator('#provider').inputValue(), 'demo');
  assert.equal(await page.locator('.uploaded-document').count(), 1);
  checks.push('Brief, settings and uploaded PDF survive reload');
  await page.getByRole('button', { name: /Créer le projet/ }).click();
  await page
    .getByRole('heading', { name: 'Vérification', exact: true })
    .waitFor();
  const id = app.store.list()[0].id;
  assert.ok(page.url().includes(id));
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'Vérification', exact: true })
    .waitFor();
  assert.equal(app.store.list().length, 1);
  assert.equal(app.runner.running.size, 1);
  assert.equal(launches, 1);
  checks.push(
    'Reload restores the same running project without creating or restarting a run',
  );
  await page.goto(base + '/#new', { waitUntil: 'networkidle' });
  await page.locator('#brief').waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#brief').inputValue(), brief);
  assert.equal(app.runner.running.size, 1);
  await page
    .getByRole('button', { name: 'Voir la progression', exact: true })
    .click();
  await page
    .getByRole('heading', { name: 'Vérification', exact: true })
    .waitFor();
  checks.push(
    'Navigating away and reloading preserves the running project and the new draft view',
  );
  release();
  await page
    .getByText('Prototype vérifié', { exact: true })
    .waitFor({ timeout: 60000 });
  await selected('Résultats');
  await page.getByRole('tab', { name: 'Tests', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  await selected('Tests');
  checks.push('Completed project and selected checks tab survive reload');
  const beforeFailure = page.url();
  await context.route('**/api/missions', (route) => route.abort());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Réessayer', exact: true }).waitFor();
  assert.equal(page.url(), beforeFailure);
  await context.unroute('**/api/missions');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await selected('Tests');
  checks.push(
    'Temporary API failure preserves the saved view and retry restores it',
  );
  await page.getByRole('tab', { name: 'Résultats', exact: true }).click();
  await page.locator('.source-files > summary').click();
  await page.getByRole('button', { name: 'app.js', exact: true }).click();
  await page
    .locator('.file-browser pre')
    .getByText('localStorage', { exact: false })
    .waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  await selected('Résultats');
  assert.equal(await page.locator('.source-files').getAttribute('open'), '');
  await page
    .locator('.file-browser pre')
    .getByText('localStorage', { exact: false })
    .waitFor();
  checks.push('Open source reader and selected file are restored');
  const sharedUrl = page.url();
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto(sharedUrl, { waitUntil: 'networkidle' });
  await otherPage
    .locator('.file-browser pre')
    .getByText('localStorage', { exact: false })
    .waitFor();
  assert.equal(app.store.list().length, 1);
  await otherContext.close();
  checks.push(
    'Project URL opens the same view in a browser context with no local storage',
  );
  await page
    .getByRole('button', { name: 'Nouveau projet', exact: true })
    .click();
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#brief').waitFor();
  assert.equal(await page.locator('#brief').inputValue(), brief);
  assert.equal(await page.locator('.uploaded-document').count(), 1);
  assert.ok(page.url().endsWith('#new'));
  checks.push(
    'Explicit new-project view restores its draft instead of reopening an old project',
  );
  await page.goto(
    base + '/#project=00000000-0000-4000-8000-000000000000&tab=project',
    { waitUntil: 'networkidle' },
  );
  await page
    .getByRole('alert')
    .filter({
      hasText:
        'Le projet enregistré n’est plus disponible. Votre brouillon est conservé.',
    })
    .waitFor();
  assert.equal(await page.locator('#brief').inputValue(), brief);
  checks.push('A missing project falls back to the preserved draft');
  await page
    .getByRole('button', { name: 'Effacer le brouillon', exact: true })
    .click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#brief').inputValue(), '');
  assert.equal(await page.locator('.uploaded-document').count(), 0);
  checks.push('Intentional draft clearing remains cleared after reload');
  assert.deepEqual(errors, []);
  assert.equal(launches, 1);
  checks.push('No JavaScript error or duplicate generation');
  await mkdir('validation', { recursive: true });
  await writeFile(
    'validation/workspace-ui-result.json',
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({ passed: true, count: checks.length, checks }, null, 2),
  );
} catch (error) {
  await mkdir('validation', { recursive: true });
  await page
    .screenshot({ path: 'validation/workspace-ui-failure.png', fullPage: true })
    .catch(() => {});
  await writeFile(
    'validation/workspace-ui-result.json',
    JSON.stringify(
      { passed: false, checks, error: error.message, errors },
      null,
      2,
    ),
  );
  console.error(error);
  process.exitCode = 1;
} finally {
  release();
  await browser.close();
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
