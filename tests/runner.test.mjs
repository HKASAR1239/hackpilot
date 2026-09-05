import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../engine/store.mjs';
import { Runner } from '../engine/runner.mjs';
import { fixturePlan, fixtureBundle } from '../engine/fixture.mjs';
async function harness(fn, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'hp-runner-'));
  const store = new Store(dir);
  await store.init();
  const runner = new Runner(store, 'http://127.0.0.1:9999', options);
  try {
    await fn(store, runner);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
async function done(runner) {
  const start = Date.now();
  while (runner.running.size) {
    if (Date.now() - start > 5000) throw new Error('Test timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
}
const input = {
  brief: 'Un brief assez long pour tester la construction automatique.',
  url: '',
  hours: 24,
  provider: 'codex',
};
const passed = {
  passed: true,
  screenshot: false,
  results: [{ name: 'parcours', passed: true, detail: 'ok' }],
};
test('corrige un échec réel puis conserve les scénarios d’origine', async () => {
  let calls = 0,
    checks = 0;
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'completed');
      assert.equal(m.repairs, 1);
      assert.equal(checks, 2);
      assert.equal(
        m.originalTests[0].name,
        'Publier un don et le retrouver après rechargement',
      );
      assert.match(m.submission, /PASS/);
    },
    {
      generate: async () => {
        calls++;
        return calls === 1
          ? fixturePlan()
          : calls === 2 || calls === 3
            ? fixtureBundle()
            : { summary: 'Relu', gaps: [], mustFix: [] };
      },
      verify: async () =>
        ++checks === 1
          ? {
              passed: false,
              results: [
                { name: 'parcours', passed: false, detail: 'bouton manquant' },
              ],
            }
          : passed,
    },
  );
});
test('un fournisseur en erreur ne déclenche jamais le mode démonstration', async () => {
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'failed');
      assert.equal(m.provider, 'codex');
      assert.equal(m.files.length, 0);
      assert.match(m.error, /indisponible/);
    },
    {
      generate: async () => {
        throw new Error('Fournisseur indisponible');
      },
    },
  );
});
test('un échec persistant termine après deux corrections sans fausse réussite', async () => {
  let calls = 0;
  await harness(
    async (store, runner) => {
      const m = await store.create(input);
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'failed');
      assert.equal(m.repairs, 2);
      assert.equal(m.submission, undefined);
    },
    {
      generate: async () => (++calls === 1 ? fixturePlan() : fixtureBundle()),
      verify: async () => ({
        passed: false,
        results: [{ name: 'parcours', passed: false, detail: 'erreur' }],
      }),
    },
  );
});
test('annulation et exclusion de deux exécutions concurrentes', async () => {
  await harness(
    async (store, runner) => {
      const a = await store.create(input);
      await runner.start(a.id);
      const b = await store.create(input);
      await assert.rejects(runner.start(b.id), /déjà/);
      runner.cancel(a.id);
      await done(runner);
      assert.equal(a.status, 'cancelled');
    },
    {
      generate: ({ signal }) =>
        new Promise((resolve, reject) => {
          if (signal.aborted) reject(new Error('Arrêt'));
          else
            signal.addEventListener('abort', () => reject(new Error('Arrêt')), {
              once: true,
            });
        }),
    },
  );
});

test('transmet les slides et la langue anglaise au générateur et au dossier', async () => {
  const prompts = [];
  await harness(
    async (store, runner) => {
      const m = await store.create({
        ...input,
        brief: '',
        locale: 'en',
        documents: [
          {
            id: 'document-test',
            name: 'rules.pdf',
            sha256: 'sample',
            format: 'pdf',
            createdAt: new Date().toISOString(),
            warnings: [],
            pages: [
              {
                number: 1,
                method: 'text',
                text: 'The hackathon requires a useful working application and a three minute demo.',
              },
            ],
          },
        ],
      });
      await runner.start(m.id);
      await done(runner);
      assert.equal(m.status, 'completed');
      assert.match(prompts[0], /Réponds en anglais/);
      assert.match(prompts[0], /rules.pdf/);
      assert.match(prompts[0], /three minute demo/);
      assert.match(prompts[1], /livrables retenus en anglais/);
      assert.match(prompts[2], /livrables en anglais/);
      assert.match(m.submission, /## Known limitations/);
      assert.equal(m.sources[0].page, 1);
    },
    {
      generate: async ({ prompt }) => {
        prompts.push(prompt);
        return prompts.length === 1
          ? fixturePlan()
          : prompts.length === 2
            ? fixtureBundle()
            : { summary: 'Reviewed', gaps: [], mustFix: [] };
      },
      verify: async () => passed,
    },
  );
});
