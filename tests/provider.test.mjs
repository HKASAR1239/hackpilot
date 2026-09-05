import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('the Codex process receives xhigh by default and an explicit high override', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hp-provider-'));
  const binary = join(dir, 'codex-stub.mjs');
  const prior = process.env.HACKPILOT_CODEX_BIN;
  await writeFile(
    binary,
    `#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
const args = process.argv.slice(2);
await writeFile('arguments.json', JSON.stringify(args));
for await (const chunk of process.stdin) { /* Consume the complete prompt. */ }
await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify({ ok: true }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 1 } }));
`,
    { mode: 0o700 },
  );
  process.env.HACKPILOT_CODEX_BIN = binary;
  try {
    const { generate, generationSettings } =
      await import('../engine/provider.mjs');
    for (const env of [
      {},
      { HACKPILOT_MODEL: 'gpt-6-astra', HACKPILOT_REASONING_EFFORT: 'high' },
    ]) {
      const configuration = generationSettings(env);
      let usage;
      const result = await generate({
        prompt: 'A local transport test.',
        schema: {},
        dir,
        configuration,
        onUsage: (value) => {
          usage = value;
        },
      });
      const args = JSON.parse(
        await readFile(join(dir, 'arguments.json'), 'utf8'),
      );
      assert.deepEqual(result, { ok: true });
      assert.deepEqual(usage, { input_tokens: 3, output_tokens: 1 });
      assert.ok(
        args.includes(
          `model_reasoning_effort="${env.HACKPILOT_REASONING_EFFORT || 'xhigh'}"`,
        ),
      );
      if (env.HACKPILOT_MODEL)
        assert.equal(args[args.indexOf('--model') + 1], 'gpt-6-astra');
      else
        assert.equal(
          args.includes('--model'),
          false,
          'inherit the configured Codex model',
        );
      assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    }
    assert.throws(
      () => generationSettings({ HACKPILOT_REASONING_EFFORT: 'xhgih' }),
      /HACKPILOT_REASONING_EFFORT/,
    );
  } finally {
    if (prior === undefined) delete process.env.HACKPILOT_CODEX_BIN;
    else process.env.HACKPILOT_CODEX_BIN = prior;
    await rm(dir, { recursive: true, force: true });
  }
});
