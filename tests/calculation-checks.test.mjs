import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caseBundle, casePlan, caseBrief } from './case-fixture.mjs';
import {
  exerciseCalculation,
  validateCalculationChecks,
} from '../engine/calculation-checks.mjs';
import { materializeArtifacts, verifyArtifacts } from '../engine/artifacts.mjs';
const check = {
  id: 'change-price',
  deliverableId: 'calculs',
  sheet: 'Rentabilite',
  description: 'A price increase changes break-even and the high scenario.',
  inputs: [{ label: 'Prix', value: 145 }],
  expected: [
    { label: 'Seuil de rentabilité', value: 180 },
    { label: 'Résultat haut', value: 12000 },
  ],
};
test('changed-input checks reject false expectations and cannot overwrite formulas', () => {
  const rows = caseBundle().artifacts[2].sheets[0].rows;
  assert.equal(exerciseCalculation(rows, check).passed, true);
  assert.equal(rows[0].value, 120, 'shared reference is not mutated');
  assert.throws(
    () =>
      exerciseCalculation(rows, {
        ...check,
        inputs: [{ label: 'Marge unitaire', value: 10 }],
      }),
    /cannot replace a formula/,
  );
  const wrong = {
    ...check,
    expected: [{ label: 'Seuil de rentabilité', value: 200 }],
  };
  assert.throws(
    () =>
      validateCalculationChecks(
        [wrong],
        { calculations: caseBundle().artifacts[2].sheets },
        casePlan(),
      ),
    /disagrees/,
  );
});
test('real Excel read-back includes cells and detects a changed-input defect that baseline values miss', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-calculation-checks-'));
  try {
    const bundle = { ...caseBundle(), artifacts: [caseBundle().artifacts[2]] };
    const plan = { deliverables: [casePlan().deliverables[2]] };
    const sources = [{ id: 'S1', text: caseBrief, title: 'Synthetic case' }];
    await materializeArtifacts(
      bundle,
      plan,
      sources,
      dir,
      new AbortController().signal,
    );
    const bytes = await readFile(join(dir, 'calculs.xlsx'));
    const passed = await verifyArtifacts(bundle, plan, sources, dir, [check]);
    assert.equal(passed.passed, true);
    assert.ok(passed.results[0].evidence[0].headers.length > 4);
    assert.equal(passed.results[0].evidence[0].cells[0].cell, 'B2');
    assert.equal(passed.results[1].evidence.outputs[0].actual, 180);
    assert.deepEqual(
      await readFile(join(dir, 'calculs.xlsx')),
      bytes,
      'test inputs do not change the exported file',
    );
    const frozen = structuredClone(bundle);
    frozen.artifacts[0].sheets[0].rows[5].formula = '240';
    await materializeArtifacts(
      frozen,
      plan,
      sources,
      dir,
      new AbortController().signal,
    );
    assert.equal(
      (await verifyArtifacts(frozen, plan, sources, dir)).passed,
      true,
      'a frozen correct initial result passes the original file checks',
    );
    const failed = await verifyArtifacts(frozen, plan, sources, dir, [check]);
    assert.equal(failed.passed, false);
    assert.equal(failed.results.at(-1).passed, false);
    assert.equal(failed.results.at(-1).evidence.outputs[0].actual, 240);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
