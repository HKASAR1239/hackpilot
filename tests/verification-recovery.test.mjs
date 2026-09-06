import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { casePlan, caseBundle, caseBrief } from './case-fixture.mjs';
import { materializeArtifacts, verifyArtifacts } from '../engine/artifacts.mjs';
import {
  applyVerificationRecovery,
  activeCalculationChecks,
  activeWebTests,
} from '../engine/verification-recovery.mjs';
import { verify } from '../engine/verifier.mjs';
import { parseCSV } from '../engine/csv-evidence.mjs';
const change = {
  id: 'price',
  deliverableId: 'calculs',
  sheet: 'Rentabilite',
  description: 'Price scenario',
  inputs: [{ label: 'Prix', value: 145 }],
  expected: [{ label: 'Seuil de rentabilité', value: 180 }],
};
const empty = {
  summary: 'Add missing verification evidence.',
  webTests: [],
  calculationChecks: [],
  replacements: [],
  unavailable: [],
};
test('replacement checks need an audit reason, preserve other checks, and cannot forge numeric results', () => {
  const m = {
    plan: casePlan(),
    bundle: caseBundle(),
    design: {
      acceptanceCriteria: [{ id: 'numbers' }],
      calculationChecks: [change],
    },
    originalTests: [],
  };
  const next = {
    ...change,
    description: 'A documented revision to the scenario.',
    inputs: [{ label: 'Prix', value: 195 }],
    expected: [{ label: 'Seuil de rentabilité', value: 120 }],
  };
  assert.throws(
    () => applyVerificationRecovery({ ...empty, calculationChecks: [next] }, m),
    /reason/,
  );
  assert.deepEqual(activeCalculationChecks(m), [change]);
  assert.throws(
    () =>
      applyVerificationRecovery(
        {
          ...empty,
          calculationChecks: [
            {
              ...next,
              expected: [{ label: 'Seuil de rentabilité', value: 999 }],
            },
          ],
          replacements: [
            {
              id: 'price',
              reason: 'Correction stated in the exported document.',
            },
          ],
        },
        m,
      ),
    /disagrees/,
  );
  assert.equal(
    applyVerificationRecovery(
      {
        ...empty,
        calculationChecks: [next],
        replacements: [
          {
            id: 'price',
            reason: 'Correction stated in the exported document.',
          },
        ],
      },
      m,
    ),
    true,
  );
  assert.deepEqual(m.design.calculationChecks, [change]);
  assert.deepEqual(activeCalculationChecks(m), [next]);
  assert.deepEqual(
    m.verificationRecovery.history[0].replacements[0].before,
    change,
  );
});
test('CSV read-back checks multiline text and catches corruption despite an intact workbook', async () => {
  assert.deepEqual(parseCSV('\uFEFF"a","b"\r\n"line\n2","say ""yes"""'), [
    ['a', 'b'],
    ['line\n2', 'say "yes"'],
  ]);
  const dir = await mkdtemp(join(tmpdir(), 'hp-csv-proof-'));
  try {
    const b = caseBundle(),
      p = casePlan(),
      sources = [{ id: 'S1', text: caseBrief, title: 'Case' }];
    await materializeArtifacts(
      b,
      p,
      sources,
      dir,
      new AbortController().signal,
      'en',
    );
    const result = await verifyArtifacts(b, p, sources, dir);
    assert.equal(result.passed, true);
    const evidence = result.results.find((r) =>
      r.deliverableIds.includes('calculs'),
    ).evidence;
    assert.equal(evidence[0].csv.valuesMatchWorkbook, true);
    const file = join(dir, 'calculs-1.csv');
    const csv = await readFile(file, 'utf8');
    await writeFile(file, csv.replace(',120,', ',121,'));
    assert.notEqual(await readFile(file, 'utf8'), csv);
    const corrupted = await verifyArtifacts(b, p, sources, dir);
    assert.equal(corrupted.passed, false);
    assert.match(corrupted.results.find((r) => !r.passed).detail, /CSV value/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('supplementary browser checks retain original assertions, detect a broken feature, and exercise unavailable storage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-browser-proof-'));
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      `<!doctype html><title>Storage handling fixture</title><p>This local fixture checks storage failure reporting and preserves explicit blocked action assertions.</p><button id="save">Save locally</button><button id="blocked" disabled>Unavailable action</button><output id="status">Ready</output><script>document.querySelector('#save').onclick=()=>{try{localStorage.setItem('value','saved');document.querySelector('#status').textContent='Saved'}catch{document.querySelector('#status').textContent='Storage unavailable'}};</script>`,
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const original = {
      name: 'Save with working storage',
      steps: [
        { action: 'click', selector: '#save', value: '' },
        { action: 'assertText', selector: '#status', value: 'Saved' },
      ],
    };
    const m = {
      plan: { deliverables: [{ id: 'web', kind: 'web' }] },
      bundle: { artifacts: [], tests: [original] },
      originalTests: [original],
      design: {
        acceptanceCriteria: [{ id: 'storage' }],
        calculationChecks: [],
      },
    };
    const supplement = {
      name: 'Storage error is reported',
      steps: [
        { action: 'storageMode', selector: '', value: 'write-failure' },
        { action: 'click', selector: '#save', value: '' },
        {
          action: 'assertText',
          selector: '#status',
          value: 'Storage unavailable',
        },
        { action: 'assertDisabled', selector: '#blocked', value: '' },
      ],
    };
    applyVerificationRecovery({ ...empty, webTests: [supplement] }, m);
    assert.deepEqual(m.originalTests, [original]);
    assert.equal(activeWebTests(m).length, 2);
    const result = await verify({
      url: `http://127.0.0.1:${server.address().port}`,
      dir,
      tests: activeWebTests(m),
    });
    assert.equal(result.passed, true, JSON.stringify(result.results));
    assert.deepEqual(
      result.results.find((r) => r.name === supplement.name).evidence.steps,
      supplement.steps,
    );
    const broken = await verify({
      url: `http://127.0.0.1:${server.address().port}`,
      dir,
      tests: [
        {
          name: 'Bad assertion must fail',
          steps: [{ action: 'assertDisabled', selector: '#save', value: '' }],
        },
      ],
    });
    assert.equal(broken.passed, false);
    await assert.rejects(
      verify({
        url: 'unused',
        dir,
        tests: [
          {
            name: 'Invalid mode',
            steps: [
              { action: 'storageMode', selector: '', value: 'arbitrary-code' },
              { action: 'assertVisible', selector: 'body', value: '' },
            ],
          },
        ],
      }),
      /Invalid storage/,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
