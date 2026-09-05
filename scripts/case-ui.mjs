import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.HACKPILOT_URL || 'http://127.0.0.1:4317';
const { id } = JSON.parse(
  await readFile('validation/live-case-result.json', 'utf8'),
);
const mission = await (await fetch(base + '/api/missions/' + id)).json();
assert.equal(mission.status, 'completed');
const web = mission.plan.deliverables.some((d) => d.kind === 'web');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [],
  checks = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page
    .getByRole('button', { name: 'Étude de cas · 1 h', exact: true })
    .click();
  assert.equal(await page.locator('#hours').inputValue(), '1');
  assert.match(
    await page.locator('#brief').inputValue(),
    /4 slides PowerPoint/,
  );
  checks.push('Exemple d’une heure et formats explicités');
  await page
    .locator('.mission-link')
    .filter({ hasText: mission.name })
    .first()
    .click();
  await page
    .getByText(web ? 'Prototype vérifié' : 'Livrables vérifiés', {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole('tab', {
      name: web
        ? (await page.locator('#language').inputValue()) === 'en'
          ? 'Preview & code'
          : 'Aperçu & code'
        : 'Documents',
      exact: true,
    })
    .click();
  assert.equal(await page.locator('iframe').count(), web ? 1 : 0);
  assert.equal(await page.locator('.artifact-list article').count(), 3);
  checks.push('Documents imposés affichés, aperçu web conforme au plan');
  await page
    .getByRole('button', { name: 'Lire le contenu', exact: true })
    .first()
    .click();
  await page.locator('.file-browser pre').filter({ hasText: '240' }).waitFor();
  checks.push('Lecture de l’analyse dans l’interface');
  for (const ext of ['pdf', 'pptx', 'xlsx']) {
    const link = page
      .locator('.artifact-actions a')
      .filter({ hasText: new RegExp('\\.' + ext + '$') })
      .first();
    const href = await link.getAttribute('href');
    assert(href);
    const result = await fetch(base + href);
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-disposition'), /attachment/);
    assert((await result.arrayBuffer()).byteLength > 100);
  }
  checks.push('Téléchargements PDF, PowerPoint et Excel accessibles');
  await page.screenshot({
    path: 'validation/case-documents-desktop.png',
    fullPage: true,
  });
  await page.locator('#language').selectOption('en');
  await page
    .getByRole('tab', { name: web ? 'Tests' : 'Checks', exact: true })
    .click();
  await page
    .getByText('Files are read back and calculations recomputed.', {
      exact: false,
    })
    .waitFor();
  checks.push('Vue des vérifications traduite en anglais');
  await page
    .getByRole('tab', {
      name: web
        ? (await page.locator('#language').inputValue()) === 'en'
          ? 'Preview & code'
          : 'Aperçu & code'
        : 'Documents',
      exact: true,
    })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
    false,
  );
  await page.screenshot({
    path: 'validation/case-documents-mobile-en.png',
    fullPage: true,
  });
  checks.push('Documents utilisables sur mobile');
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#language').inputValue(), 'en');
  await page
    .locator('.mission-link')
    .filter({ hasText: mission.name })
    .first()
    .click();
  await page
    .getByText(web ? 'Prototype verified' : 'Deliverables verified', {
      exact: true,
    })
    .waitFor();
  checks.push('Projet conservé après rechargement');
  const missing = await fetch(
    base + '/api/missions/' + id + '/download?path=missing.pdf',
  );
  assert.equal(missing.status, 404);
  checks.push('Téléchargement limité aux fichiers du projet');
  assert.deepEqual(errors, []);
  checks.push('Aucune erreur JavaScript');
  await writeFile(
    'validation/case-ui-result.json',
    JSON.stringify({ passed: true, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, count: checks.length, checks }));
} catch (e) {
  await page.screenshot({
    path: 'validation/case-ui-failure.png',
    fullPage: true,
  });
  throw e;
} finally {
  await browser.close();
}
