import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../engine/server.mjs';
import { adaptiveBrief } from './adaptive-fixture.mjs';

test('API accepts a 30-minute deadline, queues input during a call and preserves it across an explicit deadline change', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hp-adaptive-api-'));
  const app = await createApp({
    dataDir: root,
    port: 0,
    previewPort: 0,
    runnerOptions: {
      generate: ({ signal }) =>
        new Promise((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            });
        }),
    },
  });
  const post = (path, body) =>
    fetch(`http://127.0.0.1:${app.port}/api` + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const created = await post('/missions', {
      brief: adaptiveBrief,
      url: '',
      provider: 'codex',
      locale: 'en',
      hours: 0.5,
      callBudget: 12,
    });
    assert.equal(created.status, 201);
    const response = await created.json();
    const m = app.store.get(response.id);
    assert.equal(m.workflowVersion, 2);
    assert.equal(m.schedule.callBudget, 12);
    assert.ok(Date.parse(m.schedule.deadlineAt) <= Date.now() + 30 * 60000);
    const base = '/missions/' + m.id;
    const input = {
      requestId: randomUUID(),
      kind: 'evidence',
      text: 'A teammate observed that the empty state was confusing.',
    };
    assert.equal((await post(base + '/contributions', input)).status, 201);
    assert.equal((await post(base + '/contributions', input)).status, 201);
    assert.equal(m.contributions.length, 1);
    const next = new Date(Date.now() + 4 * 3600000).toISOString();
    assert.equal(
      (await post(base + '/schedule', { deadlineAt: next })).status,
      409,
      'An active timer cannot silently be bypassed.',
    );
    assert.equal(
      (await post(base + '/budget', { inputTokens: 900000 })).status,
      409,
    );
    assert.equal((await post(base + '/cancel', {})).status, 200);
    while (app.runner.running.size) await new Promise((r) => setTimeout(r, 10));
    const usageBefore = structuredClone(m.usage);
    assert.equal(
      (
        await post(base + '/budget', {
          inputTokens: 900000,
          reason: 'Resume with a larger explicit budget.',
        })
      ).status,
      200,
    );
    assert.deepEqual(m.usage, usageBefore);
    assert.equal(m.generationBudget.inputTokens, 900000);
    assert.equal(m.budgetChanges.length, 1);
    assert.equal(
      (await post(base + '/budget', { inputTokens: -2 })).status,
      400,
    );
    m.status = 'expired';
    assert.equal(
      (await post(base + '/schedule', { deadlineAt: next })).status,
      200,
    );
    assert.equal(
      m.status,
      'paused',
      'An explicitly extended project is resumable.',
    );
    assert.equal(m.schedule.deadlineAt, next);
    assert.equal(m.schedule.deadlineChanges.length, 1);
    assert.equal(m.contributions[0].status, 'queued');
    assert.equal(
      (
        await post(base + '/contributions', {
          ...input,
          requestId: randomUUID(),
          kind: 'invalid',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post('/missions', {
          brief: adaptiveBrief,
          url: '',
          provider: 'codex',
          hours: 0.1,
        })
      ).status,
      400,
    );
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
