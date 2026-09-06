import { MAX_CALLS, MAX_INPUT, MAX_OUTPUT } from './execution-limits.mjs';
export function generationBudget(m) {
  return {
    calls: m.generationBudget?.calls ?? m.schedule?.callBudget ?? MAX_CALLS,
    inputTokens: m.generationBudget?.inputTokens ?? MAX_INPUT,
    outputTokens: m.generationBudget?.outputTokens ?? MAX_OUTPUT,
    repairs: m.generationBudget?.repairs ?? 2,
    verificationRounds: m.generationBudget?.verificationRounds ?? 2,
  };
}
export function exhaustedBudget(m) {
  const limits = generationBudget(m);
  for (const [field, used] of [
    ['calls', m.usage.calls],
    ['inputTokens', m.usage.input],
    ['outputTokens', m.usage.output],
  ])
    if (used >= limits[field]) return { field, used, limit: limits[field] };
  return null;
}
export function assertGenerationBudget(m) {
  const exhausted = exhaustedBudget(m);
  if (exhausted)
    throw Object.assign(
      new Error(
        'Le budget de génération est atteint. Les résultats sont conservés. ' +
          exhausted.field +
          ' : ' +
          exhausted.used +
          ' / ' +
          exhausted.limit +
          '. Modifiez le budget dans Pilotage avant de reprendre.',
      ),
      { code: 'generation_budget', status: 409, budget: exhausted },
    );
}
export function reviseGenerationBudget(m, patch, now = Date.now()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw Object.assign(new Error('Invalid generation budget.'), {
      status: 400,
    });
  const before = generationBudget(m),
    next = { ...before };
  const ranges = {
    calls: [1, 72],
    inputTokens: [1000, 10000000],
    outputTokens: [1000, 2000000],
    repairs: [0, 10],
    verificationRounds: [0, 6],
  };
  for (const key of Object.keys(patch))
    if (!Object.hasOwn(ranges, key) && key !== 'reason')
      throw Object.assign(new Error('Unknown budget field: ' + key), {
        status: 400,
      });
  let changed = false;
  for (const [key, [min, max]] of Object.entries(ranges))
    if (patch[key] !== undefined) {
      if (
        !Number.isSafeInteger(patch[key]) ||
        patch[key] < min ||
        patch[key] > max
      )
        throw Object.assign(
          new Error(`Invalid budget ${key}: ${min}–${max}.`),
          { status: 400 },
        );
      next[key] = patch[key];
      changed ||= next[key] !== before[key];
    }
  if (
    patch.reason !== undefined &&
    (typeof patch.reason !== 'string' || patch.reason.length > 1000)
  )
    throw Object.assign(new Error('Invalid budget change reason.'), {
      status: 400,
    });
  if (!changed) return before;
  m.generationBudget = next;
  if (m.schedule) m.schedule.callBudget = next.calls;
  m.budgetChanges ||= [];
  m.budgetChanges.push({
    at: new Date(now).toISOString(),
    before,
    after: next,
    reason: patch.reason || 'Explicit budget change.',
  });
  return next;
}
