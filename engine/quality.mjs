import {
  calculationChecksSchema,
  validateCalculationChecks,
} from './calculation-checks.mjs';
import { createHash } from 'node:crypto';
import {
  adaptiveBuildSchema,
  buildSchema,
  deliverablesFor,
  validateBundle,
} from './schema.mjs';
import { validateArtifacts } from './artifacts.mjs';
import { calculateRows } from './calculations.mjs';

const str = { type: 'string' };
const arr = (items) => ({ type: 'array', items });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const sheet =
  adaptiveBuildSchema.properties.artifacts.items.properties.sheets.items;
export const designSchema = obj({
  recommendation: str,
  alternatives: arr(
    obj({ approach: str, benefit: str, tradeoff: str, decision: str }),
  ),
  planIssues: arr(str),
  facts: arr(obj({ id: str, statement: str, sourceId: str, quote: str })),
  assumptions: arr(
    obj({ id: str, statement: str, impact: str, validation: str }),
  ),
  calculations: arr(sheet),
  calculationChecks: calculationChecksSchema,
  acceptanceCriteria: arr(
    obj({
      id: str,
      requirementIds: arr(str),
      deliverableIds: arr(str),
      criterion: str,
      evidence: str,
    }),
  ),
  failureModes: arr(obj({ risk: str, test: str, mitigation: str })),
});
export const contractReviewSchema = obj({
  summary: str,
  corrections: arr(obj({ criterionId: str, criterion: str, evidence: str })),
  blockingIssues: arr(str),
  limitations: arr(str),
});
export function applyContractReview(design, review, mission) {
  if (
    !review ||
    !nonempty(review.summary) ||
    !Array.isArray(review.corrections) ||
    !Array.isArray(review.blockingIssues) ||
    !Array.isArray(review.limitations)
  )
    fail('Incomplete capability review.');
  if (
    new Set(review.corrections.map((c) => c.criterionId)).size !==
    review.corrections.length
  )
    fail('Duplicate criterion correction.');
  const updated = structuredClone(design);
  for (const correction of review.corrections) {
    const criterion = updated.acceptanceCriteria.find(
      (c) => c.id === correction.criterionId,
    );
    if (
      !criterion ||
      !nonempty(correction.criterion) ||
      !nonempty(correction.evidence)
    )
      fail('Invalid criterion correction.');
    criterion.criterion = correction.criterion;
    criterion.evidence = correction.evidence;
  }
  validateDesign(updated, mission);
  return {
    ...updated,
    contractReview: {
      ...review,
      originalCriteria: structuredClone(design.acceptanceCriteria),
    },
  };
}
export const qualityReviewSchema = obj({
  summary: str,
  gaps: arr(str),
  checks: arr(
    obj({
      criterionId: str,
      status: { type: 'string', enum: ['met', 'failed', 'unverified'] },
      evidence: str,
      deliverableIds: arr(str),
    }),
  ),
  issues: arr(
    obj({
      severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
      deliverableIds: arr(str),
      detail: str,
    }),
  ),
});
export function deliverableSchema(d) {
  if (d.kind === 'web')
    return {
      ...buildSchema,
      properties: {
        ...buildSchema.properties,
        artifacts: {
          type: 'array',
          items: adaptiveBuildSchema.properties.artifacts.items,
          maxItems: 0,
        },
      },
      required: [...buildSchema.required, 'artifacts'],
    };
  const artifact = structuredClone(
    adaptiveBuildSchema.properties.artifacts.items,
  );
  artifact.properties.id = { type: 'string', enum: [d.id] };
  for (const [key, kind] of [
    ['sections', 'analysis'],
    ['slides', 'presentation'],
    ['sheets', 'spreadsheet'],
  ])
    if (d.kind !== kind) artifact.properties[key].maxItems = 0;
  if (d.kind === 'presentation' && d.count !== null) {
    artifact.properties.slides.minItems = d.count;
    artifact.properties.slides.maxItems = d.count;
  }
  return obj({
    files: { ...buildSchema.properties.files, maxItems: 0 },
    tests: { ...buildSchema.properties.tests, maxItems: 0 },
    limitations: arr(str),
    artifacts: { type: 'array', items: artifact, minItems: 1, maxItems: 1 },
  });
}
const nonempty = (v) => typeof v === 'string' && v.trim().length > 0;
const normal = (v) => String(v).toLowerCase().replace(/\s+/g, ' ').trim();
const fail = (message) => {
  throw new Error('Quality contract: ' + message);
};
const unique = (items, label) => {
  if (
    items.some((x) => !nonempty(x.id)) ||
    new Set(items.map((x) => x.id)).size !== items.length
  )
    fail(label + ': missing or duplicate IDs.');
};
export function validateDesign(value, mission) {
  if (!value || !nonempty(value.recommendation))
    fail('Missing recommendation.');
  for (const key of [
    'alternatives',
    'planIssues',
    'facts',
    'assumptions',
    'calculations',
    'acceptanceCriteria',
    'failureModes',
  ])
    if (!Array.isArray(value[key])) fail('Missing ' + key + '.');
  if (
    !value.alternatives.length ||
    value.alternatives.length > 3 ||
    !value.acceptanceCriteria.length ||
    value.acceptanceCriteria.length > 24
  )
    fail('Review alternatives and provide 1–24 acceptance criteria.');
  for (const alternative of value.alternatives)
    if (
      !['approach', 'benefit', 'tradeoff', 'decision'].every((k) =>
        nonempty(alternative[k]),
      )
    )
      fail('An alternative has no concrete tradeoff.');
  for (const mode of value.failureModes)
    if (!['risk', 'test', 'mitigation'].every((k) => nonempty(mode[k])))
      fail('A failure mode lacks a test or mitigation.');
  if (!value.failureModes.length) fail('Identify at least one failure mode.');
  unique(value.facts, 'facts');
  unique(value.assumptions, 'assumptions');
  unique(value.acceptanceCriteria, 'criteria');
  for (const fact of value.facts) {
    const source = mission.sources.find((s) => s.id === fact.sourceId);
    if (
      !nonempty(fact.statement) ||
      !source ||
      !nonempty(fact.quote) ||
      fact.quote.length < 8 ||
      !normal(source.text).includes(normal(fact.quote))
    )
      fail(
        'Unsupported fact: ' +
          fact.id +
          '. Use an exact source quote or label an assumption.',
      );
  }
  for (const assumption of value.assumptions)
    if (
      !['statement', 'impact', 'validation'].every((k) =>
        nonempty(assumption[k]),
      )
    )
      fail('An assumption lacks an impact or validation method.');
  const expected = deliverablesFor(mission.plan);
  const requirements = mission.plan.requirements || [];
  for (const criterion of value.acceptanceCriteria) {
    if (
      !nonempty(criterion.criterion) ||
      !nonempty(criterion.evidence) ||
      !Array.isArray(criterion.deliverableIds) ||
      !criterion.deliverableIds.length ||
      criterion.deliverableIds.some(
        (id) => !expected.some((d) => d.id === id),
      ) ||
      !Array.isArray(criterion.requirementIds) ||
      criterion.requirementIds.some(
        (id) => !requirements.some((r) => r.id === id),
      )
    )
      fail('Invalid acceptance criterion: ' + criterion.id);
  }
  for (const d of expected)
    if (!value.acceptanceCriteria.some((c) => c.deliverableIds.includes(d.id)))
      fail('Deliverable lacks acceptance criteria: ' + d.id);
  for (const r of requirements.filter((r) => r.kind === 'mandatory'))
    if (!value.acceptanceCriteria.some((c) => c.requirementIds.includes(r.id)))
      fail('Required question has no acceptance criterion: ' + r.id);
  if (value.calculations.length) {
    const plan = {
      deliverables: [{ id: 'reference', kind: 'spreadsheet', count: null }],
    };
    validateArtifacts(
      {
        artifacts: [
          {
            id: 'reference',
            title: 'Reference calculations',
            sections: [],
            slides: [],
            sheets: value.calculations,
          },
        ],
      },
      plan,
      mission.sources,
    );
  }
  validateCalculationChecks(value.calculationChecks || [], value, mission.plan);
  return {
    ...value,
    calculatedValues: value.calculations.map((s) => {
      const values = calculateRows(s.rows);
      return {
        name: s.name,
        rows: s.rows.map((r, i) => ({
          label: r.label,
          value: values[i],
          unit: r.unit,
        })),
      };
    }),
  };
}
export function validatePart(bundle, deliverable, sources) {
  const plan = { deliverables: [deliverable] };
  validateBundle(bundle, plan);
  validateArtifacts(bundle, plan, sources);
  return bundle;
}
export function assembleParts(plan, checkpoints) {
  const parts = deliverablesFor(plan).flatMap((d) =>
    checkpoints[d.id] ? [checkpoints[d.id].bundle] : [],
  );
  return {
    files: parts.flatMap((b) => b.files),
    tests: parts.flatMap((b) => b.tests),
    artifacts: parts.flatMap((b) => b.artifacts || []),
    limitations: [...new Set(parts.flatMap((b) => b.limitations || []))],
  };
}
export const planFingerprint = (plan) =>
  createHash('sha256').update(JSON.stringify(plan)).digest('hex');
export function validateReview(review, mission) {
  if (
    !review ||
    !nonempty(review.summary) ||
    !Array.isArray(review.gaps) ||
    !Array.isArray(review.checks) ||
    !Array.isArray(review.issues)
  )
    fail('Incomplete final review.');
  const criteria = mission.design.acceptanceCriteria;
  const ids = new Set(deliverablesFor(mission.plan).map((d) => d.id));
  if (
    new Set(review.checks.map((c) => c.criterionId)).size !==
      review.checks.length ||
    review.checks.length !== criteria.length
  )
    fail('Review must address every acceptance criterion exactly once.');
  for (const c of review.checks)
    if (
      !criteria.some((x) => x.id === c.criterionId) ||
      !['met', 'failed', 'unverified'].includes(c.status) ||
      !nonempty(c.evidence) ||
      !Array.isArray(c.deliverableIds) ||
      !c.deliverableIds.length ||
      c.deliverableIds.some((id) => !ids.has(id))
    )
      fail('Invalid review evidence.');
  for (const i of review.issues)
    if (
      !['blocker', 'major', 'minor'].includes(i.severity) ||
      !nonempty(i.detail) ||
      !Array.isArray(i.deliverableIds) ||
      !i.deliverableIds.length ||
      i.deliverableIds.some((id) => !ids.has(id))
    )
      fail('Invalid repair target.');
  const failures = review.checks
    .filter((c) => c.status !== 'met')
    .map((c) => ({
      severity: 'major',
      kind: c.status === 'unverified' ? 'verification' : 'content',
      detail: c.evidence,
      deliverableIds: c.deliverableIds,
    }));
  const issues = [
    ...new Map(
      [...review.issues, ...failures].map((i) => [
        JSON.stringify([
          i.severity,
          i.detail,
          [...i.deliverableIds].sort((a, b) => a.localeCompare(b)),
        ]),
        i,
      ]),
    ).values(),
  ];
  return {
    ...review,
    issues,
    unverified: review.checks.filter((c) => c.status === 'unverified'),
    mustFix: issues.filter((i) => i.severity !== 'minor').map((i) => i.detail),
  };
}
export function repairTargets(review, plan) {
  const targets = new Set(
    review.issues
      .filter((i) => i.severity !== 'minor' && i.kind !== 'verification')
      .flatMap((i) => i.deliverableIds),
  );
  return deliverablesFor(plan).filter((d) => targets.has(d.id));
}
