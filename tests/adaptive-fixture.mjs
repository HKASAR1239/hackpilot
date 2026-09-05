import { fixturePlan, fixtureBundle } from '../engine/fixture.mjs';
import {
  designFixture,
  partFixture,
  reviewFixture,
} from './quality-fixture.mjs';

export const adaptiveBrief =
  'Build a local food donation workflow. Judging: usefulness 70%, visual presentation 30%. Demonstrate persistence after reload.';
export function adaptivePlan() {
  const plan = fixturePlan();
  plan.deliverables = [
    {
      id: 'prototype',
      kind: 'web',
      title: 'Donation workflow',
      reason: 'Usable local workflow',
      sourceId: '',
      quote: '',
      count: null,
    },
  ];
  return plan;
}
export const extractedRubric = {
  criteria: [
    {
      id: 'usefulness',
      label: 'Usefulness',
      sourceId: 'S1',
      quote: 'usefulness 70%',
      weight: 70,
      weightQuote: 'usefulness 70%',
    },
    {
      id: 'presentation',
      label: 'Visual presentation',
      sourceId: 'S1',
      quote: 'visual presentation 30%',
      weight: 30,
      weightQuote: 'visual presentation 30%',
    },
  ],
  uncertainties: [],
};
export function adaptiveResponder({
  onCall,
  onBuild,
  rubric = extractedRubric,
  contribution = 'reject',
  compare = 'candidate',
} = {}) {
  const plan = adaptivePlan();
  const bundle = fixtureBundle();
  const design = designFixture(plan);
  const criterionIds = rubric.criteria.length
    ? rubric.criteria.map((c) => c.id)
    : [
        'internal-relevance',
        'internal-correctness',
        'internal-evidence',
        'internal-communication',
      ];
  return async (request) => {
    await onCall?.(request);
    const p = request.purpose;
    if (p === 'rubric') return structuredClone(rubric);
    if (p === 'planning' || p === 'planning-revision')
      return structuredClone(plan);
    if (p === 'selection')
      return {
        options: plan.ideas.map((i) => ({
          ideaId: i.id,
          feasible: true,
          risk: 'Synthetic fixture; no external integrations.',
          ratings: criterionIds.map((criterionId) => ({
            criterionId,
            score: i.id === 'collecte' ? 4 : 2,
            evidence: 'Synthetic option comparison.',
          })),
        })),
      };
    if (p === 'design') return structuredClone(design);
    if (p === 'contract-review')
      return {
        summary: 'Supported synthetic contract.',
        corrections: [],
        blockingIssues: [],
        limitations: [],
      };
    if (p === 'review') return reviewFixture(design);
    if (p === 'jury')
      return {
        summary: 'Synthetic jury response, not a real quality assessment.',
        checks: criterionIds.map((criterionId) => ({
          criterionId,
          status: 'partial',
          score: 3,
          evidence: [
            {
              path: 'index.html',
              detail: 'The form and local workflow are visible in index.html.',
            },
          ],
          gap: 'No field validation of the claimed benefit.',
        })),
        improvements: [],
      };
    if (p === 'contribution') {
      const options = JSON.parse(
        request.prompt.split('Options : ')[1].split('\nGrille : ')[0],
      );
      const candidate = options.A.kind ? 'A' : 'B';
      return {
        checks: criterionIds.map((criterionId) => ({
          criterionId,
          optionA: 3,
          optionB: 3,
          evidence: 'Controlled synthetic comparison of the two options.',
        })),
        preferred: candidate,
        confidence: 'medium',
        decision: contribution,
        reason: 'Synthetic proposal assessment.',
        estimatedMinutes: 1,
        deliverableIds: ['prototype'],
        instructions: 'Improve the form help text.',
        risks: ['Synthetic fixture only.'],
      };
    }
    if (p === 'trial-compare') {
      const versions = JSON.parse(
        request.prompt
          .split('Versions et contrôles : ')[1]
          .split('\nPilotage du temps : ')[0],
      );
      const candidate = versions.A.bundle.files.some((f) =>
        f.content.includes('Improved help text'),
      )
        ? 'A'
        : 'B';
      return {
        checks: criterionIds.map((criterionId) => ({
          criterionId,
          optionA: 3,
          optionB: 3,
          evidence: 'Compared the help text in the two synthetic versions.',
        })),
        preferred: compare === 'candidate' ? candidate : compare,
        confidence: 'medium',
        reason: 'Synthetic paired artifact comparison.',
      };
    }
    if (p.startsWith('build:') || p.startsWith('repair:')) {
      const part = partFixture(bundle, plan.deliverables[0]);
      return onBuild ? onBuild(request, part) : part;
    }
    throw new Error('Unexpected adaptive call: ' + p);
  };
}
