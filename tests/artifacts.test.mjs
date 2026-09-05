import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { normalizePlan, validateBundle, hasWeb } from '../engine/schema.mjs';
import { calculateRows } from '../engine/calculations.mjs';
import {
  validateArtifacts,
  materializeArtifacts,
  verifyArtifacts,
} from '../engine/artifacts.mjs';
import { casePlan, caseBundle, caseBrief } from './case-fixture.mjs';
import { fixturePlan, fixtureBundle } from '../engine/fixture.mjs';
import { Runner } from '../engine/runner.mjs';
import { Store } from '../engine/store.mjs';
import { qualityResponder } from './quality-fixture.mjs';
const sources = [{ id: 'S1', text: caseBrief, title: 'Énoncé', url: null }];
test('une étude de cas accepte une approche et respecte les livrables retenus', () => {
  const plan = normalizePlan(casePlan(), sources),
    bundle = caseBundle();
  assert.equal(plan.ideas.length, 1);
  assert.equal(hasWeb(plan), false);
  validateBundle(bundle, plan);
  validateArtifacts(bundle, plan, sources);
  assert.throws(
    () => validateBundle(fixtureBundle(), plan),
    /Aucun fichier web/,
  );
  assert.equal(hasWeb(fixturePlan()), true);
});
test('les livrables mixtes conservent les obligations du prototype', () => {
  const plan = casePlan();
  plan.deliverables.push({
    id: 'app',
    kind: 'web',
    title: 'Application',
    reason:
      'Ajout proposé : explorer les scénarios de rentabilité pendant la présentation.',
    count: null,
  });
  const bundle = { ...fixtureBundle(), artifacts: caseBundle().artifacts };
  validateBundle(bundle, plan);
  validateArtifacts(bundle, plan, sources);
  bundle.tests = [];
  assert.throws(() => validateBundle(bundle, plan), /deux scénarios/);
});
test('vérifie le calcul du seuil, les scénarios et une modification des entrées', () => {
  const rows = caseBundle().artifacts[2].sheets[0].rows;
  assert.deepEqual(
    calculateRows(rows).slice(4),
    [75, 240, 0.8, 180, -4500, 240, 0, 300, 4500],
  );
  rows[0].value = 145;
  assert.equal(calculateRows(rows)[5], 180);
  assert.equal(calculateRows(rows).at(-1), 12000);
  assert.deepEqual(
    calculateRows([
      { value: 2, formula: '' },
      { value: 3, formula: '' },
      { formula: 'SUM(B2:B3)+MAX(B2,B3)*2' },
    ]),
    [2, 3, 11],
  );
});
test('refuse les références manquantes, circulaires et calculs impossibles', () => {
  for (const formula of [
    'B99',
    'B2',
    '1/0',
    'SUM(B3:B2)',
    'UNKNOWN(2)',
    'B2+',
    'A2',
  ])
    assert.throws(() => calculateRows([{ value: null, formula }]));
});
test('ne perd ni livrable, ni nombre de slides, ni provenance numérique', () => {
  const plan = casePlan(),
    bundle = caseBundle();
  bundle.artifacts.pop();
  assert.throws(() => validateArtifacts(bundle, plan, sources));
  const other = caseBundle();
  other.artifacts[1].slides.pop();
  assert.throws(
    () => validateArtifacts(other, plan, sources),
    /nombre de slides/,
  );
  const third = caseBundle();
  third.artifacts[2].sheets[0].rows[0].sourceId = '';
  assert.throws(
    () => validateArtifacts(third, plan, sources),
    /source ou une hypothèse/,
  );
});
test('exporte et relit PDF, PowerPoint et Excel sans créer de site', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-artifacts-'));
  try {
    const bundle = caseBundle(),
      plan = casePlan();
    const result = await materializeArtifacts(
      bundle,
      plan,
      sources,
      dir,
      new AbortController().signal,
    );
    assert.equal(result.metadata.length, 3);
    assert.equal(
      (await readdir(dir)).some((f) => /\.(html|js|css)$/.test(f)),
      false,
    );
    const checked = await verifyArtifacts(bundle, plan, sources, dir);
    assert.equal(checked.passed, true, JSON.stringify(checked));
    assert.equal(checked.results.length, 3);
    assert.match(await readFile(join(dir, 'calculs.md'), 'utf8'), /80 %/);
    assert.match(await readFile(join(dir, 'calculs-1.csv'), 'utf8'), /,80,"%"/);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(dir, 'calculs.xlsx'));
    assert.equal(wb.worksheets[0].getCell('B7').result, 240);
    assert.equal(wb.worksheets[0].getCell('B7').formula, 'B4/B6');
    assert.match(
      await readFile(join(dir, 'analyse.md'), 'utf8'),
      /240 participants/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('mission documentaire complète et réparation sans tests de site', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-case-runner-'));
  try {
    const store = new Store(dir);
    await store.init();
    let malformed = true;
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onBuild: (_request, part, d) => {
          if (d.kind === 'presentation' && malformed) {
            malformed = false;
            part.artifacts[0].slides.pop();
          }
          return part;
        },
      }),
      verify: async () => {
        throw new Error('Un site ne doit pas être testé.');
      },
    });
    const m = await store.create({
      provider: 'codex',
      brief: caseBrief,
      url: '',
      hours: 1,
    });
    await runner.start(m.id);
    const start = Date.now();
    while (runner.running.size) {
      if (Date.now() - start > 20000) throw new Error('Mission bloquée');
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(m.status, 'completed', m.error);
    assert.equal(m.repairs, 1);
    assert.equal(m.previewUrl, null);
    assert.equal(m.artifacts.length, 3);
    assert.doesNotMatch(m.submission, /Héberger publiquement|Chromium|Vidéo/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('une donnée inconnue reste vide et ne devient jamais zéro dans un calcul', () => {
  assert.deepEqual(
    calculateRows([{ label: 'Demande réelle', value: null, formula: '' }]),
    [null],
  );
  assert.throws(
    () =>
      calculateRows([
        { value: null, formula: '' },
        { value: null, formula: 'B2*2' },
      ]),
    /Valeur numérique manquante/,
  );
});
