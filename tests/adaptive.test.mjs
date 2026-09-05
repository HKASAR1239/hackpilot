import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../engine/store.mjs';
import { Runner } from '../engine/runner.mjs';
import { normalizePlan } from '../engine/schema.mjs';
import {
  freezeRubric,
  assertRubric,
  applySelection,
  juryPrompt,
  validateJury,
} from '../engine/rubric.mjs';
import {
  createSchedule,
  beginAttempt,
  callTimeBudget,
  optionalWorkFits,
  reviseDeadline,
} from '../engine/schedule.mjs';
import {
  addContribution,
  contributionReviewInput,
  contributionPrompt,
  validateContributionDecision,
  trialComparisonInput,
  trialComparisonPrompt,
} from '../engine/contributions.mjs';
import {
  adaptiveBrief,
  adaptivePlan,
  extractedRubric,
  adaptiveResponder,
} from './adaptive-fixture.mjs';

const sources = [{ id: 'S1', title: 'Assignment', text: adaptiveBrief }];
const input = {
  brief: adaptiveBrief,
  url: '',
  provider: 'codex',
  hours: 2,
  locale: 'en',
  workflowVersion: 2,
};
const checks = {
  passed: true,
  results: [
    {
      name: 'Controlled workflow oracle',
      passed: true,
      detail: 'Synthetic verifier; separate browser tests cover the actual UI.',
    },
  ],
};
async function done(runner) {
  const deadline = Date.now() + 10000;
  while (runner.running.size) {
    if (Date.now() > deadline)
      throw new Error('Runner did not reach a checkpoint.');
    await new Promise((r) => setTimeout(r, 10));
  }
}
async function harness(fn, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hp-adaptive-'));
  const store = new Store(root);
  await store.init();
  const runner = new Runner(store, 'http://127.0.0.1:9999', {
    generate: adaptiveResponder(),
    verify: async () => checks,
    ...options,
  });
  try {
    await fn(store, runner);
  } finally {
    for (const id of runner.running.keys()) runner.cancel(id);
    await done(runner);
    await rm(root, { recursive: true, force: true });
  }
}

test('official rubric preserves all cited criteria, rejects invented weights and detects mutation', () => {
  const rubric = freezeRubric(extractedRubric, sources);
  assert.equal(rubric.mode, 'official');
  const underscored = structuredClone(extractedRubric);
  underscored.criteria[0].id = 'visitor_experience';
  assert.equal(
    freezeRubric(underscored, sources).criteria[0].id,
    'visitor_experience',
  );
  assert.deepEqual(
    rubric.criteria.map((c) => c.weight),
    [70, 30],
  );
  const invalid = structuredClone(extractedRubric);
  invalid.criteria[0].weight = 90;
  assert.throws(() => freezeRubric(invalid, sources), /weight/);
  invalid.criteria[0] = {
    ...extractedRubric.criteria[0],
    quote: 'A made up criterion.',
  };
  assert.throws(() => freezeRubric(invalid, sources), /Unsupported/);
  rubric.criteria[0].label = 'An easier criterion';
  assert.throws(() => assertRubric(rubric), /changed/);
  const fallback = freezeRubric(
    { criteria: [], uncertainties: ['No official grid supplied.'] },
    sources,
  );
  assert.equal(fallback.mode, 'internal');
  assert.ok(
    fallback.criteria.every(
      (c) => c.weight === null && c.origin === 'internal',
    ),
  );
  const short = freezeRubric(
    {
      criteria: [
        {
          id: 'impact',
          label: 'Impact',
          sourceId: 'S2',
          quote: 'Impact',
          weight: null,
          weightQuote: '',
        },
      ],
      uncertainties: [],
    },
    [{ id: 'S2', text: 'Judging criteria: Impact, Usability.' }],
  );
  assert.equal(
    short.criteria[0].label,
    'Impact',
    'A real short criterion is not rejected for being shorter than an arbitrary quote length.',
  );
});

test('selection follows official weights and rejects omitted criteria instead of using fixed idea scores', () => {
  const m = {
    rubric: freezeRubric(extractedRubric, sources),
    plan: normalizePlan(adaptivePlan(), sources),
  };
  const options = m.plan.ideas.map((i) => ({
    ideaId: i.id,
    feasible: true,
    risk: 'No integration is available.',
    ratings: [
      {
        criterionId: 'usefulness',
        score: i.id === 'carte' ? 5 : 2,
        evidence: 'Concrete usefulness estimate.',
      },
      {
        criterionId: 'presentation',
        score: i.id === 'carte' ? 1 : 5,
        evidence: 'Concrete presentation estimate.',
      },
    ],
  }));
  applySelection({ options }, m);
  assert.equal(m.plan.selectedId, 'carte');
  assert.equal(
    m.selection.options.find((o) => o.ideaId === 'carte').score,
    3.8,
  );
  assert.equal(m.selection.options[0].method, 'official-weights-estimate');
  options[0].ratings.pop();
  assert.throws(() => applySelection({ options }, m), /every|Every/);
});

test('deadline survives resume and restart; short calls preserve a verification reserve', async () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  const m = {
    schedule: createSchedule({ hours: 0.5 }, now),
    usage: { calls: 0 },
  };
  assert.equal(beginAttempt(m, now).durationMs, 30 * 60000);
  assert.equal(beginAttempt(m, now + 20 * 60000).durationMs, 10 * 60000);
  assert.equal(m.schedule.startedAt, new Date(now).toISOString());
  assert.throws(() => beginAttempt(m, now + 30 * 60000), /deadline/);
  assert.ok(callTimeBudget(m, 'planning', now + 20 * 60000) < 2 * 60000);
  assert.equal(optionalWorkFits(m, 8, 1, now + 20 * 60000), false);
  const long = { schedule: createSchedule({ hours: 504 }, now) };
  assert.equal(beginAttempt(long, now).durationMs, 120 * 60000);
  assert.equal(beginAttempt(long, now).deadline, false);
  reviseDeadline(m, new Date(now + 60 * 60000).toISOString(), now);
  assert.equal(m.schedule.deadlineChanges.length, 1);
  assert.throws(
    () => createSchedule({ hours: 0.5, callBudget: 999 }, now),
    /budget/,
  );
  await harness(async (store) => {
    const project = await store.create(input);
    const original = project.schedule.deadlineAt;
    project.status = 'running';
    await store.save(project);
    const restarted = new Store(store.root);
    await restarted.init();
    assert.equal(restarted.get(project.id).schedule.deadlineAt, original);
    assert.equal(restarted.get(project.id).status, 'interrupted');
  });
});

test('jury is blind to the producer rationale and requires actual paths and exhaustive evidence', async () => {
  await harness(async (store, runner) => {
    const m = await store.create(input);
    await runner.start(m.id);
    await done(runner);
    assert.equal(m.status, 'completed', m.error);
    m.design.recommendation = 'SECRET_PRODUCER_ARGUMENT';
    m.plan.ideas[0].reason = 'SECRET_PRODUCER_SCORE';
    m.review.summary = 'SECRET_PREVIOUS_REVIEW';
    const prompt = juryPrompt(m, 'anglais');
    assert.doesNotMatch(prompt, /SECRET_/);
    assert.equal(m.jury.checks.length, 2);
    const invalid = structuredClone(m.jury);
    invalid.checks[0].evidence[0].path = 'nonexistent.pdf';
    assert.throws(() => validateJury(invalid, m), /unavailable/);
    invalid.checks.pop();
    assert.throws(() => validateJury(invalid, m), /every|Every/);
    assert.ok(m.lastVerified.complete);
    assert.equal(
      m.lastVerified.jury?.checks.length,
      2,
      'The saved version carries its own final jury assessment.',
    );
  });
});

test('contributions are idempotent, persisted during a run and anonymous to the evaluator', async () => {
  let project, captured;
  await harness(
    async (store, runner) => {
      project = await store.create(input);
      await runner.start(project.id);
      await done(runner);
      assert.equal(project.status, 'completed', project.error);
      assert.equal(project.contributions.length, 1);
      assert.equal(project.contributions[0].status, 'rejected');
      assert.doesNotMatch(captured, /SECRET_AUTHOR/);
      const recovered = JSON.parse(
        await readFile(join(store.dir(project.id), 'mission.json'), 'utf8'),
      );
      assert.equal(
        recovered.contributions[0].text,
        'Improve the help text in the form.',
      );
    },
    {
      generate: adaptiveResponder({
        onCall: (request) => {
          if (request.purpose === 'build:prototype') {
            const data = {
              requestId: randomUUID(),
              kind: 'idea',
              text: 'Improve the help text in the form.',
              author: 'SECRET_AUTHOR',
            };
            const first = addContribution(project, data);
            assert.equal(addContribution(project, data).id, first.id);
            assert.throws(
              () =>
                addContribution(project, {
                  ...data,
                  text: 'Different content',
                }),
              /different/,
            );
          }
          if (request.purpose === 'contribution') captured = request.prompt;
        },
      }),
    },
  );
});

test('new contributions to a completed project are assessed on resume without rebuilding checked work', async () => {
  let builds = 0;
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      await runner.start(m.id);
      await done(runner);
      const deadline = m.schedule.deadlineAt;
      addContribution(m, {
        requestId: randomUUID(),
        kind: 'idea',
        text: 'Consider different labels for the form.',
      });
      await store.save(m);
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'completed', m.error);
      assert.equal(m.schedule.deadlineAt, deadline);
      assert.equal(builds, 1);
      assert.equal(m.contributions[0].status, 'rejected');
    },
    {
      generate: adaptiveResponder({
        onBuild: (_, part) => {
          builds++;
          return part;
        },
      }),
    },
  );
});

for (const outcome of ['candidate', 'tie', 'broken'])
  test(
    'contribution trial ' +
      outcome +
      ' preserves or promotes checked files correctly',
    async () => {
      let m;
      await harness(
        async (store, runner) => {
          m = await store.create(input);
          addContribution(m, {
            requestId: randomUUID(),
            kind: 'idea',
            text: 'Improve the help text in the form.',
          });
          await store.save(m);
          await runner.start(m.id);
          await done(runner);
          assert.equal(m.status, 'completed', m.error);
          assert.equal(m.trial, undefined);
          const actual = await readFile(
            join(store.dir(m.id), 'project', 'index.html'),
            'utf8',
          );
          const verified = await readFile(
            join(
              store.dir(m.id),
              'versions',
              m.lastVerified.id,
              'files',
              'index.html',
            ),
            'utf8',
          );
          if (outcome === 'candidate') {
            assert.equal(m.contributions[0].status, 'integrated');
            assert.match(actual, /Improved help text/);
            assert.match(verified, /Improved help text/);
          } else {
            assert.equal(m.contributions[0].status, 'deferred');
            assert.doesNotMatch(actual, /Improved help text/);
            assert.equal(actual, verified);
          }
        },
        {
          generate: adaptiveResponder({
            contribution: 'trial',
            compare: outcome,
            onBuild: (request, part) => {
              if (request.purpose.startsWith('repair:')) {
                if (outcome === 'broken')
                  throw new Error('Synthetic candidate generation failure');
                part.files[0].content = part.files[0].content.replace(
                  '</main>',
                  '<p>Improved help text</p></main>',
                );
              }
              return part;
            },
          }),
        },
      );
    },
  );

test('contribution comparison uses the same rubric for both positions and rejects unsupported acceptance', () => {
  const m = {
    rubric: freezeRubric(extractedRubric, sources),
    plan: adaptivePlan(),
    sources,
    bundle: {},
    tests: {},
  };
  const c = {
    kind: 'idea',
    text: 'A concrete alternative',
    author: 'SECRET_AUTHOR',
  };
  const a = contributionReviewInput(m, c, false);
  const b = contributionReviewInput(m, c, true);
  assert.deepEqual(a.options.A, b.options.B);
  assert.doesNotMatch(contributionPrompt(m, a, 'anglais'), /SECRET_AUTHOR/);
  assert.throws(
    () => validateContributionDecision({ checks: [] }, m, a),
    /every/,
  );
  const paired = trialComparisonInput(
    { text: 'Old version' },
    { text: 'New version' },
    true,
  );
  assert.equal(paired.candidate, 'A');
  const prompt = trialComparisonPrompt(m, paired, 'anglais');
  assert.ok(prompt.includes('Old version') && prompt.includes('New version'));
});

test('a deadline aborts an active step, preserves the original deadline and rejects implicit extension', async (t) => {
  let entered;
  const ready = new Promise((resolve) => {
    entered = resolve;
  });
  let signal;
  const now = Date.parse('2026-09-05T12:00:00Z');
  let clock = now;
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      m.schedule = createSchedule({ hours: 0.5 }, now);
      t.mock.timers.enable({ apis: ['setTimeout'] });
      try {
        await runner.start(m.id);
        await ready;
        clock += 30 * 60000;
        t.mock.timers.tick(30 * 60000);
        assert.equal(signal.aborted, true);
        while (runner.running.size) await new Promise(setImmediate);
        assert.equal(m.status, 'expired');
        await assert.rejects(runner.start(m.id), /deadline/);
        assert.equal(m.schedule.deadlineAt, new Date(clock).toISOString());
      } finally {
        t.mock.timers.reset();
      }
    },
    {
      now: () => clock,
      generate: (r) => {
        signal = r.signal;
        entered();
        return new Promise((_, reject) =>
          r.signal.addEventListener('abort', () => reject(r.signal.reason), {
            once: true,
          }),
        );
      },
    },
  );
});

test('cancellation during a trial restores original files and queues the contribution without resetting usage', async () => {
  let trialStarted;
  const ready = new Promise((resolve) => {
    trialStarted = resolve;
  });
  let blockTrial = true;
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      addContribution(m, {
        requestId: randomUUID(),
        kind: 'idea',
        text: 'A proposal whose trial is interrupted.',
      });
      await runner.start(m.id);
      await ready;
      const version = m.lastVerified.id;
      const calls = m.usage.calls;
      runner.cancel(m.id);
      await done(runner);
      assert.equal(m.status, 'cancelled');
      assert.equal(m.trial, undefined);
      assert.equal(m.lastVerified.id, version);
      assert.equal(m.contributions[0].status, 'queued');
      assert.equal(m.usage.calls, calls);
      const actual = await readFile(
        join(store.dir(m.id), 'project', 'index.html'),
        'utf8',
      );
      const original = await readFile(
        join(store.dir(m.id), 'versions', version, 'files', 'index.html'),
        'utf8',
      );
      assert.equal(actual, original);
      const restarted = new Store(store.root);
      await restarted.init();
      assert.equal(
        restarted.get(m.id).schedule.deadlineAt,
        m.schedule.deadlineAt,
      );
      blockTrial = false;
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'completed', m.error);
      assert.ok(m.usage.calls > calls);
    },
    {
      generate: adaptiveResponder({
        contribution: 'trial',
        compare: 'tie',
        onCall: (r) => {
          if (blockTrial && r.purpose.startsWith('repair:')) {
            trialStarted();
            return new Promise((_, reject) =>
              r.signal.addEventListener(
                'abort',
                () => reject(r.signal.reason),
                { once: true },
              ),
            );
          }
        },
      }),
    },
  );
});

test('optional contributions are deferred without spending calls when the time reserve would be consumed', async () => {
  await harness(async (store, runner) => {
    const m = await store.create(input);
    await runner.start(m.id);
    await done(runner);
    addContribution(m, {
      requestId: randomUUID(),
      kind: 'idea',
      text: 'An optional late change.',
    });
    m.schedule.milestoneAt = new Date(Date.now() + 2 * 60000).toISOString();
    const calls = m.usage.calls;
    await runner.processContributions(
      m,
      'anglais',
      new AbortController().signal,
    );
    assert.equal(m.usage.calls, calls);
    assert.equal(m.contributions[0].status, 'deferred');
    assert.ok(m.lastVerified.complete);
  });
});

test('short projects use high effort and give the reference more time while preserving the xhigh single-prompt baseline', async () => {
  const seen = [];
  await harness(
    async (store, runner) => {
      const m = await store.create({ ...input, hours: 0.5 });
      m.generationSettings = {
        model: null,
        reasoningEffort: 'xhigh',
        productionEffort: 'high',
      };
      beginAttempt(m);
      const firstBudget = callTimeBudget(m, 'design');
      assert.ok(
        firstBudget >= 7 * 60000 && firstBudget < 12 * 60000,
        'The reference can finish without taking the entire short deadline.',
      );
      const controller = new AbortController();
      await runner.call(
        m,
        'synthetic request',
        {},
        controller.signal,
        'design',
      );
      await runner.call(
        m,
        'synthetic baseline',
        {},
        controller.signal,
        'one-prompt-baseline',
      );
      assert.equal(seen[0].configuration.reasoningEffort, 'high');
      assert.equal(seen[1].configuration.reasoningEffort, 'xhigh');
      assert.ok(seen[1].timeoutMs > seen[0].timeoutMs);
    },
    {
      generate: async (request) => {
        seen.push(request);
        return {};
      },
    },
  );
});
