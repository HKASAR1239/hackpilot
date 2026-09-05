import { mkdir, writeFile, rm, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { englishMessage } from './english.mjs';
import { collectSources } from './sources.mjs';
import {
  planSchema,
  adaptiveBuildSchema,
  hasWeb,
  deliverablesFor,
  reviewSchema,
  normalizePlan,
  validateBundle,
} from './schema.mjs';
import { generate, capabilities } from './provider.mjs';
import { fixturePlan, fixtureBundle } from './fixture.mjs';
import { verify } from './verifier.mjs';
import { materializeArtifacts, verifyArtifacts } from './artifacts.mjs';
import { planningPrompt, generationPrompt, reviewPrompt } from './prompts.mjs';
const MAX_MS = 15 * 60 * 1000,
  MAX_CALLS = 9,
  MAX_INPUT = 300000,
  MAX_OUTPUT = 60000;
export class Runner {
  constructor(store, previewOrigin, options = {}) {
    this.store = store;
    this.previewOrigin = previewOrigin;
    this.running = new Map();
    this.generate = options.generate || generate;
    this.verify = options.verify || verify;
  }
  async start(id) {
    if (this.running.size)
      throw Object.assign(
        new Error(
          'Une mission est déjà en cours. Arrêtez-la ou attendez sa fin.',
        ),
        { status: 409 },
      );
    const m = this.store.get(id);
    if (m.status === 'completed')
      throw Object.assign(new Error('Cette mission est déjà terminée.'), {
        status: 409,
      });
    const controller = new AbortController();
    this.running.set(id, controller);
    m.status = 'running';
    m.error = null;
    m.startedAt = new Date().toISOString();
    try {
      await this.store.save(m);
    } catch (error) {
      this.running.delete(id);
      throw error;
    }
    // A failed persistence operation must not leave an unhandled rejection or a locked runner.
    void this.execute(m, controller)
      .catch((error) => {
        m.status = 'failed';
        m.error = 'Impossible de conserver la mission : ' + error.message;
        console.error('HackPilot: mission persistence failed', m.id);
      })
      .finally(() => this.running.delete(id));
    return m;
  }
  cancel(id) {
    const c = this.running.get(id);
    if (c) c.abort(new Error('Arrêt demandé.'));
    return !!c;
  }
  async call(m, prompt, schema, signal) {
    if (signal.aborted) throw new Error('Mission interrompue.');
    if (
      m.usage.calls >= MAX_CALLS ||
      m.usage.input >= MAX_INPUT ||
      m.usage.output >= MAX_OUTPUT
    )
      throw new Error(
        'Le budget de génération est atteint. Les résultats sont conservés.',
      );
    m.usage.calls++;
    await this.store.save(m);
    const result = await this.generate({
      prompt,
      schema,
      dir: join(this.store.dir(m.id), 'generation'),
      signal,
      onUsage: (u) => {
        m.usage.input += u.input_tokens || 0;
        m.usage.output += u.output_tokens || 0;
      },
    });
    await this.store.save(m);
    return result;
  }
  async stage(m, i, status) {
    m.stages[i].status = status;
    await this.store.save(m);
  }
  async writeBundle(m, bundle, signal) {
    validateBundle(bundle, m.plan);
    const dir = this.store.dir(m.id),
      tmp = join(dir, 'project-next');
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    for (const f of bundle.files) {
      const target = join(tmp, f.path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, f.content);
    }
    const artifacts = await materializeArtifacts(
      bundle,
      m.plan,
      m.sources,
      tmp,
      signal,
      m.input.locale,
    );
    const collisions = artifacts.files.filter((path) =>
      bundle.files.some((f) => f.path === path),
    );
    if (collisions.length)
      throw new Error('Nom de fichier en conflit : ' + collisions.join(', '));
    // Only replace a directory created by this runner, after validating every path.
    await rm(join(dir, 'project'), { recursive: true, force: true });
    await rename(tmp, join(dir, 'project'));
    m.files = [...bundle.files.map((f) => f.path), ...artifacts.files];
    m.artifacts = artifacts.metadata;
    m.bundle = bundle;
    m.previewUrl = hasWeb(m.plan)
      ? this.previewOrigin + '/p/' + m.id + '/'
      : null;
    await this.store.save(m);
  }
  async execute(m, controller) {
    const { signal } = controller;
    const outputLanguage = m.input.locale === 'en' ? 'anglais' : 'français';
    const timer = setTimeout(
      () => controller.abort(new Error('Limite de 15 minutes atteinte.')),
      MAX_MS,
    );
    try {
      await mkdir(join(this.store.dir(m.id), 'generation'), {
        recursive: true,
      });
      if (m.provider === 'auto') {
        if ((await capabilities()).codex) m.provider = 'codex';
        else
          throw new Error(
            'Codex n’est pas installé. Lancez npm install, puis npm run login. Le mode démonstration reste disponible.',
          );
      }
      await this.store.event(
        m,
        m.provider === 'demo'
          ? 'Démonstration prédéfinie ; les tests seront réellement exécutés.'
          : 'Génération originale avec Codex. Aucune validation intermédiaire requise.',
      );
      await this.stage(m, 0, 'running');
      if (!m.sources.length) m.sources = await collectSources(m.input, signal);
      for (const s of m.sources)
        if (s.error)
          await this.store.event(
            m,
            'Source indisponible : ' + s.title,
            'warning',
          );
      await this.store.event(
        m,
        m.sources.filter((s) => s.text).length + ' source(s) disponible(s).',
      );
      await this.stage(m, 0, 'done');
      await this.stage(m, 1, 'running');
      if (!m.plan) {
        const raw =
          m.provider === 'demo'
            ? fixturePlan()
            : await this.call(
                m,
                planningPrompt(m, outputLanguage),
                planSchema,
                signal,
              );
        m.plan = normalizePlan(raw, m.sources);
        m.name = m.plan.name;
        await this.store.save(m);
      }
      const idea = m.plan.ideas.find((i) => i.id === m.plan.selectedId);
      await this.store.event(
        m,
        'Concept retenu : ' + idea.title + '. ' + idea.reason,
      );
      await this.stage(m, 1, 'done');
      await this.stage(m, 2, 'running');
      const contract = generationPrompt(m, idea, outputLanguage);
      if (!m.bundle) {
        const bundle =
          m.provider === 'demo'
            ? fixtureBundle()
            : await this.call(m, contract, adaptiveBuildSchema, signal);
        m.originalTests = bundle.tests;
        m.bundle = bundle;
        await this.store.save(m);
      }
      while (true) {
        if (signal.aborted) throw signal.reason;
        try {
          await this.writeBundle(m, m.bundle, signal);
          await this.stage(m, 2, 'done');
          await this.stage(m, 3, 'running');
          const checks = [
            await verifyArtifacts(
              m.bundle,
              m.plan,
              m.sources,
              join(this.store.dir(m.id), 'project'),
            ),
          ];
          if (hasWeb(m.plan))
            checks.push(
              await this.verify({
                url: m.previewUrl,
                tests: m.originalTests || m.bundle.tests,
                dir: this.store.dir(m.id),
                signal,
              }),
            );
          m.tests = {
            at: new Date().toISOString(),
            results: checks.flatMap((c) => c.results),
            passed: checks.every((c) => c.passed),
            screenshot: checks.some((c) => c.screenshot),
          };
        } catch (e) {
          if (signal.aborted) throw signal.reason;
          m.tests = {
            passed: false,
            screenshot: false,
            results: [
              {
                name: 'Production des livrables',
                passed: false,
                detail: e.message,
              },
            ],
          };
        }
        await this.store.save(m);
        const count = m.tests.results.filter((t) => t.passed).length;
        await this.store.event(
          m,
          count + '/' + m.tests.results.length + ' vérifications réussies.',
        );
        if (m.tests.passed) {
          m.review =
            m.provider === 'demo'
              ? {
                  summary:
                    'Exemple pédagogique exécuté et vérifié dans un navigateur.',
                  gaps: m.bundle.limitations,
                  mustFix: [],
                }
              : await this.call(
                  m,
                  reviewPrompt(m, idea, outputLanguage),
                  reviewSchema,
                  signal,
                );
          if (
            !Array.isArray(m.review.mustFix) ||
            !Array.isArray(m.review.gaps) ||
            typeof m.review.summary !== 'string'
          )
            throw new Error('La relecture a renvoyé un format invalide.');
          await this.store.save(m);
          if (!m.review.mustFix.length) break;
        }
        if (m.repairs >= 2 || m.provider === 'demo')
          throw new Error(
            'Des vérifications échouent encore. Les résultats et fichiers sont conservés ; aucune réussite n’est déclarée.',
          );
        m.repairs++;
        await this.store.event(
          m,
          'Correction automatique ' +
            m.repairs +
            '/2 à partir des défauts observés.',
          'warning',
        );
        const fixed = await this.call(
          m,
          contract +
            '\nCorrige les défauts ci-dessous. Conserve les livrables demandés et, pour web, les tests d’origine. Retourne le bundle COMPLET avec tous les fichiers et documents.\nProjet : ' +
            JSON.stringify(m.bundle) +
            '\nTests conservés : ' +
            JSON.stringify(m.originalTests) +
            '\nDéfauts : ' +
            JSON.stringify({ tests: m.tests, review: m.review?.mustFix }),
          adaptiveBuildSchema,
          signal,
        );
        fixed.tests = m.originalTests;
        m.bundle = fixed;
        await this.store.save(m);
        m.review = null;
      }
      await this.stage(m, 3, 'done');
      await this.stage(m, 4, 'running');
      m.submission = this.submission(m, idea);
      await writeFile(
        join(this.store.dir(m.id), 'submission.md'),
        m.submission,
      );
      await this.store.event(
        m,
        'Dossier assemblé : livrables, sources, vérifications et limites.',
      );
      await this.stage(m, 4, 'done');
      m.status = 'completed';
      m.completedAt = new Date().toISOString();
      await this.store.save(m);
    } catch (e) {
      m.status = signal.aborted ? 'cancelled' : 'failed';
      m.error = signal.aborted
        ? signal.reason?.message || 'Mission arrêtée.'
        : e.message;
      if (m.input.locale === 'en') m.error = englishMessage(m.error);
      for (const stage of m.stages)
        if (stage.status === 'running') stage.status = 'error';
      await this.store.event(m, m.error, 'error');
    } finally {
      clearTimeout(timer);
    }
  }
  submission(m, idea) {
    const label = (fr, en) => (m.input.locale === 'en' ? en : fr);
    if (!hasWeb(m.plan)) return this.documentSubmission(m, idea, label);
    const lines = [
      '# ' + idea.title,
      '',
      idea.concept,
      '',
      label('## Utilisateur', '## User'),
      idea.audience,
      '',
      label('## Livrables produits', '## Produced deliverables'),
      ...deliverablesFor(m.plan).map(
        (d) => '- ' + d.title + ' (' + d.kind + ')',
      ),
      '',
      label('## Fonctionnalités prévues', '## Planned features'),
      ...idea.features.map((f) => '- ' + f),
      '',
      label(
        '## Démonstration proposée (3 minutes)',
        '## Suggested demo (3 minutes)',
      ),
      label(
        '0:00–0:25 — Présenter le problème et la personne concernée.',
        '0:00\u20130:25 \u2014 Introduce the problem and intended user.',
      ),
      label(
        '0:25–2:15 — Montrer les parcours testés ci-dessous.',
        '0:25\u20132:15 \u2014 Show the tested workflows below.',
      ),
      label(
        '2:15–2:40 — Expliquer le fonctionnement et les données.',
        '2:15\u20132:40 \u2014 Explain the implementation and data.',
      ),
      label(
        '2:40–3:00 — Présenter les limites et la prochaine étape.',
        '2:40\u20133:00 \u2014 Discuss limitations and the next step.',
      ),
      '',
      label('## Vérifications exécutées', '## Executed checks'),
      ...m.tests.results.map(
        (t) =>
          '- ' +
          (t.passed ? 'PASS' : 'FAIL') +
          ' — ' +
          (m.input.locale === 'en' ? englishMessage(t.name) : t.name) +
          ': ' +
          (m.input.locale === 'en' ? englishMessage(t.detail) : t.detail),
      ),
      '',
      label('## Limites connues', '## Known limitations'),
      ...[
        ...new Set([
          ...m.bundle.limitations,
          ...(m.review?.gaps || []),
          ...m.plan.unknowns,
        ]),
      ].map((g) => '- ' + g),
      '',
      label(
        '## Avant une soumission réelle',
        '## Before a competition submission',
      ),
      label(
        '- Héberger publiquement le projet lorsque le règlement le demande.',
        '- Host the project publicly if required by the rules.',
      ),
      label(
        '- Réaliser et vérifier la vidéo, sa durée et son accessibilité.',
        '- Record the video and check its duration and accessibility.',
      ),
      label(
        '- Vérifier l’éligibilité, les intégrations sponsor et les règles de réutilisation.',
        '- Check eligibility, sponsor integrations and reuse rules.',
      ),
      label(
        '- Soumettre sur la plateforme : HackPilot n’inscrit ni ne soumet automatiquement un projet.',
        '- Submit on the platform. HackPilot does not register or submit projects automatically.',
      ),
      '',
      '## Sources',
      ...m.sources.map(
        (s) => '- ' + s.id + ' — ' + s.title + (s.url ? ' — ' + s.url : ''),
      ),
      '',
      '## Provenance',
      'Mode : ' + m.provider + '. Tests : Chromium via Playwright.',
      label(
        'Classement des concepts : 45 % adéquation, 40 % faisabilité, 15 % originalité. Heuristique interne ; aucune probabilité de victoire.',
        'Concept ranking: 45% fit, 40% feasibility, 15% originality. Internal heuristic; no winning probability.',
      ),
      label(
        'Le statut « prototype vérifié » concerne les tests locaux ci-dessus ; ce n’est pas une validation par un organisateur.',
        'The verified prototype status refers to the local checks above; it is not approval by an organizer.',
      ),
    ];
    return lines.join('\n');
  }
  documentSubmission(m, idea, label) {
    return [
      '# ' + m.plan.name,
      '',
      m.plan.summary,
      '',
      label('## Réponse retenue', '## Selected approach'),
      idea.concept,
      '',
      label('## Livrables produits', '## Produced deliverables'),
      ...m.artifacts.flatMap((a) => [
        '### ' + a.title,
        ...a.files.map((f) => '- ' + f),
        '',
      ]),
      label('## Vérifications exécutées', '## Executed checks'),
      ...m.tests.results.map(
        (t) =>
          '- ' +
          (t.passed ? 'PASS' : 'FAIL') +
          ' — ' +
          t.name +
          ': ' +
          t.detail,
      ),
      '',
      m.review?.summary || '',
      '',
      label('## Limites connues', '## Known limitations'),
      ...[
        ...new Set([
          ...m.bundle.limitations,
          ...(m.review?.gaps || []),
          ...m.plan.unknowns,
        ]),
      ].map((s) => '- ' + s),
      '',
      '## Sources',
      ...m.sources.map(
        (s) => '- ' + s.id + ' — ' + s.title + (s.url ? ' — ' + s.url : ''),
      ),
      '',
      label(
        'Les contrôles vérifient les fichiers et les calculs pris en charge ; la relecture du contenu est réalisée par le modèle.',
        'Checks validate files and supported calculations; content is reviewed by the model.',
      ),
    ].join('\n');
  }
}
