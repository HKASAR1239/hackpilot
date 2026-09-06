import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
test('transport retains safe error evidence, complete large events and bounded termination', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-telemetry-'));
  const binary = join(dir, 'codex-stub.mjs');
  const prior = process.env.HACKPILOT_CODEX_BIN;
  await writeFile(
    binary,
    `#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { once } from 'node:events';
let prompt = ''; for await (const c of process.stdin) prompt += c;
const emit = async (value) => { const text = JSON.stringify(value) + '\\n'; for (let i = 0; i < text.length; i += 32001) if (!process.stdout.write(text.slice(i, i + 32001))) await once(process.stdout, 'drain'); };
if (!prompt.includes('first-event-test')) await emit({ type: 'thread.started', thread_id: 'synthetic-session' });
if (prompt.includes('connection-test')) {
  process.stderr.write('WARN stream disconnected - retrying: idle timeout waiting for websocket\\n');
  setInterval(() => {}, 1000);
} else if (prompt.includes('failed-turn-test')) {
  await emit({type:'turn.failed', error:{message:'stream disconnected before completion'}});
  const args=process.argv.slice(2);
  await writeFile(args[args.indexOf('--output-last-message')+1], '{"ok":true}');
} else if (prompt.includes('first-event-test')) {
  process.stderr.write('warning: synthetic startup warning\\n');
  await new Promise((resolve) => setTimeout(resolve, 150));
  await emit({ type: 'thread.started', thread_id: 'synthetic-session' });
  setInterval(() => {}, 1000);
} else if (prompt.includes('cancel-test')) {
  process.stderr.write('warning: api_key=sk-abcdefghijklmn retry exhausted\\n');
  await emit({ type: 'error', message: 'retry failed Bearer verysecret https://user:pass@example.org/api?token=private' });
  await emit({ type: 'turn.completed', usage: { input_tokens: 5, output_tokens: 2 } });
  setInterval(() => {}, 1000);
} else if (prompt.includes('timeout-test')) {
  process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);
} else {
  await emit({ type: 'item.completed', item: { type: 'reasoning', text: 'PRIVATE_CONTENT_' + 'é'.repeat(250000) } });
  await emit({ type: 'turn.completed', usage: { input_tokens: 17, output_tokens: 3 } });
  const args = process.argv.slice(2); await writeFile(args[args.indexOf('--output-last-message') + 1], '{"ok":true}');
}
`,
    { mode: 0o700 },
  );
  process.env.HACKPILOT_CODEX_BIN = binary;
  try {
    const { generate } = await import('../engine/provider.mjs');
    const diagnostics = async () =>
      Promise.all(
        (await readdir(dir))
          .filter(
            (f) => /^call-.*\.json$/.test(f) && !/-schema|-response/.test(f),
          )
          .map(async (f) => JSON.parse(await readFile(join(dir, f), 'utf8'))),
      );
    await t.test(
      'a failed turn is rejected even with exit zero and an output file',
      async () => {
        await assert.rejects(
          generate({ prompt: 'failed-turn-test', schema: {}, dir }),
          /connexion au modèle/,
        );
      },
    );
    await t.test(
      'transport reconnects are surfaced live and explain the eventual timeout',
      async () => {
        const snapshots = [];
        await assert.rejects(
          generate({
            prompt: 'connection-test',
            schema: {},
            dir,
            timeoutMs: 1500,
            onTelemetry: (r) => snapshots.push(r),
          }),
          /connexion au modèle/,
        );
        assert.ok(
          snapshots.some(
            (r) => r.status === 'running' && r.connectionStatus === 'retrying',
          ),
        );
        assert.equal(snapshots.at(-1).status, 'failed');
        assert.equal(snapshots.at(-1).transport, 'http');
      },
    );
    await t.test(
      'cancellation retains the provider error and redacts credentials',
      async () => {
        const controller = new AbortController();
        await assert.rejects(
          generate({
            prompt: 'cancel-test',
            schema: {},
            dir,
            signal: controller.signal,
            onUsage: () => controller.abort(new Error('Stopped by test.')),
          }),
          /Stopped by test/,
        );
        const report = (await diagnostics()).find(
          (r) => r.status === 'cancelled',
        );
        assert.equal(report.providerSessionId, 'synthetic-session');
        assert.match(report.errors.join(' '), /retry failed/);
        assert.match(report.stderrTail, /\[redacted\]/);
        assert.doesNotMatch(
          JSON.stringify(report),
          /verysecret|abcdefghijklmn|user:pass|token=private/,
        );
        assert.ok(report.endedAt);
        assert.ok(report.durationMs >= 0);
      },
    );
    await t.test(
      'large fragmented events preserve subsequent usage without storing item bodies',
      async () => {
        let usage;
        const snapshots = [];
        assert.deepEqual(
          await generate({
            prompt: 'large-event',
            schema: {},
            dir,
            onTelemetry: (entry) => snapshots.push(entry),
            onUsage: (u) => (usage = u),
          }),
          { ok: true },
        );
        assert.deepEqual(usage, { input_tokens: 17, output_tokens: 3 });
        const report = (await diagnostics()).find(
          (r) => r.status === 'completed',
        );
        assert.equal(report.eventCounts['item.completed'], 1);
        assert.ok(
          snapshots.some(
            (r) =>
              r.status === 'running' &&
              r.providerSessionId === 'synthetic-session',
          ),
          'first provider event is persisted before completion',
        );
        assert.ok(report.stdoutBytes > 500000);
        assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CONTENT/);
      },
    );
    await t.test(
      'a startup warning does not hide the following event until completion',
      async () => {
        const controller = new AbortController();
        await assert.rejects(
          generate({
            prompt: 'first-event-test',
            schema: {},
            dir,
            timeoutMs: 4000,
            signal: controller.signal,
            onTelemetry: (entry) => {
              if (entry.status === 'running' && entry.providerSessionId)
                controller.abort(new Error('Observed live event.'));
            },
          }),
          /Observed live event/,
        );
      },
    );
    await t.test(
      'call timeout terminates even a child that ignores SIGTERM',
      async () => {
        await assert.rejects(
          generate({ prompt: 'timeout-test', schema: {}, dir, timeoutMs: 300 }),
          /temps alloué.*1 s/,
        );
        const report = (await diagnostics()).find((r) => r.timeoutMs === 300);
        assert.match(report.stopReason, /1 s/);
        assert.equal(report.timeoutMs, 300);
        assert.throws(() => process.kill(report.pid, 0), { code: 'ESRCH' });
      },
    );
  } finally {
    if (prior === undefined) delete process.env.HACKPILOT_CODEX_BIN;
    else process.env.HACKPILOT_CODEX_BIN = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
