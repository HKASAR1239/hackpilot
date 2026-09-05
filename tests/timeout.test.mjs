import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../engine/store.mjs';
import { Runner } from '../engine/runner.mjs';
import { fixturePlan } from '../engine/fixture.mjs';
import { EXECUTION_LIMIT_MS } from '../lib/execution-limits.mjs';

test('a resumed step survives the old deadlines and stops at the two-hour attempt limit', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-deadline-'));
  const store = new Store(dir);
  await store.init();
  const mission = await store.create({
    brief: 'Resume the saved store-experience case.',
    url: '',
    hours: 1,
    provider: 'codex',
    locale: 'fr',
  });
  mission.plan = { ...fixturePlan(), selectedId: 'collecte' };
  mission.sources = [
    { id: 'S1', title: 'Assignment', text: mission.input.brief },
  ];
  mission.usage.calls = 2;
  await store.save(mission);
  let started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  let stepSignal;
  const runner = new Runner(store, 'http://127.0.0.1:9999', {
    generate: ({ signal }) =>
      new Promise((_, reject) => {
        stepSignal = signal;
        started();
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await runner.start(mission.id);
    await entered;
    assert.equal(
      mission.usage.calls,
      3,
      'resume retains usage and skips the saved planning step',
    );
    t.mock.timers.tick(16 * 60 * 1000);
    assert.equal(
      stepSignal.aborted,
      false,
      'old five- and fifteen-minute limits no longer stop the run',
    );
    assert.equal(mission.status, 'running');
    t.mock.timers.tick(EXECUTION_LIMIT_MS - 16 * 60 * 1000);
    assert.equal(stepSignal.aborted, true);
    const deadline = Date.now() + 5000;
    while (runner.running.size) {
      if (Date.now() > deadline)
        throw new Error('Timed-out run did not finish saving');
      await new Promise(setImmediate);
    }
    assert.equal(mission.error, 'Limite de 2 heures atteinte.');
    assert.equal(mission.status, 'cancelled');
    assert.ok(mission.plan);
    assert.equal(mission.usage.calls, 3);
  } finally {
    t.mock.timers.reset();
    runner.cancel(mission.id);
    await rm(dir, { recursive: true, force: true });
  }
});
