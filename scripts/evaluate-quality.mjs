import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomInt } from 'node:crypto';
import { createApp } from '../engine/server.mjs';
import { generationSettings } from '../engine/provider.mjs';
import { generationPrompt } from '../engine/prompts.mjs';
import { adaptiveBuildSchema, normalizePlan } from '../engine/schema.mjs';
import { calculateRows } from '../engine/calculations.mjs';
import { verify } from '../engine/verifier.mjs';
import { evaluationCases } from '../tests/evaluation/cases.mjs';

const args = process.argv.slice(2);
if (!args.includes('--live')) {
  console.log(
    'Opt-in real model comparison: npm run eval:quality -- --live [--case shuttle|museum|equipment] [--out directory]. Uses your Codex account. Both arms receive the same fixed plan and source text; the pipeline uses more calls.',
  );
} else {
  const option = (name) =>
    args.includes(name) ? args[args.indexOf(name) + 1] : null;
  const selected = evaluationCases.filter(
    (c) => !option('--case') || c.id === option('--case'),
  );
  if (!selected.length) throw new Error('Unknown evaluation case.');
  const out = resolve(
    option('--out') ||
      join(
        'validation',
        'quality-' + new Date().toISOString().replace(/[:.]/g, '-'),
      ),
  );
  await mkdir(out, { recursive: true });
  const app = await createApp({
    dataDir: join(out, 'missions'),
    port: 0,
    previewPort: 0,
  });
  const report = {
    at: new Date().toISOString(),
    configuration: generationSettings(),
    scope:
      'Post-planning comparison; both arms receive the same fixed plan and brief. Baseline: one strong prompt with all outputs and a self-check instruction, xhigh by default. Pipeline: shared reference, separate production at high, mechanical checks, review at xhigh, targeted repairs. Extra pipeline tokens and time are reported. Mechanical results alone do not establish better judgment or presentation quality.',
    cases: [],
  };
  const persist = () =>
    writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  try {
    for (const scenario of selected) {
      const comparison = { id: scenario.id, arms: {} };
      report.cases.push(comparison);
      const bundles = {};
      for (const arm of ['baseline', 'pipeline'].filter(
        (arm) => !option('--arm') || option('--arm') === arm,
      )) {
        const m = await app.store.create({
          brief: scenario.brief,
          locale: 'en',
          hours: 1,
          provider: 'codex',
          url: '',
        });
        m.sources = [
          { id: 'S1', title: 'Synthetic assignment', text: scenario.brief },
        ];
        m.plan = normalizePlan(structuredClone(scenario.plan), m.sources);
        m.generationSettings = generationSettings();
        await app.store.save(m);
        await mkdir(join(app.store.dir(m.id), 'generation'), {
          recursive: true,
        });
        const start = Date.now();
        console.log(
          JSON.stringify({
            case: scenario.id,
            arm,
            status: 'started',
            project: m.id,
          }),
        );
        let external = [];
        try {
          if (arm === 'baseline') {
            m.bundle = await app.runner.call(
              m,
              generationPrompt(
                m,
                m.plan.ideas.find((i) => i.id === m.plan.selectedId),
                'anglais',
              ) +
                '\nBefore returning, carefully compare feasible options, verify every calculation and constraint, distinguish assumptions from facts, check consistency between outputs, and revise any defects. Deliver final usable work. You have one response for the complete assignment.',
              adaptiveBuildSchema,
              new AbortController().signal,
              'one-prompt-baseline',
            );
            m.originalTests = m.bundle.tests;
            await app.runner.writeBundle(
              m,
              m.bundle,
              new AbortController().signal,
            );
            await app.runner.verifyComplete(m, new AbortController().signal);
            m.status = m.tests.passed ? 'completed' : 'failed';
            await app.store.save(m);
          } else {
            await app.runner.start(m.id);
            let last = '';
            while (app.runner.running.has(m.id)) {
              const activity = m.activity?.title || m.status;
              if (activity !== last) {
                last = activity;
                console.log(
                  JSON.stringify({ case: scenario.id, arm, activity }),
                );
              }
              await new Promise((r) => setTimeout(r, 1000));
            }
          }
          if (m.bundle && scenario.expectedRows) {
            const actual = (m.bundle.artifacts || []).flatMap((a) =>
              a.sheets.flatMap((s) => {
                const values = calculateRows(s.rows);
                return s.rows.map((r, i) => [
                  r.label.trim().toLowerCase(),
                  values[i],
                ]);
              }),
            );
            external = Object.entries(scenario.expectedRows).map(
              ([name, expected]) => ({
                name,
                expected,
                actual:
                  actual.find(([label]) => label === name.toLowerCase())?.[1] ??
                  null,
                passed: actual.some(
                  ([label, value]) =>
                    label === name.toLowerCase() && value === expected,
                ),
              }),
            );
          }
          if (m.bundle && scenario.externalTests) {
            const checks = await verify({
              url: m.previewUrl,
              tests: scenario.externalTests,
              dir: app.store.dir(m.id),
              signal: new AbortController().signal,
            });
            external = checks.results;
          }
        } catch (error) {
          m.status = 'failed';
          m.error = error.message;
        }
        const result = {
          status: m.status,
          error: m.error || null,
          durationMs: Date.now() - start,
          usage: m.usage,
          repairs: m.repairs,
          mechanical: m.tests || null,
          external,
          qualitativeReview:
            'Requires inspection of the blinded bundles. No automatic superiority claim.',
          project: m.id,
        };
        comparison.arms[arm] = result;
        bundles[arm] = m.bundle || null;
        await persist();
        console.log(JSON.stringify({ case: scenario.id, arm, ...result }));
      }
      if (!bundles.baseline || !bundles.pipeline) continue;
      const names = randomInt(2)
        ? ['baseline', 'pipeline']
        : ['pipeline', 'baseline'];
      await writeFile(
        join(out, scenario.id + '-blind.json'),
        JSON.stringify(
          {
            brief: scenario.brief,
            A: bundles[names[0]],
            B: bundles[names[1]],
            rubric: [
              'Correctness and feasibility',
              'Coverage of the assignment',
              'Evidence and assumptions',
              'Usability and specificity',
              'Consistency and communication',
            ],
            instructions:
              'Assess A and B without using verbosity as a quality proxy. Quote concrete evidence and defects. A tie is valid.',
          },
          null,
          2,
        ),
      );
      await writeFile(
        join(out, scenario.id + '-key.json'),
        JSON.stringify({ A: names[0], B: names[1] }),
      );
    }
  } finally {
    await persist();
    await app.close();
  }
  console.log('Comparison saved to ' + join(out, 'report.json'));
}
