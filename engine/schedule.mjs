import {
  EXECUTION_LIMIT_MS,
  CALL_LIMIT_MS,
  MAX_CALLS,
} from '../lib/execution-limits.mjs';

const MINUTE = 60000;
const fail = (message, code) => {
  throw Object.assign(new Error(message), { status: 409, code });
};
export function createSchedule(input, now = Date.now()) {
  const duration = Number(input.hours) * 60 * MINUTE;
  const deadline = input.deadlineAt
    ? Date.parse(input.deadlineAt)
    : now + duration;
  if (
    !Number.isFinite(deadline) ||
    deadline - now < MINUTE ||
    deadline - now > 720 * 60 * MINUTE
  )
    throw Object.assign(
      new Error('Deadline must be within the next 30 days.'),
      { status: 400 },
    );
  const callBudget = input.callBudget ?? MAX_CALLS;
  if (!Number.isInteger(callBudget) || callBudget < 8 || callBudget > 72)
    throw Object.assign(
      new Error('Generation budget must be between 8 and 72 calls.'),
      { status: 400 },
    );
  const window = Math.min(deadline - now, EXECUTION_LIMIT_MS);
  return {
    version: 1,
    deadlineAt: new Date(deadline).toISOString(),
    createdAt: new Date(now).toISOString(),
    startedAt: null,
    callBudget,
    verificationReserveMs: Math.min(
      10 * MINUTE,
      Math.max(MINUTE, window * 0.2),
    ),
    phase: 'framing',
    milestones: [],
    decisions: [],
    deadlineChanges: [],
  };
}
export const remainingMs = (m, now = Date.now()) =>
  m.schedule
    ? Math.max(0, Date.parse(m.schedule.deadlineAt) - now)
    : EXECUTION_LIMIT_MS;
export const shortDeadline = (m) =>
  !!m.schedule &&
  Date.parse(m.schedule.deadlineAt) - Date.parse(m.schedule.createdAt) <=
    60 * MINUTE;
export function beginAttempt(m, now = Date.now()) {
  if (!m.schedule) return { durationMs: EXECUTION_LIMIT_MS, deadline: false };
  const left = remainingMs(m, now);
  if (!left)
    fail(
      'The project deadline has been reached. Saved deliverables remain available.',
      'deadline_reached',
    );
  m.schedule.startedAt ||= new Date(now).toISOString();
  m.schedule.attemptStartedAt = new Date(now).toISOString();
  m.schedule.milestoneAt = new Date(
    now + Math.min(left, EXECUTION_LIMIT_MS),
  ).toISOString();
  return {
    durationMs: Math.min(left, EXECUTION_LIMIT_MS),
    deadline: left <= EXECUTION_LIMIT_MS,
  };
}
export function callTimeBudget(m, purpose, now = Date.now()) {
  if (!m.schedule) return CALL_LIMIT_MS;
  const remaining = Math.min(
    remainingMs(m, now),
    Math.max(
      0,
      Date.parse(m.schedule.milestoneAt || m.schedule.deadlineAt) - now,
    ),
  );
  if (remaining < 1000)
    fail(
      'No generation time remains before the deadline or milestone.',
      'deadline_reached',
    );
  if (purpose === 'one-prompt-baseline')
    return Math.min(
      CALL_LIMIT_MS,
      Math.max(1000, remaining - m.schedule.verificationReserveMs),
    );
  const unbuilt = Math.max(
    1,
    m.plan?.deliverables?.filter(
      (d) =>
        m.production?.checkpoints?.[d.id]?.status !== 'checked' ||
        m.production?.pendingRepairs?.includes(d.id),
    ).length ?? 2,
  );
  const available = Math.max(
    1000,
    remaining - Math.min(m.schedule.verificationReserveMs, remaining * 0.35),
  );
  let allowance;
  if (purpose === 'rubric') allowance = Math.min(3 * MINUTE, available * 0.15);
  else if (purpose === 'design') allowance = available * 0.35;
  else if (purpose === 'contract-review')
    allowance = Math.min(4 * MINUTE, available * 0.2);
  else if (purpose === 'selection' || purpose === 'contribution')
    allowance = Math.min(4 * MINUTE, available * 0.2);
  else if (/review|jury|trial-compare/.test(purpose)) allowance = remaining / 2;
  else if (purpose.startsWith('build:') || purpose.startsWith('repair:'))
    allowance = available / (unbuilt + 1);
  else allowance = available * 0.25;
  return Math.max(1000, Math.min(CALL_LIMIT_MS, allowance));
}
export function optionalWorkFits(
  m,
  estimatedMinutes = 2,
  calls = 1,
  now = Date.now(),
) {
  if (!m.schedule) return true;
  const left = Math.min(
    remainingMs(m, now),
    Math.max(
      0,
      Date.parse(m.schedule.milestoneAt || m.schedule.deadlineAt) - now,
    ),
  );
  return (
    left > estimatedMinutes * MINUTE + m.schedule.verificationReserveMs &&
    m.usage.calls + calls + 2 <= m.schedule.callBudget
  );
}
export function scheduleContext(m, now = Date.now()) {
  if (!m.schedule) return '';
  const left = Math.ceil(remainingMs(m, now) / MINUTE);
  const window = Math.max(
    1,
    Math.ceil(
      (Date.parse(m.schedule.milestoneAt || m.schedule.deadlineAt) - now) /
        MINUTE,
    ),
  );
  return `\nPilotage du temps : deadline ${m.schedule.deadlineAt}, ${left} minutes calendaires restantes, ${Math.min(left, window)} minutes jusqu'au prochain jalon, ${Math.ceil(m.schedule.verificationReserveMs / MINUTE)} minutes réservées à la vérification. Budget restant : ${m.schedule.callBudget - m.usage.calls} appels. Ces durées imposent le périmètre, pas seulement la longueur du texte. Prépare une première version complète et utile tôt. Couvre les obligations explicites avant les compléments. Un brief vague demande des hypothèses réversibles et une réponse ciblée ; un brief détaillé demande une couverture fidèle. Pour un projet long, distingue le livrable du jalon courant et les validations terrain à organiser : ne prétends pas avoir réalisé des expériences en attendant. N'ajoute pas d'obligations inutiles.`;
}
export function recordMilestone(m, title, now = Date.now()) {
  if (!m.schedule) return;
  m.schedule.phase = title;
  m.schedule.milestones.push({
    title,
    at: new Date(now).toISOString(),
    files: m.files.length,
    calls: m.usage.calls,
  });
  m.schedule.milestones = m.schedule.milestones.slice(-60);
}
export function reviseDeadline(m, deadlineAt, now = Date.now()) {
  if (!m.schedule)
    fail('Legacy runs retain their original execution policy.', 'legacy_run');
  const next = Date.parse(deadlineAt);
  if (
    !Number.isFinite(next) ||
    next <= now + MINUTE ||
    next > now + 720 * 60 * MINUTE
  )
    throw Object.assign(
      new Error('Deadline must be within the next 30 days.'),
      { status: 400 },
    );
  m.schedule.deadlineChanges.push({
    from: m.schedule.deadlineAt,
    to: new Date(next).toISOString(),
    at: new Date(now).toISOString(),
  });
  m.schedule.deadlineAt = new Date(next).toISOString();
  return m.schedule;
}
