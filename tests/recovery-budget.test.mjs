import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generationBudget,
  exhaustedBudget,
  reviseGenerationBudget,
} from '../lib/generation-budget.mjs';
import { Store } from '../engine/store.mjs';
import { Runner } from '../engine/runner.mjs';
import { casePlan, caseBundle, caseBrief } from './case-fixture.mjs';
import { qualityResponder } from './quality-fixture.mjs';
import { adaptiveResponder, adaptiveBrief } from './adaptive-fixture.mjs';
const settle = async (runner) => {
  const until = Date.now() + 30000;
  while (runner.running.size) {
    if (Date.now() > until) throw Error('Test run did not settle');
    await new Promise((r) => setTimeout(r, 10));
  }
};
test('budget extensions preserve every usage counter and record changed limits without changing the deadline', () => {
  const m = {
    usage: { calls: 15, input: 624680, output: 91521 },
    repairs: 2,
    schedule: { callBudget: 24, deadlineAt: 'unchanged' },
  };
  assert.equal(exhaustedBudget(m).field, 'inputTokens');
  const before = structuredClone(m);
  assert.throws(
    () => reviseGenerationBudget(m, { inputTokens: 900000, outputTokens: -1 }),
    /Invalid/,
  );
  assert.deepEqual(m, before);
  reviseGenerationBudget(m, {
    inputTokens: 1200000,
    reason: 'Recovery approved by user.',
  });
  assert.deepEqual(m.usage, before.usage);
  assert.equal(m.repairs, 2);
  assert.equal(m.schedule.deadlineAt, 'unchanged');
  assert.equal(exhaustedBudget(m), null);
  assert.equal(m.budgetChanges[0].before.inputTokens, 600000);
  assert.equal(generationBudget(m).calls, 24);
});
test('an input-budget stop before final review resumes only review and preserves every exported byte', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-budget-resume-'));
  try {
    const store = new Store(dir);
    await store.init();
    const m = await store.create({
      brief: caseBrief,
      url: '',
      hours: 1,
      provider: 'codex',
      locale: 'en',
    });
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onBuild: (request, part) => {
          if (request.purpose === 'build:presentation')
            request.onUsage({ input_tokens: 600001, output_tokens: 7 });
          return part;
        },
      }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'failed');
    assert.equal(m.blocker.field, 'inputTokens');
    assert.ok(
      Object.values(m.production.checkpoints).every(
        (c) => c.status === 'checked',
      ),
    );
    const bytes = await Promise.all(
      m.files.map(async (p) => [
        p,
        await readFile(join(store.dir(m.id), 'project', p)),
      ]),
    );
    const usage = structuredClone(m.usage);
    reviseGenerationBudget(m, { inputTokens: 1200000 });
    await store.save(m);
    const restarted = new Store(dir);
    await restarted.init();
    const calls = [];
    const resume = new Runner(restarted, 'http://127.0.0.1:9999', {
      generate: qualityResponder(casePlan(), caseBundle(), {
        onCall: (r) => calls.push(r.purpose),
      }),
    });
    await resume.start(m.id);
    await settle(resume);
    const result = restarted.get(m.id);
    assert.equal(result.status, 'completed', result.error);
    assert.deepEqual(calls, ['review']);
    assert.equal(result.usage.calls, usage.calls + 1);
    assert.equal(result.usage.input, usage.input);
    for (const [p, expected] of bytes)
      assert.deepEqual(
        await readFile(join(store.dir(m.id), 'project', p)),
        expected,
        p,
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('a jury transport failure reuses the accepted content review after restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-jury-resume-'));
  try {
    const store = new Store(dir);
    await store.init();
    const m = await store.create({
      brief: adaptiveBrief,
      url: '',
      hours: 2,
      provider: 'codex',
      locale: 'en',
      workflowVersion: 2,
    });
    const verify = async () => ({
      passed: true,
      results: [
        {
          name: 'Synthetic browser oracle',
          passed: true,
          detail: 'Fixture only.',
        },
      ],
      screenshot: false,
    });
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      verify,
      generate: adaptiveResponder({
        onCall: (r) => {
          if (r.purpose === 'jury') throw Error('Simulated provider failure');
        },
      }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'failed');
    assert.equal(m.review.mustFix.length, 0);
    assert.ok(m.reviewCheckpoint.key);
    const restarted = new Store(dir);
    await restarted.init();
    const calls = [];
    const resumed = new Runner(restarted, 'http://127.0.0.1:9999', {
      verify,
      generate: adaptiveResponder({ onCall: (r) => calls.push(r.purpose) }),
    });
    await resumed.start(m.id);
    await settle(resumed);
    assert.equal(
      restarted.get(m.id).status,
      'completed',
      restarted.get(m.id).error,
    );
    assert.deepEqual(calls, ['jury']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('missing calculation evidence is added and executed without regenerating the checked documents', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-evidence-resume-'));
  try {
    const store = new Store(dir);
    await store.init();
    const m = await store.create({
      brief: caseBrief,
      url: '',
      hours: 1,
      provider: 'codex',
      locale: 'en',
    });
    const calls = [];
    let saved;
    const base = qualityResponder(casePlan(), caseBundle(), {
      onReview: async (_r, review) => {
        if (!saved)
          saved = await Promise.all(
            m.files.map(async (p) => [
              p,
              await readFile(join(store.dir(m.id), 'project', p)),
            ]),
          );
        if (
          !m.tests.results.some(
            (r) => r.name === 'A new price scenario' && r.passed,
          )
        ) {
          review.checks[2].status = 'unverified';
          review.checks[2].evidence =
            'The requested higher-price sensitivity has not been executed.';
        }
        return review;
      },
    });
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: async (r) => {
        calls.push(r.purpose);
        if (r.purpose === 'verification-recovery')
          return {
            summary: 'Exercise the missing price scenario.',
            webTests: [],
            calculationChecks: [
              {
                id: 'higher-price',
                deliverableId: 'calculs',
                sheet: 'Rentabilite',
                description: 'A new price scenario',
                inputs: [{ label: 'Prix', value: 145 }],
                expected: [{ label: 'Seuil de rentabilité', value: 180 }],
              },
            ],
            replacements: [],
            unavailable: [],
          };
        return base(r);
      },
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'completed', m.error);
    assert.equal(m.repairs, 0);
    assert.equal(m.verificationRecovery.rounds, 1);
    assert.deepEqual(calls.slice(-3), [
      'review',
      'verification-recovery',
      'review',
    ]);
    assert.equal(m.review.mustFix.length, 0);
    for (const [p, bytes] of saved)
      assert.deepEqual(
        await readFile(join(store.dir(m.id), 'project', p)),
        bytes,
        p,
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
