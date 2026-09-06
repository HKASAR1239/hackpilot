import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { casePlan, caseBundle, caseBrief } from './case-fixture.mjs';
import { materializeArtifacts, verifyArtifacts } from '../engine/artifacts.mjs';
import {
  applyVerificationRecovery,
  activeCalculationChecks,
  activeWebTests,
  calculationCoverageGaps,
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
test('a corrected calculation preserves every assertion, including when split across checks; saved weak replacements remain detectable', () => {
  const before = {
    ...change,
    expected: [...change.expected, { label: 'Résultat haut', value: 12000 }],
  };
  const m = {
    plan: casePlan(),
    bundle: caseBundle(),
    originalTests: [],
    design: { calculationChecks: [before], acceptanceCriteria: [] },
  };
  const next = {
    ...change,
    inputs: [{ label: 'Prix', value: 195 }],
    expected: [{ label: 'Seuil de rentabilité', value: 120 }],
  };
  const raw = {
    ...empty,
    calculationChecks: [next],
    replacements: [{ id: next.id, reason: 'A documented corrected price.' }],
  };
  const saved = structuredClone(m);
  assert.throws(
    () => applyVerificationRecovery(raw, m),
    /coverage.*Résultat haut/,
  );
  assert.deepEqual(m, saved, 'rejection must not mutate saved checks');
  const supplement = {
    ...next,
    id: 'profit',
    expected: [{ label: 'Résultat haut', value: 27000 }],
  };
  assert.throws(
    () =>
      applyVerificationRecovery(
        {
          ...raw,
          calculationChecks: [
            next,
            {
              ...supplement,
              inputs: [{ label: 'Prix', value: 145 }],
              expected: [{ label: 'Résultat haut', value: 12000 }],
            },
          ],
        },
        m,
      ),
    /coverage/,
  );
  assert.equal(
    applyVerificationRecovery(
      { ...raw, calculationChecks: [next, supplement] },
      m,
    ),
    true,
  );
  assert.deepEqual(calculationCoverageGaps(m), []);
  // Simulate a saved plan from an older engine that accepted a weaker check.
  m.verificationRecovery.calculationChecks = [next];
  assert.ok(
    calculationCoverageGaps(m).some((g) => g.label === 'Résultat haut'),
  );
  assert.equal(
    applyVerificationRecovery({ ...empty, calculationChecks: [supplement] }, m),
    true,
  );
  assert.deepEqual(calculationCoverageGaps(m), []);
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

test('a stale supplemental message can be corrected after a repair without changing its actions or the original tests', () => {
  const original = {
    name: 'Original workflow',
    steps: [{ action: 'assertText', selector: '#status', value: 'Ready' }],
  };
  const stale = {
    name: 'Storage read-back',
    steps: [
      { action: 'storageMode', selector: '', value: 'read-failure' },
      { action: 'click', selector: '#save', value: '' },
      { action: 'assertText', selector: '#status', value: 'Only in memory' },
      { action: 'reload', selector: '', value: '' },
      { action: 'assertValue', selector: '#value', value: 'saved' },
    ],
  };
  const m = {
    plan: { deliverables: [{ id: 'web', kind: 'web' }] },
    bundle: { tests: [original], artifacts: [] },
    originalTests: [original],
    design: { acceptanceCriteria: [], calculationChecks: [] },
    tests: { results: [{ name: stale.name, passed: false }] },
    production: {
      checkpoints: { web: { createdAt: '2026-01-02T00:00:00.000Z' } },
    },
  };
  applyVerificationRecovery(
    { ...empty, webTests: [stale] },
    m,
    Date.parse('2026-01-01T00:00:00Z'),
  );
  const patch = {
    ...empty,
    webReplacements: [
      {
        name: stale.name,
        reason:
          'The repaired message must report uncertainty after a read failure, since the write succeeded.',
        assertions: [
          { step: 2, value: 'Save unconfirmed; data may already be stored' },
        ],
      },
    ],
  };
  const saved = structuredClone(m);
  assert.throws(
    () =>
      applyVerificationRecovery(
        {
          ...patch,
          webReplacements: [
            {
              ...patch.webReplacements[0],
              assertions: [{ step: 2, value: 'memory' }],
            },
          ],
        },
        m,
      ),
    /cannot shorten/,
  );
  assert.throws(
    () =>
      applyVerificationRecovery(
        {
          ...patch,
          webReplacements: [
            {
              ...patch.webReplacements[0],
              assertions: [{ step: 4, value: 'anything' }],
            },
          ],
        },
        m,
      ),
    /retain the assertion action/,
  );
  assert.throws(
    () =>
      applyVerificationRecovery(
        {
          ...patch,
          webReplacements: [
            { ...patch.webReplacements[0], name: original.name },
          ],
        },
        m,
      ),
    /Only a failed supplemental/,
  );
  assert.deepEqual(m, saved);
  assert.equal(applyVerificationRecovery(patch, m), true);
  const steps = structuredClone(stale.steps);
  steps[2].value = patch.webReplacements[0].assertions[0].value;
  assert.deepEqual(activeWebTests(m), [original, { ...stale, steps }]);
  assert.deepEqual(m.originalTests, [original]);
  assert.deepEqual(
    m.verificationRecovery.history.at(-1).webReplacements[0].before,
    stale,
  );
});

test('exported HTML runs directly from disk, persists after reload and cannot reach an external HTTP service', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-offline-proof-'));
  let requests = 0;
  const server = createServer((_req, res) => {
    requests++;
    res.end('unexpected network');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const project = join(dir, 'exported project');
    await mkdir(project);
    const path = join(project, 'index.html');
    await writeFile(
      path,
      `<!doctype html><title>Offline exported workflow</title>
      <p>This standalone exported workflow saves a fictitious value locally and demonstrates direct file opening without a server.</p>
      <input id="value"><button id="save">Save</button><output id="status">Ready</output><output id="network">Pending</output>
      <script>document.querySelector('#value').value=localStorage.getItem('value')||'';
      document.querySelector('#save').onclick=()=>{localStorage.setItem('value',document.querySelector('#value').value);document.querySelector('#status').textContent='Saved'};
      fetch('http://127.0.0.1:${server.address().port}/blocked').then(()=>document.querySelector('#network').textContent='Unexpected request').catch(()=>document.querySelector('#network').textContent='Network blocked');</script>`,
    );
    const before = await readFile(path);
    const t = {
      name: 'Direct-file save and reload',
      steps: [
        {
          action: 'assertText',
          selector: '#network',
          value: 'Network blocked',
        },
        { action: 'fill', selector: '#value', value: 'fictitious saved value' },
        { action: 'click', selector: '#save', value: '' },
        { action: 'assertText', selector: '#status', value: 'Saved' },
        { action: 'reload', selector: '', value: '' },
        {
          action: 'assertValue',
          selector: '#value',
          value: 'fictitious saved value',
        },
      ],
    };
    const m = {
      plan: { deliverables: [{ id: 'web', kind: 'web' }] },
      bundle: { tests: [], artifacts: [] },
      design: { acceptanceCriteria: [], calculationChecks: [] },
    };
    assert.equal(
      applyVerificationRecovery({ ...empty, localFileTests: [t] }, m),
      true,
    );
    const result = await verify({
      url: pathToFileURL(path).href,
      dir,
      tests: m.verificationRecovery.localFileTests,
    });
    assert.equal(result.passed, true, JSON.stringify(result.results));
    assert.equal(requests, 0);
    assert.deepEqual(await readFile(path), before);
    assert.deepEqual(m.verificationRecovery.history[0].addedLocalFileTests, [
      t,
    ]);
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
