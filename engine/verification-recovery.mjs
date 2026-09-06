import { buildSchema, validateBrowserTests } from './schema.mjs';
import {
  calculationChecksSchema,
  validateCalculationChecks,
} from './calculation-checks.mjs';
import { fingerprint } from './rubric.mjs';
const text = { type: 'string' };
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items, maxItems) => ({ type: 'array', items, maxItems });
export const verificationRecoverySchema = obj({
  summary: text,
  webTests: {
    ...buildSchema.properties.tests,
    maxItems: 8,
    items: {
      ...buildSchema.properties.tests.items,
      properties: {
        ...buildSchema.properties.tests.items.properties,
        steps: {
          ...buildSchema.properties.tests.items.properties.steps,
          minItems: 1,
          maxItems: 25,
        },
      },
    },
  },
  calculationChecks: calculationChecksSchema,
  localFileTests: { ...buildSchema.properties.tests, maxItems: 8 },
  replacements: arr(obj({ id: text, reason: text }), 12),
  webReplacements: arr(
    obj({
      name: text,
      reason: text,
      assertions: arr(
        obj({
          step: { type: 'integer', minimum: 0, maximum: 24 },
          value: text,
        }),
        25,
      ),
    }),
    8,
  ),
  unavailable: arr(obj({ criterionId: text, reason: text }), 24),
});
export function executionEvidence(m) {
  return {
    createdAt: m.createdAt,
    deadlineAt: m.schedule?.deadlineAt,
    deadlineChanges: m.schedule?.deadlineChanges || [],
    verificationReserveMs: m.schedule?.verificationReserveMs,
    calls: (m.calls || [])
      .filter((c) =>
        /^(planning|design|contract-review|build:|repair:)/.test(c.purpose),
      )
      .map((c) => ({
        purpose: c.purpose,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        status: c.status,
        durationMs: c.durationMs,
      })),
    checkpoints: Object.entries(m.production?.checkpoints || {}).map(
      ([id, c]) => ({ id, status: c.status, createdAt: c.createdAt }),
    ),
    budgetChanges: m.budgetChanges || [],
  };
}
export function activeCalculationChecks(m) {
  return (
    m.verificationRecovery?.calculationChecks ??
    m.design?.calculationChecks ??
    []
  );
}
export function activeWebTests(m) {
  return [
    ...(m.originalTests || m.bundle?.tests || []),
    ...(m.verificationRecovery?.webTests || []),
  ];
}
export function failedSupplementalChecks(m) {
  return (m.verificationRecovery?.webTests || []).filter((t) => {
    const created = m.verificationRecovery.history.find((h) =>
      h.addedTests?.some((added) => added.name === t.name),
    );
    return (
      created &&
      m.tests?.results.some((r) => r.name === t.name && !r.passed) &&
      m.plan.deliverables.some(
        (d) =>
          d.kind === 'web' &&
          m.production?.checkpoints[d.id]?.createdAt > created.at,
      )
    );
  });
}
// A corrected scenario may span several checks, but must retain every prior
// assertion target under the same corrected inputs and exported worksheet.
export function calculationCoverageGaps(
  m,
  checks = activeCalculationChecks(m),
) {
  const obligations = [
    ...(m.design?.calculationChecks || []),
    ...activeCalculationChecks(m),
    ...(m.verificationRecovery?.history || []).flatMap((h) =>
      (h.replacements || [])
        .flatMap((r) => [r.before, r.after])
        .filter(Boolean),
    ),
  ];
  const inputsKey = (c) =>
    fingerprint([...c.inputs].sort((a, b) => a.label.localeCompare(b.label)));
  const gaps = new Map();
  for (const before of obligations) {
    const after = checks.find((c) => c.id === before.id);
    const covered = new Set(
      after &&
        after.deliverableId === before.deliverableId &&
        after.sheet === before.sheet
        ? checks
            .filter(
              (c) =>
                c.deliverableId === after.deliverableId &&
                c.sheet === after.sheet &&
                inputsKey(c) === inputsKey(after),
            )
            .flatMap((c) => c.expected.map((e) => e.label))
        : [],
    );
    for (const expected of before.expected) {
      if (!covered.has(expected.label)) {
        const gap = {
          id: before.id,
          deliverableId: before.deliverableId,
          sheet: before.sheet,
          label: expected.label,
        };
        gaps.set(fingerprint(gap), gap);
      }
    }
  }
  return [...gaps.values()];
}
export function reviewKey(m) {
  return fingerprint({
    bundle: m.bundle,
    design: m.design,
    requirements: m.plan.requirements,
    sources: m.sources,
    checks: m.tests?.results,
    execution: executionEvidence(m),
    calculationChecks: activeCalculationChecks(m),
  });
}
export function verificationRecoveryPrompt(m, language, rejected = null) {
  return `Complète les PREUVES exécutables manquantes dans les livrables existants. Réponds en ${language}. Ne modifie ni le code, ni les documents, ni les critères, ni les exigences. Aucun résultat de test n'est présumé réussi : le moteur exécutera les essais proposés.
Vise uniquement les critères unverified. webTests ajoute au maximum huit parcours courts, chacun isolé avec un stockage neuf. Les tests d'origine restent obligatoires et inchangés. Actions permises : fill, click, select, check, uncheck, assertText (contient), assertVisible, assertHidden, assertDisabled, assertValue (exact), reload ; selector CSS, value chaîne. storageMode utilise selector vide et value normal/read-failure/write-failure/unavailable pour simuler une panne locale du stockage dans la page courante, jusqu'au rechargement. Aucun JavaScript arbitraire, service externe ou commande. Au maximum 25 étapes par parcours, avec au moins une assertion. Une tentative impossible car le bouton est désactivé se vérifie avec assertDisabled ; une simple assertion du libellé d'état ne démontre pas un refus de soumission si le bouton reste actif. Déduis les sélecteurs et les messages du code fourni.
calculationChecks : ajoute les variations réellement demandées, avec les libellés EXACTS du tableur exporté et des résultats attendus calculés indépendamment. Après correction d'un scénario, un contrôle antérieur devenu contradictoire avec les documents peut être remplacé : conserve son id, indique dans replacements {id,reason} la contradiction précise et la couverture conservée. Conserve TOUS les libellés des résultats attendus antérieurs, sur le même livrable et la même feuille, avec les nouvelles valeurs justifiées. Au maximum dix entrées et vingt assertions par contrôle. Tu peux répartir les assertions entre plusieurs contrôles, avec exactement les mêmes entrées corrigées. Les autres anciens contrôles restent inchangés. N'affaiblis jamais un contrôle pour masquer un bug. Vérifie les hypothèses conjointes et les unités, pas seulement l'arithmétique. Les calculs sont contrôlés sur les feuilles exportées, sans modifier les fichiers.
Pour les PDF/CSV et le temps, examine les preuves déjà fournies ; ne propose pas de test web artificiel. unavailable mentionne avec criterionId et reason toute preuve hors capacités : le moteur garde le critère non vérifié. N'invente aucune observation terrain. summary décrit brièvement ce qui est ajouté ou remplacé.
Critères non vérifiés : ${JSON.stringify(m.review?.unverified || [])}
localFileTests ajoute des parcours DSL pour vérifier l'ouverture DIRECTE du fichier index.html exporté dans Chromium (protocole file:), sans serveur HTTP. Le moteur bloque le réseau et les fichiers hors du dossier exporté. Utilise les mêmes actions et sélecteurs que webTests, avec une assertion ; teste le parcours et le rechargement si ce mode est annoncé dans les livrables. Ce contrôle ne certifie pas les autres navigateurs. Les fichiers restent inchangés. Parcours file: déjà enregistrés : ${JSON.stringify(m.verificationRecovery?.localFileTests || [])}
Tests complémentaires échoués après correction du contenu : ${JSON.stringify(failedSupplementalChecks(m))}. webReplacements peut corriger UNIQUEMENT le texte attendu d'une assertion assertText de ces tests, avec name, reason et assertions [{step: index à partir de zéro, value: nouveau texte exact}]. Justifie pourquoi l'ancien texte contredisait le critère. Toutes les actions, sélecteurs, autres assertions et tests d'origine restent inchangés. Ne raccourcis pas un texte attendu pour cacher un défaut. Si le test décrit toujours le bon comportement, ne le remplace pas : le code doit être corrigé. La relecture indépendante revalidera les critères après exécution.
Couverture perdue à rétablir : ${JSON.stringify(calculationCoverageGaps(m))}
Proposition précédente refusée par le validateur (aucun changement appliqué) : ${JSON.stringify(rejected)}
Critères du contrat : ${JSON.stringify(m.design.acceptanceCriteria)}
Fichiers actuels : ${JSON.stringify(m.bundle)}
Contrôles numériques actuels : ${JSON.stringify(activeCalculationChecks(m))}
Parcours supplémentaires existants : ${JSON.stringify(m.verificationRecovery?.webTests || [])}
Preuves exécutées : ${JSON.stringify(m.tests?.results)}
Historique d'exécution : ${JSON.stringify(executionEvidence(m))}`;
}
export function applyVerificationRecovery(raw, m, now = Date.now()) {
  if (
    !raw ||
    typeof raw.summary !== 'string' ||
    !Array.isArray(raw.webTests) ||
    raw.webTests.length > 8 ||
    !Array.isArray(raw.replacements) ||
    !Array.isArray(raw.unavailable)
  )
    throw new Error('Invalid verification recovery plan.');
  validateBrowserTests(raw.webTests);
  const localFileTests = raw.localFileTests || [];
  if (!Array.isArray(localFileTests) || localFileTests.length > 8)
    throw new Error('Invalid local-file verification tests.');
  validateBrowserTests(localFileTests);
  if (
    (raw.webTests.length || localFileTests.length) &&
    !m.plan.deliverables.some((d) => d.kind === 'web')
  )
    throw new Error('Browser checks require a web deliverable.');
  const previous = activeCalculationChecks(m),
    replacements = new Map();
  for (const r of raw.replacements) {
    if (
      !previous.some((c) => c.id === r.id) ||
      typeof r.reason !== 'string' ||
      !r.reason.trim() ||
      replacements.has(r.id)
    )
      throw new Error('Invalid calculation check replacement.');
    replacements.set(r.id, r.reason);
  }
  if (
    !Array.isArray(raw.calculationChecks) ||
    raw.calculationChecks.length > 12 ||
    new Set(raw.calculationChecks.map((c) => c.id)).size !==
      raw.calculationChecks.length
  )
    throw new Error('Invalid additional calculation checks.');
  const next = new Map(previous.map((c) => [c.id, c]));
  for (const check of raw.calculationChecks) {
    const original = next.get(check.id);
    if (
      original &&
      fingerprint(original) !== fingerprint(check) &&
      !replacements.has(check.id)
    )
      throw new Error(
        'A changed calculation check requires an explicit replacement reason.',
      );
    const a = m.bundle.artifacts.find((a) => a.id === check.deliverableId);
    validateCalculationChecks(
      [check],
      { calculations: a?.sheets || [] },
      m.plan,
    );
    next.set(check.id, check);
  }
  for (const id of replacements.keys())
    if (!raw.calculationChecks.some((c) => c.id === id))
      throw new Error('Replacement has no new check.');
  if (next.size > 12) throw new Error('Too many calculation checks.');
  const gaps = calculationCoverageGaps(m, [...next.values()]);
  if (gaps.length)
    throw new Error(
      'Calculation assertion coverage would be reduced: ' +
        JSON.stringify(gaps),
    );
  for (const missing of raw.unavailable)
    if (
      !m.design.acceptanceCriteria.some((c) => c.id === missing.criterionId) ||
      typeof missing.reason !== 'string' ||
      !missing.reason.trim()
    )
      throw new Error('Invalid missing verification evidence.');
  const state = m.verificationRecovery || {
    rounds: 0,
    history: [],
    webTests: [],
  };
  const webReplacements = raw.webReplacements || [];
  if (
    !Array.isArray(webReplacements) ||
    webReplacements.length > 8 ||
    new Set(webReplacements.map((r) => r.name)).size !== webReplacements.length
  )
    throw new Error('Invalid supplemental assertion replacements.');
  const correctedTests = structuredClone(state.webTests);
  const webAudit = [];
  for (const replacement of webReplacements) {
    const before = failedSupplementalChecks(m).find(
      (t) => t.name === replacement.name,
    );
    if (
      !before ||
      typeof replacement.reason !== 'string' ||
      !replacement.reason.trim() ||
      !Array.isArray(replacement.assertions) ||
      !replacement.assertions.length ||
      replacement.assertions.length > 25 ||
      new Set(replacement.assertions.map((a) => a.step)).size !==
        replacement.assertions.length
    )
      throw new Error(
        'Only a failed supplemental text assertion after a content repair can be revised.',
      );
    const after = correctedTests.find((t) => t.name === before.name);
    for (const assertion of replacement.assertions) {
      const step = after.steps[assertion.step];
      if (
        !Number.isInteger(assertion.step) ||
        step?.action !== 'assertText' ||
        typeof assertion.value !== 'string' ||
        !assertion.value.trim() ||
        step.value.includes(assertion.value)
      )
        throw new Error(
          'A supplemental correction must retain the assertion action and cannot shorten its expected text.',
        );
      step.value = assertion.value;
    }
    webAudit.push({
      name: before.name,
      reason: replacement.reason,
      before,
      after,
    });
  }
  const tests = [
    ...new Map(
      [...correctedTests, ...raw.webTests].map((t) => [fingerprint(t), t]),
    ).values(),
  ];
  validateBrowserTests([
    ...(m.originalTests || m.bundle.tests || []),
    ...tests,
  ]);
  const localTests = [
    ...new Map(
      [...(state.localFileTests || []), ...localFileTests].map((t) => [
        fingerprint(t),
        t,
      ]),
    ).values(),
  ];
  validateBrowserTests(localTests);
  const changed =
    fingerprint([...next.values()]) !== fingerprint(previous) ||
    fingerprint(tests) !== fingerprint(state.webTests) ||
    fingerprint(localTests) !== fingerprint(state.localFileTests || []);
  state.history.push({
    at: new Date(now).toISOString(),
    summary: raw.summary,
    replacements: raw.replacements.map((r) => ({
      ...r,
      before: previous.find((c) => c.id === r.id),
      after: next.get(r.id),
    })),
    addedTests: raw.webTests,
    addedLocalFileTests: localFileTests,
    webReplacements: webAudit,
    unavailable: raw.unavailable,
  });
  state.webTests = tests;
  state.localFileTests = localTests;
  state.calculationChecks = [...next.values()];
  m.verificationRecovery = state;
  return changed;
}
