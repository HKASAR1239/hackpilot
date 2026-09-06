const s = { type: 'string' };
const arr = (items) => ({ type: 'array', items });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export const planSchema = obj({
  name: s,
  summary: s,
  deliverables: {
    ...arr(
      obj({
        id: s,
        kind: {
          type: 'string',
          enum: ['analysis', 'presentation', 'spreadsheet', 'web'],
        },
        title: s,
        reason: s,
        sourceId: s,
        quote: s,
        count: { type: ['integer', 'null'] },
      }),
    ),
    minItems: 1,
    maxItems: 6,
  },
  criteria: arr(
    obj({
      id: s,
      label: s,
      weight: { type: ['number', 'null'] },
      sourceId: s,
      quote: s,
    }),
  ),
  requirements: arr(
    obj({
      id: s,
      text: s,
      kind: { type: 'string', enum: ['mandatory', 'recommended', 'unknown'] },
      sourceId: s,
      quote: s,
    }),
  ),
  unknowns: arr(s),
  ideas: {
    ...arr(
      obj({
        id: s,
        title: s,
        concept: s,
        audience: s,
        features: arr(s),
        fit: { type: 'number' },
        feasibility: { type: 'number' },
        originality: { type: 'number' },
        reason: s,
        risks: arr(s),
      }),
    ),
    minItems: 1,
    maxItems: 3,
  },
});
const step = obj({
  action: {
    type: 'string',
    enum: [
      'fill',
      'click',
      'select',
      'check',
      'assertText',
      'assertVisible',
      'reload',
      'uncheck',
      'assertDisabled',
      'assertValue',
      'assertHidden',
      'storageMode',
    ],
  },
  selector: s,
  value: s,
});
export const buildSchema = obj({
  files: arr(obj({ path: s, content: s })),
  tests: arr(obj({ name: s, steps: arr(step) })),
  limitations: arr(s),
});
export const adaptiveBuildSchema = obj({
  ...buildSchema.properties,
  artifacts: arr(
    obj({
      id: s,
      title: s,
      sections: arr(obj({ heading: s, paragraphs: arr(s), sourceIds: arr(s) })),
      slides: arr(
        obj({ title: s, bullets: arr(s), notes: s, sourceIds: arr(s) }),
      ),
      sheets: arr(
        obj({
          name: s,
          rows: arr(
            obj({
              label: s,
              value: { type: ['number', 'null'] },
              formula: s,
              unit: s,
              sourceId: s,
              assumption: s,
            }),
          ),
        }),
      ),
    }),
  ),
});
export function deliverablesFor(plan) {
  return (
    plan?.deliverables || [
      {
        id: 'prototype',
        kind: 'web',
        title: 'Prototype',
        reason: '',
        count: null,
      },
    ]
  );
}
export function hasWeb(plan) {
  return deliverablesFor(plan).some((d) => d.kind === 'web');
}
export const reviewSchema = obj({ summary: s, gaps: arr(s), mustFix: arr(s) });
export function parseJSON(text) {
  const raw = text
    .trim()
    .replace(/^\x60\x60\x60(?:json)?\s*/, '')
    .replace(/\x60\x60\x60$/, '')
    .trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Le modèle a renvoyé un résultat JSON invalide.');
  }
}
function normalized(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}
export function normalizePlan(raw, sources) {
  if (
    !raw ||
    typeof raw.name !== 'string' ||
    !Array.isArray(raw.ideas) ||
    raw.ideas.length < 1 ||
    raw.ideas.length > 3
  )
    throw new Error('Plan invalide : une à trois approches sont nécessaires.');
  if (raw.deliverables) {
    if (
      !Array.isArray(raw.deliverables) ||
      !raw.deliverables.length ||
      raw.deliverables.length > 6
    )
      throw new Error('Livrables attendus invalides.');
    const ids = new Set();
    for (const d of raw.deliverables) {
      if (
        !/^[a-z][a-z0-9-]{0,39}$/.test(d.id) ||
        ids.has(d.id) ||
        !['analysis', 'presentation', 'spreadsheet', 'web'].includes(d.kind) ||
        typeof d.title !== 'string' ||
        !d.title.trim() ||
        typeof d.reason !== 'string' ||
        (d.count !== null &&
          (!Number.isInteger(d.count) || d.count < 1 || d.count > 30))
      )
        throw new Error('Livrable ou nombre de pages invalide.');
      ids.add(d.id);
      if (d.kind !== 'presentation' && d.count !== null)
        throw new Error('Le nombre de slides concerne les présentations.');
    }
    if (raw.deliverables.filter((d) => d.kind === 'web').length > 1)
      throw new Error('Un seul prototype par mission.');
  }
  for (const idea of raw.ideas) {
    if (
      !idea.id ||
      !idea.title ||
      !idea.concept ||
      !Array.isArray(idea.features)
    )
      throw new Error('Concept incomplet.');
    for (const k of ['fit', 'feasibility', 'originality'])
      if (
        typeof idea[k] !== 'number' ||
        !Number.isFinite(idea[k]) ||
        idea[k] < 0 ||
        idea[k] > 5
      )
        throw new Error('Évaluation de concept invalide.');
    idea.score =
      Math.round(
        (idea.fit * 0.45 + idea.feasibility * 0.4 + idea.originality * 0.15) *
          100,
      ) / 100;
  }
  if (new Set(raw.ideas.map((i) => i.id)).size !== raw.ideas.length)
    throw new Error('Identifiants de concepts dupliqués.');
  raw.ideas.sort((a, b) => b.score - a.score);
  raw.selectedId = raw.ideas[0].id;
  raw.unknowns = Array.isArray(raw.unknowns) ? raw.unknowns : [];
  for (const key of ['criteria', 'requirements']) {
    if (!Array.isArray(raw[key])) raw[key] = [];
    for (const item of raw[key]) {
      const source = sources.find((x) => x.id === item.sourceId);
      item.verified = !!(
        source &&
        item.quote?.length >= 8 &&
        normalized(source.text).includes(normalized(item.quote))
      );
      if (!item.verified) {
        raw.unknowns.push('Source à confirmer : ' + (item.text || item.label));
        if (key === 'requirements') item.kind = 'unknown';
        else item.weight = null;
      }
      if (
        key === 'criteria' &&
        item.weight !== null &&
        (!Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)
      )
        item.weight = null;
    }
  }
  raw.unknowns = [...new Set(raw.unknowns)];
  return raw;
}
export function validateBundle(bundle, plan) {
  const web = hasWeb(plan);
  if (
    !bundle ||
    !Array.isArray(bundle.files) ||
    bundle.files.length < (web ? 3 : 0) ||
    bundle.files.length > 40
  )
    throw new Error('Le projet doit contenir entre 3 et 40 fichiers.');
  if (!web && bundle.files.length)
    throw new Error('Aucun fichier web attendu pour cette mission.');
  let bytes = 0;
  const names = new Set();
  for (const f of bundle.files) {
    if (
      typeof f.path !== 'string' ||
      !/^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(f.path) ||
      f.path.split('/').some((p) => p === '..' || p === '.' || !p) ||
      !/\.(html|css|js|json|md|txt|svg)$/i.test(f.path)
    )
      throw new Error('Chemin de fichier refusé : ' + String(f.path));
    if (names.has(f.path) || typeof f.content !== 'string')
      throw new Error('Fichier dupliqué ou contenu invalide.');
    names.add(f.path);
    bytes += Buffer.byteLength(f.content);
  }
  if (bytes > 700000) throw new Error('Le projet dépasse 700 Ko.');
  if (web && !names.has('index.html'))
    throw new Error('Le projet ne contient pas index.html.');
  if (
    !Array.isArray(bundle.tests) ||
    bundle.tests.length < (web ? 2 : 0) ||
    bundle.tests.length > 12
  )
    throw new Error('Au moins deux scénarios de test sont nécessaires.');
  if (!web && bundle.tests.length)
    throw new Error('Aucun test navigateur attendu pour ces documents.');
  validateBrowserTests(bundle.tests);
  if (!Array.isArray(bundle.limitations)) bundle.limitations = [];
  return bundle;
}

export function validateBrowserTests(tests) {
  if (!Array.isArray(tests) || tests.length > 24)
    throw new Error('Invalid browser test suite.');
  const actions = new Set([
    'fill',
    'click',
    'select',
    'check',
    'assertText',
    'assertVisible',
    'reload',
    'uncheck',
    'assertDisabled',
    'assertValue',
    'assertHidden',
    'storageMode',
  ]);
  for (const test of tests) {
    if (
      !test.name ||
      !Array.isArray(test.steps) ||
      !test.steps.length ||
      test.steps.length > 25
    )
      throw new Error('Scénario de test invalide.');
    if (
      !test.steps.some((x) =>
        [
          'assertText',
          'assertVisible',
          'assertDisabled',
          'assertValue',
          'assertHidden',
        ].includes(x.action),
      )
    )
      throw new Error('Un test doit vérifier un résultat observable.');
    for (const step of test.steps) {
      if (
        !actions.has(step.action) ||
        typeof step.selector !== 'string' ||
        typeof step.value !== 'string'
      )
        throw new Error('Action de test invalide.');
      if (
        !['reload', 'storageMode'].includes(step.action) &&
        !step.selector.trim()
      )
        throw new Error('Sélecteur de test vide.');
      if (
        step.action === 'storageMode' &&
        !['normal', 'read-failure', 'write-failure', 'unavailable'].includes(
          step.value,
        )
      )
        throw new Error('Invalid storage fault mode.');
    }
  }
  return tests;
}
