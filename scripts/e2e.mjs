import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
const base = process.env.HACKPILOT_URL || 'http://127.0.0.1:4317';
await mkdir('validation', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const results = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.title(), 'HackPilot — Projets');
  assert.equal(
    await page.getByRole('button', { name: /Créer le projet/ }).isDisabled(),
    true,
  );
  results.push('État vide et lancement désactivé sans brief');
  await page
    .getByRole('button', { name: 'Coordination de dons', exact: true })
    .click();
  assert.equal(await page.locator('#provider').inputValue(), 'demo');
  assert.equal(
    await page.getByRole('button', { name: /Créer le projet/ }).isEnabled(),
    true,
  );
  results.push('Exemple chargé, mode sans IA explicite');
  const started = Date.now();
  while ((await (await fetch(base + '/api/health')).json()).active) {
    if (Date.now() - started > 1000000)
      throw new Error('Une mission ne se termine pas.');
    await new Promise((r) => setTimeout(r, 3000));
  }
  await page.getByRole('button', { name: /Créer le projet/ }).click();
  await page
    .getByText('Prototype vérifié', { exact: true })
    .waitFor({ timeout: 60000 });
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  results.push(
    'Mission lancée depuis l’interface, terminée et résultats affichés en haut de page',
  );
  const id = (await (await fetch(base + '/api/missions')).json())[0].id;
  const m = await (await fetch(base + '/api/missions/' + id)).json();
  assert.equal(m.tests.passed, true);
  assert.equal(m.provider, 'demo');
  await page.getByRole('tab', { name: 'Tests', exact: true }).click();
  await page
    .getByText('Publier un don et le retrouver après rechargement', {
      exact: true,
    })
    .waitFor();
  results.push('Preuves des tests accessibles dans l’interface');
  await page.getByRole('tab', { name: 'Résultats' }).click();
  const frame = page.frameLocator('iframe[title="Prototype généré"]');
  await frame.locator('#food').fill('Courges du potager');
  await frame.locator('#quantity').fill('3');
  await frame.getByRole('button', { name: /Publier le don/ }).click();
  await frame.getByText('Courges du potager', { exact: true }).waitFor();
  results.push('Prototype interactif dans son aperçu isolé');
  await page.locator('.source-files > summary').click();
  await page.getByRole('button', { name: 'app.js', exact: true }).click();
  await page
    .locator('.file-browser pre')
    .getByText('localStorage', { exact: false })
    .waitFor();
  results.push('Lecture du code généré');
  const download = await fetch(base + '/api/missions/' + id + '/export');
  assert.equal(download.status, 200);
  const zip = unzipSync(new Uint8Array(await download.arrayBuffer()));
  assert.ok(zip['index.html']);
  assert.ok(zip['hackpilot/tests.json']);
  assert.ok(zip['hackpilot/submission.md']);
  assert.equal(
    Object.keys(zip).some(
      (p) => p.includes('generation') || p.includes('.env'),
    ),
    false,
  );
  assert.match(strFromU8(zip['hackpilot/submission.md']), /PASS/);
  results.push('Export ZIP valide, code et preuves inclus, secrets exclus');
  await page.getByRole('tab', { name: 'Dossier final' }).click();
  await page.getByText('Le prototype est local.', { exact: false }).waitFor();
  results.push('Limites du rendu affichées');
  await page.getByRole('tab', { name: 'Synthèse' }).click();
  await page.screenshot({
    path: 'validation/mission-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
    false,
  );
  await page.screenshot({
    path: 'validation/mission-mobile.png',
    fullPage: true,
  });
  results.push('Mission utilisable sur mobile sans débordement');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('.mobile-projects-toggle').click();
  await page
    .locator('.mission-link')
    .filter({ hasText: 'Atelier local' })
    .first()
    .click();
  await page.getByText('Prototype vérifié', { exact: true }).waitFor();
  results.push('Mission conservée après rechargement de l’atelier');
  const bad = await fetch(base + '/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad',
  });
  assert.equal(bad.status, 400);
  results.push('Entrée JSON invalide correctement refusée');
  const foreign = await fetch(base + '/api/missions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://example.org',
    },
    body: '{}',
  });
  assert.equal(foreign.status, 403);
  results.push('Commande depuis une origine étrangère refusée');
  assert.deepEqual(errors, []);
  results.push('Aucune erreur JavaScript dans l’atelier');
  await writeFile(
    'validation/e2e-result.json',
    JSON.stringify(
      { passed: true, at: new Date().toISOString(), checks: results, errors },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { passed: true, count: results.length, checks: results },
      null,
      2,
    ),
  );
} catch (e) {
  await page
    .screenshot({ path: 'validation/e2e-failure.png', fullPage: true })
    .catch(() => {});
  await writeFile(
    'validation/e2e-result.json',
    JSON.stringify(
      { passed: false, checks: results, error: e.message, errors },
      null,
      2,
    ),
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
