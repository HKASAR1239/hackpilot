import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../engine/store.mjs';
import { Runner } from '../engine/runner.mjs';
import { normalizePlan } from '../engine/schema.mjs';
import {
  validateDesign,
  validateReview,
  applyContractReview,
  repairTargets,
} from '../engine/quality.mjs';
import { casePlan, caseBundle, caseBrief } from './case-fixture.mjs';
import {
  designFixture,
  qualityResponder,
  reviewFixture,
} from './quality-fixture.mjs';
const source = { id: 'S1', text: caseBrief, title: 'Synthetic assignment' };
async function settle(runner) {
  const until = Date.now() + 30000;
  while (runner.running.size) {
    if (Date.now() > until) throw new Error('Run did not finish');
    await new Promise((r) => setTimeout(r, 20));
  }
}
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'hp-quality-'));
  const store = new Store(dir);
  await store.init();
  const m = await store.create({
    brief: caseBrief,
    url: '',
    hours: 1,
    provider: 'codex',
    locale: 'en',
  });
  return { dir, store, m };
}
test('restart preserves checked outputs byte-for-byte and only produces missing deliverables', async () => {
  const { dir, store, m } = await setup();
  const calls = [];
  let runner;
  try {
    runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: ({ purpose, configuration }) =>
          calls.push({ purpose, effort: configuration.reasoningEffort }),
        onBuild: (request, part) => {
          if (request.purpose === 'build:analyse') {
            runner.cancel(m.id);
            throw request.signal.reason;
          }
          return part;
        },
      }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'cancelled');
    assert.equal(m.production.checkpoints.calculs.status, 'checked');
    const saved = await readFile(join(store.dir(m.id), 'project/calculs.xlsx'));
    assert.ok(m.files.includes('calculs.xlsx'));
    const usageBefore = m.usage.calls;
    const restored = new Store(dir);
    await restored.init();
    const after = [];
    const resumed = new Runner(restored, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: (r) => after.push(r.purpose),
      }),
    });
    await resumed.start(m.id);
    await settle(resumed);
    const result = restored.get(m.id);
    assert.equal(result.status, 'completed', result.error);
    assert.deepEqual(after, ['build:analyse', 'build:presentation', 'review']);
    assert.equal(result.usage.calls, usageBefore + after.length);
    assert.deepEqual(
      await readFile(join(restored.dir(m.id), 'project/calculs.xlsx')),
      saved,
    );
    assert.ok(
      calls
        .filter((c) => c.purpose.startsWith('build:'))
        .every((c) => c.effort === 'high'),
    );
    assert.ok(
      calls
        .filter((c) => !c.purpose.startsWith('build:'))
        .every((c) => c.effort === 'xhigh'),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('review repairs only the implicated slides and interrupted repairs keep their allowance', async () => {
  const { dir, store, m } = await setup();
  const calls = [];
  let runner, savedSpreadsheet;
  try {
    runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: (r) => calls.push(r.purpose),
        onReview: async (_request, review) => {
          savedSpreadsheet = await readFile(
            join(store.dir(m.id), 'project/calculs.xlsx'),
          );
          review.issues.push({
            severity: 'major',
            deliverableIds: ['presentation'],
            detail: 'Explain why demand must be validated before launch.',
          });
          return review;
        },
        onBuild: (request, part) => {
          if (request.purpose === 'repair:presentation') {
            runner.cancel(m.id);
            throw request.signal.reason;
          }
          return part;
        },
      }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.repairs, 1);
    assert.equal(m.status, 'cancelled');
    assert.deepEqual(m.production.pendingRepairs, ['presentation']);
    const restored = new Store(dir);
    await restored.init();
    const after = [];
    const resumed = new Runner(restored, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: (r) => after.push(r.purpose),
      }),
    });
    await resumed.start(m.id);
    await settle(resumed);
    const result = restored.get(m.id);
    assert.equal(result.status, 'completed', result.error);
    assert.equal(
      result.repairs,
      1,
      'resuming a previously charged repair does not charge twice',
    );
    assert.deepEqual(after, ['repair:presentation', 'review']);
    assert.deepEqual(result.production.pendingRepairs, []);
    assert.deepEqual(
      await readFile(join(restored.dir(m.id), 'project/calculs.xlsx')),
      savedSpreadsheet,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('reference rejects invented quotations, uncovered obligations and invalid calculations', () => {
  const plan = normalizePlan(casePlan(), [source]);
  plan.requirements.push({
    id: 'R1',
    kind: 'mandatory',
    text: 'Give a conditional recommendation.',
  });
  const mission = { plan, sources: [source] };
  const valid = designFixture(plan, caseBundle().artifacts[2].sheets);
  assert.equal(
    validateDesign(valid, mission).calculatedValues[0].rows[5].value,
    240,
  );
  const forged = structuredClone(valid);
  forged.facts.push({
    id: 'F1',
    statement: 'Demand is proven.',
    sourceId: 'S1',
    quote: 'We have already secured 300 customers.',
  });
  assert.throws(() => validateDesign(forged, mission), /Unsupported fact/);
  const uncovered = structuredClone(valid);
  uncovered.acceptanceCriteria[0].requirementIds = [];
  assert.throws(
    () => validateDesign(uncovered, mission),
    /no acceptance criterion/,
  );
  const bad = structuredClone(valid);
  bad.calculations[0].rows[0].formula = '1/0';
  assert.throws(() => validateDesign(bad, mission));
});
test('missing or unverified review evidence cannot silently complete a project', () => {
  const plan = normalizePlan(casePlan(), [source]);
  const design = designFixture(plan);
  const mission = { plan, design };
  const missing = reviewFixture(design);
  missing.checks.pop();
  assert.throws(
    () => validateReview(missing, mission),
    /every acceptance criterion/,
  );
  const noEvidence = reviewFixture(design);
  noEvidence.checks[0].evidence = '';
  assert.throws(() => validateReview(noEvidence, mission), /evidence/);
  const unresolved = reviewFixture(design);
  unresolved.checks[1].status = 'unverified';
  const checked = validateReview(unresolved, mission);
  assert.equal(checked.mustFix.length, 1);
  assert.deepEqual(
    repairTargets(checked, plan).map((d) => d.id),
    [],
  );
  assert.equal(checked.unverified.length, 1);
});

test('unverified external evidence stops honestly without spending repairs on correct files', async () => {
  const { dir, store, m } = await setup();
  const calls = [];
  try {
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: (r) => calls.push(r.purpose),
        onReview: (_request, review) => {
          review.checks[0].status = 'unverified';
          review.checks[0].evidence =
            'A field observation needed for this criterion has not been performed.';
          return review;
        },
      }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'failed');
    assert.match(m.error, /Incomplete verification/);
    assert.equal(m.repairs, 0);
    assert.ok(m.files.includes('calculs.xlsx'));
    assert.equal(
      calls.filter((purpose) => purpose.startsWith('repair:')).length,
      0,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('capability review preserves criterion identities, requirement coverage and reference numbers', () => {
  const plan = normalizePlan(casePlan(), [source]);
  const design = designFixture(plan, caseBundle().artifacts[2].sheets);
  const before = structuredClone(design);
  const reviewed = applyContractReview(
    design,
    {
      summary: 'Make an internally proposed capability check executable.',
      corrections: [
        {
          criterionId: design.acceptanceCriteria[0].id,
          criterion:
            'Document the operating assumptions and unsupported input domain.',
          evidence:
            'Read the assumptions section and exported calculation results.',
        },
      ],
      blockingIssues: [],
      limitations: ['Native spreadsheet input enforcement is unavailable.'],
    },
    { plan, sources: [source] },
  );
  assert.deepEqual(reviewed.calculations, before.calculations);
  assert.deepEqual(reviewed.facts, before.facts);
  assert.deepEqual(
    reviewed.acceptanceCriteria.map((c) => [
      c.id,
      c.requirementIds,
      c.deliverableIds,
    ]),
    before.acceptanceCriteria.map((c) => [
      c.id,
      c.requirementIds,
      c.deliverableIds,
    ]),
  );
  assert.deepEqual(
    design,
    before,
    'preflight does not mutate the saved proposal',
  );
});
