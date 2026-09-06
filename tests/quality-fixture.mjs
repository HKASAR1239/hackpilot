import { deliverablesFor } from '../engine/schema.mjs';
export function designFixture(plan, calculations = []) {
  return {
    recommendation:
      'Deliver the smallest complete solution that answers the assignment and makes its assumptions inspectable.',
    alternatives: [
      {
        approach: 'A manual workflow',
        benefit: 'Small setup cost',
        tradeoff: 'Repeated coordination work',
        decision: 'Use as the comparison for the proposed workflow.',
      },
    ],
    planIssues: [],
    facts: [],
    assumptions: [
      {
        id: 'adoption',
        statement: 'Actual adoption is unknown.',
        impact: 'Demand determines the recommendation.',
        validation: 'Measure eligible users before rollout.',
      },
    ],
    calculations,
    calculationChecks: [],
    acceptanceCriteria: deliverablesFor(plan).map((d, i) => ({
      id: 'criterion-' + d.id,
      requirementIds:
        i === 0
          ? (plan.requirements || [])
              .filter((r) => r.kind === 'mandatory')
              .map((r) => r.id)
          : [],
      deliverableIds: [d.id],
      criterion: 'Complete and usable ' + d.kind,
      evidence: 'Read-back content and independently executed checks.',
    })),
    failureModes: [
      {
        risk: 'A result can be attractive but unusable.',
        test: 'Run the core workflow and inspect the output.',
        mitigation: 'Block completion when a required check fails.',
      },
    ],
  };
}
export function partFixture(bundle, d) {
  return {
    files: d.kind === 'web' ? structuredClone(bundle.files) : [],
    tests: d.kind === 'web' ? structuredClone(bundle.tests) : [],
    artifacts:
      d.kind === 'web'
        ? []
        : structuredClone(
            (bundle.artifacts || []).filter((a) => a.id === d.id),
          ),
    limitations: bundle.limitations || [],
  };
}
export function reviewFixture(design) {
  return {
    summary:
      'Synthetic review fixture; content verified by the surrounding test assertions.',
    gaps: [],
    checks: design.acceptanceCriteria.map((c) => ({
      criterionId: c.id,
      status: 'met',
      evidence: 'Synthetic fixture aligned with the executed test oracle.',
      deliverableIds: c.deliverableIds,
    })),
    issues: [],
  };
}
export function qualityResponder(
  plan,
  bundle,
  { onBuild, onCall, onReview, calculations = [] } = {},
) {
  const design = designFixture(plan, calculations);
  return async (request) => {
    onCall?.(request);
    if (
      request.purpose === 'planning' ||
      request.purpose === 'planning-revision'
    )
      return structuredClone(plan);
    if (request.purpose === 'design') return structuredClone(design);
    if (request.purpose === 'contract-review')
      return {
        summary: 'Fixture contract uses supported formats.',
        corrections: [],
        blockingIssues: [],
        limitations: [],
      };
    if (request.purpose === 'verification-recovery')
      return {
        summary: 'No executable field evidence is available.',
        webTests: [],
        calculationChecks: [],
        replacements: [],
        unavailable: [],
      };
    if (request.purpose === 'review')
      return onReview
        ? onReview(request, reviewFixture(design))
        : reviewFixture(design);
    const d = deliverablesFor(plan).find(
      (d) => request.purpose.split(':')[1] === d.id,
    );
    if (!d) throw new Error('Unexpected call: ' + request.purpose);
    const part = partFixture(bundle, d);
    return onBuild ? onBuild(request, part, d) : part;
  };
}
