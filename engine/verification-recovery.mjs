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
  replacements: arr(obj({ id: text, reason: text }), 12),
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
export function verificationRecoveryPrompt(m, language) {
  return `Complète les PREUVES exécutables manquantes dans les livrables existants. Réponds en ${language}. Ne modifie ni le code, ni les documents, ni les critères, ni les exigences. Aucun résultat de test n'est présumé réussi : le moteur exécutera les essais proposés.
Vise uniquement les critères unverified. webTests ajoute au maximum huit parcours courts, chacun isolé avec un stockage neuf. Les tests d'origine restent obligatoires et inchangés. Actions permises : fill, click, select, check, uncheck, assertText (contient), assertVisible, assertHidden, assertDisabled, assertValue (exact), reload ; selector CSS, value chaîne. storageMode utilise selector vide et value normal/read-failure/write-failure/unavailable pour simuler une panne locale du stockage dans la page courante, jusqu'au rechargement. Aucun JavaScript arbitraire, service externe ou commande. Au maximum 25 étapes par parcours, avec au moins une assertion. Une tentative impossible car le bouton est désactivé se vérifie avec assertDisabled ; une simple assertion du libellé d'état ne démontre pas un refus de soumission si le bouton reste actif. Déduis les sélecteurs et les messages du code fourni.
calculationChecks : ajoute les variations réellement demandées, avec les libellés EXACTS du tableur exporté et des résultats attendus calculés indépendamment. Après correction d'un scénario, un contrôle antérieur devenu contradictoire avec les documents peut être remplacé : conserve son id, indique dans replacements {id,reason} la contradiction précise et la couverture conservée. Les autres anciens contrôles restent inchangés. N'affaiblis jamais un contrôle pour masquer un bug. Vérifie les hypothèses conjointes et les unités, pas seulement l'arithmétique. Les calculs sont contrôlés sur les feuilles exportées, sans modifier les fichiers.
Pour les PDF/CSV et le temps, examine les preuves déjà fournies ; ne propose pas de test web artificiel. unavailable mentionne avec criterionId et reason toute preuve hors capacités : le moteur garde le critère non vérifié. N'invente aucune observation terrain. summary décrit brièvement ce qui est ajouté ou remplacé.
Critères non vérifiés : ${JSON.stringify(m.review?.unverified || [])}
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
  if (raw.webTests.length && !m.plan.deliverables.some((d) => d.kind === 'web'))
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
  const tests = [
    ...new Map(
      [...state.webTests, ...raw.webTests].map((t) => [fingerprint(t), t]),
    ).values(),
  ];
  validateBrowserTests([
    ...(m.originalTests || m.bundle.tests || []),
    ...tests,
  ]);
  const changed =
    fingerprint([...next.values()]) !== fingerprint(previous) ||
    tests.length !== state.webTests.length;
  state.history.push({
    at: new Date(now).toISOString(),
    summary: raw.summary,
    replacements: raw.replacements.map((r) => ({
      ...r,
      before: previous.find((c) => c.id === r.id),
      after: next.get(r.id),
    })),
    addedTests: raw.webTests,
    unavailable: raw.unavailable,
  });
  state.webTests = tests;
  state.calculationChecks = [...next.values()];
  m.verificationRecovery = state;
  return changed;
}
