import {
  EXECUTION_LIMIT_MS,
  MAX_CALLS,
  MAX_INPUT,
  MAX_OUTPUT,
} from '../lib/execution-limits.mjs';
import { mkdir, writeFile, rm, rename, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  verificationPlanSchema,
  validateCalculationChecks,
} from './calculation-checks.mjs';
import { englishMessage } from './english.mjs';
import { collectSources } from './sources.mjs';
import {
  planSchema,
  hasWeb,
  deliverablesFor,
  normalizePlan,
  validateBundle,
} from './schema.mjs';
import { generate, capabilities, generationSettings } from './provider.mjs';
import { fixturePlan, fixtureBundle } from './fixture.mjs';
import { verify } from './verifier.mjs';
import { materializeArtifacts, verifyArtifacts } from './artifacts.mjs';
import {
  planningPrompt,
  designPrompt,
  productionPrompt,
  qualityReviewPrompt,
  verificationPlanPrompt,
  contractReviewPrompt,
} from './prompts.mjs';
import {
  designSchema,
  contractReviewSchema,
  applyContractReview,
  qualityReviewSchema,
  deliverableSchema,
  validateDesign,
  validatePart,
  assembleParts,
  planFingerprint,
  validateReview,
  repairTargets,
} from './quality.mjs';
const label = (m, fr, en) => (m.input.locale === 'en' ? en : fr);
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
  async activity(m, fr, en) {
    m.activity = { title: label(m, fr, en), at: new Date().toISOString() };
    await this.store.event(m, m.activity.title);
  }
  async call(
    m,
    prompt,
    schema,
    signal,
    purpose = 'generation',
    production = false,
  ) {
    if (signal.aborted)
      throw signal.reason || new Error('Mission interrompue.');
    if (
      m.usage.calls >= MAX_CALLS ||
      m.usage.input >= MAX_INPUT ||
      m.usage.output >= MAX_OUTPUT
    )
      throw new Error(
        'Le budget de génération est atteint. Les résultats sont conservés.',
      );
    m.usage.calls++;
    const settings = m.generationSettings || generationSettings();
    const configuration = {
      ...settings,
      reasoningEffort: production
        ? settings.productionEffort
        : settings.reasoningEffort,
    };
    m.currentCall = {
      purpose,
      reasoningEffort: configuration.reasoningEffort,
      status: 'starting',
      startedAt: new Date().toISOString(),
    };
    await this.store.save(m);
    try {
      const result = await this.generate({
        prompt,
        schema,
        dir: join(this.store.dir(m.id), 'generation'),
        signal,
        purpose,
        configuration,
        onUsage: (u) => {
          m.usage.input += u.input_tokens || 0;
          m.usage.output += u.output_tokens || 0;
        },
        onTelemetry: async (entry) => {
          m.calls ||= [];
          const index = m.calls.findIndex((c) => c.id === entry.id);
          if (index < 0) m.calls.push(entry);
          else m.calls[index] = entry;
          m.currentCall = entry;
          await this.store.save(m);
        },
      });
      m.currentCall.status = 'completed';
      await this.store.save(m);
      return result;
    } catch (e) {
      m.currentCall.status = signal.aborted ? 'cancelled' : 'failed';
      m.currentCall.error ||= e.message;
      await this.store.save(m);
      throw e;
    }
  }
  async stage(m, i, status) {
    m.stages[i].status = status;
    await this.store.save(m);
  }
  async writeBundle(m, bundle, signal, plan = m.plan) {
    validateBundle(bundle, plan);
    const dir = this.store.dir(m.id),
      tmp = join(dir, 'project-next'),
      project = join(dir, 'project'),
      backup = join(dir, 'project-previous');
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    for (const f of bundle.files) {
      const target = join(tmp, f.path);
      await mkdir(join(target, '..'), { recursive: true });
      await writeFile(target, f.content);
    }
    const artifacts = { files: [], metadata: [] },
      rendered = {};
    for (const artifact of bundle.artifacts || []) {
      const deliverable = deliverablesFor(plan).find(
        (d) => d.id === artifact.id,
      );
      const fingerprint = planFingerprint({
        artifact,
        deliverable,
        sources: m.sources,
        locale: m.input.locale,
        renderer: 1,
      });
      const cached = m.renderedArtifacts?.[artifact.id];
      let result;
      if (cached?.fingerprint === fingerprint) {
        try {
          for (const path of cached.metadata.files)
            await copyFile(join(project, path), join(tmp, path));
          result = {
            files: cached.metadata.files,
            metadata: [cached.metadata],
          };
        } catch {
          /* A missing cached file is exported again and checked. */
        }
      }
      result ||= await materializeArtifacts(
        { ...bundle, artifacts: [artifact] },
        { ...plan, deliverables: [deliverable] },
        m.sources,
        tmp,
        signal,
        m.input.locale,
      );
      artifacts.files.push(...result.files);
      artifacts.metadata.push(...result.metadata);
      rendered[artifact.id] = { fingerprint, metadata: result.metadata[0] };
    }
    const collisions = artifacts.files.filter((path) =>
      bundle.files.some((f) => f.path === path),
    );
    if (collisions.length)
      throw new Error('Nom de fichier en conflit : ' + collisions.join(', '));
    if (signal.aborted) throw signal.reason;
    await rm(backup, { recursive: true, force: true });
    let backedUp = false;
    try {
      await rename(project, backup);
      backedUp = true;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    try {
      await rename(tmp, project);
    } catch (e) {
      if (backedUp) await rename(backup, project);
      throw e;
    }
    m.renderedArtifacts = rendered;
    m.files = [...bundle.files.map((f) => f.path), ...artifacts.files];
    m.artifacts = artifacts.metadata;
    m.previewUrl = hasWeb(plan)
      ? this.previewOrigin + '/p/' + m.id + '/'
      : null;
    await this.store.save(m);
    await rm(backup, { recursive: true, force: true });
  }
  async reviewContract(m, language, signal) {
    if (!m.design.contractReview) {
      await this.activity(
        m,
        'Contrôle des critères et des capacités avant production.',
        'Checking criteria against supported capabilities before production.',
      );
      const result = await this.call(
        m,
        contractReviewPrompt(m, language),
        contractReviewSchema,
        signal,
        'contract-review',
      );
      m.design = applyContractReview(m.design, result, m);
      await this.store.save(m);
    }
    if (m.design.contractReview.blockingIssues.length)
      throw new Error(m.design.contractReview.blockingIssues.join(' '));
  }
  async prepareDesign(m, language, signal) {
    if (m.design?.planFingerprint === planFingerprint(m.plan)) {
      if (!m.design.calculationChecks) {
        await this.activity(
          m,
          'Préparation des essais de variation des calculs.',
          'Preparing changed-input calculation checks.',
        );
        const value = await this.call(
          m,
          verificationPlanPrompt(m, language),
          verificationPlanSchema,
          signal,
          'verification-plan',
        );
        m.design.calculationChecks = validateCalculationChecks(
          value.calculationChecks,
          m.design,
          m.plan,
        );
        await this.store.save(m);
      }
      await this.reviewContract(m, language, signal);
      return;
    }
    let feedback = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.activity(
        m,
        'Comparaison des approches et vérification des hypothèses.',
        'Comparing approaches and checking assumptions.',
      );
      const raw = await this.call(
        m,
        designPrompt(m, language) + feedback,
        designSchema,
        signal,
        'design',
      );
      m.designDraft = raw;
      await this.store.save(m);
      let design;
      try {
        design = validateDesign(raw, m);
      } catch (e) {
        if (attempt === 2) throw e;
        feedback =
          '\nCorrige ce défaut du dossier de référence : ' +
          e.message +
          '\nDossier précédent : ' +
          JSON.stringify(raw);
        await this.activity(
          m,
          'Correction du dossier de référence.',
          'Correcting the reference dossier.',
        );
        continue;
      }
      if (design.planIssues.length) {
        if (
          (m.planRevisions || 0) >= 1 ||
          Object.keys(m.production?.checkpoints || {}).length
        )
          throw new Error(
            'Le plan nécessite une révision : ' + design.planIssues.join(' '),
          );
        await this.activity(
          m,
          'Révision du plan à partir des défauts identifiés.',
          'Revising the plan using the identified issues.',
        );
        const updated = await this.call(
          m,
          planningPrompt(m, language) +
            '\nRévise le plan ci-dessous pour corriger UNIQUEMENT ces défauts majeurs. Conserve les exigences des sources et explique le choix final.\nPlan : ' +
            JSON.stringify(m.plan) +
            '\nDéfauts : ' +
            JSON.stringify(design.planIssues),
          planSchema,
          signal,
          'planning-revision',
        );
        m.plan = normalizePlan(updated, m.sources);
        m.name = m.plan.name;
        m.planRevisions = (m.planRevisions || 0) + 1;
        await this.store.save(m);
        feedback = '';
        continue;
      }
      m.design = { ...design, planFingerprint: planFingerprint(m.plan) };
      delete m.designDraft;
      await this.store.save(m);
      await this.activity(
        m,
        'Dossier commun enregistré : faits, hypothèses, calculs et critères de vérification.',
        'Shared reference saved: facts, assumptions, calculations and acceptance criteria.',
      );
      await this.reviewContract(m, language, signal);
      return;
    }
    throw new Error('Le dossier de référence reste incomplet.');
  }
  async initializeProduction(m) {
    const fingerprint = planFingerprint(m.plan);
    if (m.production && m.production.planFingerprint !== fingerprint)
      throw new Error('Le plan a changé depuis les livrables enregistrés.');
    m.production ||= {
      version: 1,
      planFingerprint: fingerprint,
      checkpoints: {},
      drafts: {},
      pendingRepairs: [],
      repairReasons: {},
    };
    m.production.repairReasons ||= {};
    if (m.bundle && !Object.keys(m.production.checkpoints).length) {
      for (const d of deliverablesFor(m.plan)) {
        const part = {
          files: d.kind === 'web' ? m.bundle.files : [],
          tests: d.kind === 'web' ? m.originalTests || m.bundle.tests : [],
          artifacts:
            d.kind === 'web'
              ? []
              : (m.bundle.artifacts || []).filter((a) => a.id === d.id),
          limitations: m.bundle.limitations || [],
        };
        try {
          validatePart(part, d, m.sources);
          m.production.checkpoints[d.id] = {
            bundle: part,
            status: 'produced',
            createdAt: new Date().toISOString(),
          };
        } catch {
          /* Invalid legacy parts are regenerated individually. */
        }
      }
    }
    await this.store.save(m);
  }
  async repairAllowance(m, detail) {
    if (m.repairs >= 2)
      throw new Error(
        'Des vérifications échouent encore. Les résultats et fichiers sont conservés ; aucune réussite n’est déclarée. ' +
          detail,
      );
    m.repairs++;
    await this.store.event(
      m,
      label(
        m,
        `Correction ciblée ${m.repairs}/2 : ${detail}`,
        `Targeted repair ${m.repairs}/2: ${detail}`,
      ),
      'warning',
    );
  }
  async schedulePartRepair(m, d, detail) {
    await this.repairAllowance(m, detail);
    if (!m.production.pendingRepairs.includes(d.id))
      m.production.pendingRepairs.push(d.id);
    m.production.repairReasons[d.id] = [detail];
    await this.store.save(m);
  }
  async checkPart(m, d, bundle, signal) {
    const result = await verifyArtifacts(
      bundle,
      { deliverables: [d] },
      m.sources,
      join(this.store.dir(m.id), 'project'),
      m.design?.calculationChecks || [],
    );
    const checks = [result];
    if (d.kind === 'web')
      checks.push(
        await this.verify({
          url: m.previewUrl,
          tests: m.originalTests || bundle.tests,
          dir: this.store.dir(m.id),
          signal,
        }),
      );
    return {
      passed: checks.every((c) => c.passed),
      results: checks.flatMap((c) => c.results),
      screenshot: checks.some((c) => c.screenshot),
    };
  }
  async producePart(m, d, language, signal, repair = null) {
    for (;;) {
      if (signal.aborted) throw signal.reason;
      const previous = m.production.checkpoints[d.id];
      let part = previous?.bundle;
      if (!previous || repair) {
        await this.activity(
          m,
          (repair ? 'Correction : ' : 'Production : ') + d.title,
          (repair ? 'Repairing: ' : 'Producing: ') + d.title,
        );
        part = await this.call(
          m,
          productionPrompt(
            m,
            d,
            language,
            repair && {
              issues: repair,
              previous: m.production.drafts[d.id] || part,
              originalTests: m.originalTests,
            },
          ),
          deliverableSchema(d),
          signal,
          (repair ? 'repair:' : 'build:') + d.id,
          true,
        );
        if (d.kind === 'web' && m.originalTests) part.tests = m.originalTests;
        m.production.drafts[d.id] = part;
        await this.store.save(m);
        try {
          validatePart(part, d, m.sources);
        } catch (e) {
          await this.schedulePartRepair(m, d, e.message);
          repair = [e.message];
          continue;
        }
        if (d.kind === 'web') m.originalTests ||= structuredClone(part.tests);
        m.production.checkpoints[d.id] = {
          bundle: part,
          status: 'produced',
          createdAt: new Date().toISOString(),
        };
        await this.store.save(m);
      }
      const visible = Object.fromEntries(
        Object.entries(m.production.checkpoints).filter(
          ([id, cp]) => id === d.id || cp.status === 'checked',
        ),
      );
      const partialPlan = {
        ...m.plan,
        deliverables: deliverablesFor(m.plan).filter(
          (item) => visible[item.id],
        ),
      };
      try {
        await this.writeBundle(
          m,
          assembleParts(m.plan, visible),
          signal,
          partialPlan,
        );
        const checks = await this.checkPart(m, d, part, signal);
        m.production.checkpoints[d.id].checks = checks;
        if (!checks.passed)
          throw new Error(
            checks.results
              .filter((r) => !r.passed)
              .map((r) => r.detail)
              .join(' '),
          );
      } catch (e) {
        if (signal.aborted) throw signal.reason;
        await this.schedulePartRepair(m, d, e.message);
        repair = [e.message];
        continue;
      }
      m.production.checkpoints[d.id].status = 'checked';
      delete m.production.drafts[d.id];
      delete m.production.repairReasons[d.id];
      m.production.pendingRepairs = m.production.pendingRepairs.filter(
        (id) => id !== d.id,
      );
      await this.store.save(m);
      await this.activity(
        m,
        'Livrable enregistré et contrôlé : ' + d.title,
        'Deliverable saved and checked: ' + d.title,
      );
      return;
    }
  }
  async buildParts(m, language, signal) {
    await this.initializeProduction(m);
    const order = { spreadsheet: 0, analysis: 1, web: 2, presentation: 3 };
    const deliverables = [...deliverablesFor(m.plan)].sort(
      (a, b) => order[a.kind] - order[b.kind],
    );
    for (const d of deliverables) {
      const pending = m.production.pendingRepairs.includes(d.id);
      if (m.production.checkpoints[d.id]?.status === 'checked' && !pending)
        continue;
      const reasons = pending
        ? m.production.repairReasons[d.id] || [
            'Correction reprise après interruption.',
          ]
        : null;
      await this.producePart(m, d, language, signal, reasons);
    }
    m.bundle = assembleParts(m.plan, m.production.checkpoints);
    m.bundle.limitations = [
      ...new Set([
        ...m.bundle.limitations,
        ...(m.design?.contractReview?.limitations || []),
      ]),
    ];
    await this.writeBundle(m, m.bundle, signal);
    await this.store.save(m);
  }
  async verifyComplete(m, signal) {
    const checks = [
      await verifyArtifacts(
        m.bundle,
        m.plan,
        m.sources,
        join(this.store.dir(m.id), 'project'),
        m.design?.calculationChecks || [],
      ),
    ];
    if (hasWeb(m.plan)) {
      const web = await this.verify({
        url: m.previewUrl,
        tests: m.originalTests || m.bundle.tests,
        dir: this.store.dir(m.id),
        signal,
      });
      const deliverableIds = deliverablesFor(m.plan)
        .filter((d) => d.kind === 'web')
        .map((d) => d.id);
      checks.push({
        ...web,
        results: web.results.map((r) => ({ ...r, deliverableIds })),
      });
    }
    m.tests = {
      at: new Date().toISOString(),
      passed: checks.every((c) => c.passed),
      results: checks.flatMap((c) => c.results),
      screenshot: checks.some((c) => c.screenshot),
    };
    await this.store.save(m);
    await this.store.event(
      m,
      m.tests.results.filter((t) => t.passed).length +
        '/' +
        m.tests.results.length +
        ' vérifications réussies.',
    );
    return m.tests;
  }
  async execute(m, controller) {
    const { signal } = controller;
    const language = m.input.locale === 'en' ? 'anglais' : 'français';
    const timer = setTimeout(
      () => controller.abort(new Error('Limite de 2 heures atteinte.')),
      EXECUTION_LIMIT_MS,
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
      const demo = m.provider === 'demo';
      await this.store.event(
        m,
        demo
          ? 'Démonstration prédéfinie ; les tests seront réellement exécutés.'
          : 'Génération originale avec Codex. Aucune validation intermédiaire requise.',
      );
      if (!demo) {
        m.generationSettings = generationSettings();
        const { model, reasoningEffort, productionEffort } =
          m.generationSettings;
        await this.activity(
          m,
          `Modèle : ${model || 'configuration Codex'} · stratégie/relecture : ${reasoningEffort} · production : ${productionEffort}.`,
          `Model: ${model || 'Codex configuration'} · strategy/review: ${reasoningEffort} · production: ${productionEffort}.`,
        );
      }
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
        m.plan = normalizePlan(
          demo
            ? fixturePlan()
            : await this.call(
                m,
                planningPrompt(m, language),
                planSchema,
                signal,
                'planning',
              ),
          m.sources,
        );
        m.name = m.plan.name;
        await this.store.save(m);
      }
      if (!demo) await this.prepareDesign(m, language, signal);
      const idea = m.plan.ideas.find((i) => i.id === m.plan.selectedId);
      await this.store.event(
        m,
        'Concept retenu : ' + idea.title + '. ' + idea.reason,
      );
      await this.stage(m, 1, 'done');
      await this.stage(m, 2, 'running');
      if (demo) {
        m.bundle ||= fixtureBundle();
        m.originalTests ||= m.bundle.tests;
        await this.writeBundle(m, m.bundle, signal);
      } else await this.buildParts(m, language, signal);
      await this.stage(m, 2, 'done');
      await this.stage(m, 3, 'running');
      for (;;) {
        if (signal.aborted) throw signal.reason;
        const tests = await this.verifyComplete(m, signal);
        if (demo) {
          if (!tests.passed)
            throw new Error(
              'Des vérifications échouent encore. Les résultats et fichiers sont conservés ; aucune réussite n’est déclarée.',
            );
          m.review = {
            summary:
              'Exemple pédagogique exécuté et vérifié dans un navigateur.',
            gaps: m.bundle.limitations,
            mustFix: [],
          };
          break;
        }
        if (!tests.passed) {
          // Part checks passed earlier; the failing final check still blocks publication.
          m.review = {
            summary: '',
            gaps: [],
            checks: [],
            issues: tests.results
              .filter((t) => !t.passed)
              .map((t) => ({
                severity: 'major',
                detail: t.detail,
                deliverableIds:
                  t.deliverableIds || deliverablesFor(m.plan).map((d) => d.id),
              })),
          };
        } else {
          await this.activity(
            m,
            'Relecture indépendante et contrôle de cohérence entre livrables.',
            'Independent review and cross-deliverable consistency checks.',
          );
          m.review = validateReview(
            await this.call(
              m,
              qualityReviewPrompt(m, language),
              qualityReviewSchema,
              signal,
              'review',
            ),
            m,
          );
          await this.store.save(m);
          if (!m.review.mustFix.length) break;
        }
        const targets = repairTargets(m.review, m.plan);
        if (!targets.length)
          throw new Error(
            label(
              m,
              'Vérification incomplète : ',
              'Incomplete verification: ',
            ) + (m.review.unverified || []).map((c) => c.evidence).join(' '),
          );
        await this.repairAllowance(
          m,
          m.review.issues
            .filter((i) => i.severity !== 'minor')
            .map((i) => i.detail)
            .join(' '),
        );
        m.production.pendingRepairs = targets.map((d) => d.id);
        for (const d of targets)
          m.production.repairReasons[d.id] = m.review.issues
            .filter(
              (i) => i.severity !== 'minor' && i.deliverableIds.includes(d.id),
            )
            .map((i) => i.detail);
        await this.store.save(m);
        await this.stage(m, 3, 'pending');
        await this.stage(m, 2, 'running');
        await this.buildParts(m, language, signal);
        await this.stage(m, 2, 'done');
        await this.stage(m, 3, 'running');
      }
      await this.stage(m, 3, 'done');
      await this.stage(m, 4, 'running');
      m.submission = this.submission(m, idea);
      if (m.design)
        m.submission +=
          '\n\n' +
          label(m, '## Critères et preuves', '## Criteria and evidence') +
          '\n\n' +
          m.review.checks
            .map(
              (c) =>
                '- ' + c.criterionId + ' — ' + c.status + ': ' + c.evidence,
            )
            .join('\n');
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
