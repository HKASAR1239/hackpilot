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
import {
  adaptiveResponder,
  adaptiveBrief,
  adaptivePlan,
} from './adaptive-fixture.mjs';
import { fixtureBundle } from '../engine/fixture.mjs';
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

test('an invalid evidence proposal is rejected and corrected automatically without regenerating checked documents', async () => {
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
    let proposals = 0;
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
        if (r.purpose === 'verification-recovery') {
          proposals++;
          if (proposals === 2) assert.match(r.prompt, /disagrees.*999/);
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
                expected: [
                  {
                    label: 'Seuil de rentabilité',
                    value: proposals === 1 ? 999 : 180,
                  },
                ],
              },
            ],
            replacements: [],
            unavailable: [],
          };
        }
        return base(r);
      },
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'completed', m.error);
    assert.equal(m.repairs, 0);
    assert.equal(m.verificationRecovery.rounds, 2);
    assert.equal(m.verificationRecovery.rejectedPlans.length, 1);
    assert.equal(m.verificationRecovery.history.length, 1);
    assert.deepEqual(calls.slice(-4), [
      'review',
      'verification-recovery',
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

test('repeated invalid proof proposals exhaust only their bounded allowance and cannot complete or change files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-rejected-proof-'));
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
    let saved;
    const base = qualityResponder(casePlan(), caseBundle(), {
      onReview: async (_request, review) => {
        saved = await Promise.all(
          m.files.map(async (p) => [
            p,
            await readFile(join(store.dir(m.id), 'project', p)),
          ]),
        );
        review.checks[2].status = 'unverified';
        review.checks[2].evidence = 'Missing price sensitivity evidence.';
        return review;
      },
    });
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: (r) =>
        r.purpose !== 'verification-recovery'
          ? base(r)
          : Promise.resolve({
              summary: 'Invalid independent calculation.',
              webTests: [],
              replacements: [],
              unavailable: [],
              calculationChecks: [
                {
                  id: 'price',
                  deliverableId: 'calculs',
                  sheet: 'Rentabilite',
                  description: 'A price change',
                  inputs: [{ label: 'Prix', value: 145 }],
                  expected: [{ label: 'Seuil de rentabilité', value: 999 }],
                },
              ],
            }),
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'failed');
    assert.match(m.error, /Incomplete verification.*disagrees/);
    assert.equal(m.verificationRecovery.rounds, 2);
    assert.equal(m.verificationRecovery.rejectedPlans.length, 2);
    assert.equal(m.verificationRecovery.history.length, 0);
    assert.equal(m.repairs, 0);
    for (const [p, bytes] of saved)
      assert.deepEqual(
        await readFile(join(store.dir(m.id), 'project', p)),
        bytes,
      );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a content repair followed by a stale supplemental assertion completes without undoing the repair', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-stale-message-'));
  try {
    const store = new Store(dir);
    await store.init();
    const m = await store.create({
      brief: adaptiveBrief,
      url: '',
      hours: 1,
      provider: 'codex',
      locale: 'en',
    });
    const before = 'Only in memory',
      after = 'Save unconfirmed; data may already be stored';
    const supplemental = {
      name: 'Supplemental storage status',
      steps: [
        { action: 'click', selector: '#save', value: '' },
        { action: 'assertText', selector: '#status', value: before },
      ],
    };
    const calls = [];
    let repaired = false;
    const base = qualityResponder(adaptivePlan(), fixtureBundle(), {
      onBuild: async (r, part) => {
        if (r.purpose.startsWith('repair:')) {
          await new Promise((resolve) => setTimeout(resolve, 2));
          repaired = true;
          part.files[0].content += '<!-- Corrected storage message -->';
        }
        return part;
      },
      onReview: (_r, review) => {
        if (!m.verificationRecovery?.history.length) {
          review.checks[0].status = 'unverified';
          review.checks[0].evidence = 'Missing storage fault scenario.';
        } else if (!repaired) {
          review.checks[0].status = 'failed';
          review.checks[0].evidence =
            'The storage message claims certainty after a read-back error.';
        }
        return review;
      },
    });
    const runner = new Runner(store, 'http://127.0.0.1:9999', {
      generate: (r) => {
        calls.push(r.purpose);
        if (r.purpose !== 'verification-recovery') return base(r);
        return Promise.resolve({
          summary: 'Synthetic storage evidence recovery.',
          calculationChecks: [],
          replacements: [],
          unavailable: [],
          webTests: repaired ? [] : [supplemental],
          webReplacements: repaired
            ? [
                {
                  name: supplemental.name,
                  reason:
                    'The old assertion requires the message rejected by independent review.',
                  assertions: [{ step: 1, value: after }],
                },
              ]
            : [],
        });
      },
      verify: async ({ tests }) => {
        const results = tests.map((t) => ({
          name: t.name,
          passed:
            t.name !== supplemental.name ||
            t.steps[1].value === (repaired ? after : before),
          detail:
            'Synthetic message oracle; browser action execution is covered separately.',
        }));
        return {
          passed: results.every((r) => r.passed),
          results,
          screenshot: false,
        };
      },
    });
    await runner.start(m.id);
    await settle(runner);
    assert.equal(m.status, 'completed', m.error);
    assert.equal(m.repairs, 1);
    assert.equal(calls.filter((p) => p.startsWith('repair:')).length, 1);
    assert.equal(m.verificationRecovery.rounds, 2);
    assert.deepEqual(m.originalTests, fixtureBundle().tests);
    assert.equal(m.verificationRecovery.webTests[0].steps[1].value, after);
    assert.ok(m.bundle.files[0].content.includes('Corrected storage message'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
