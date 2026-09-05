export type MissionSummary = {
  id: string;
  name: string;
  status: string;
  provider: string;
  createdAt: string;
};
export type Idea = {
  id: string;
  title: string;
  concept: string;
  reason: string;
};
export type Mission = MissionSummary & {
  workflowVersion?: number;
  selection?: {
    selectedId: string;
    options: {
      ideaId: string;
      feasible: boolean;
      risk: string;
      ratings: {
        criterionId: string;
        score: number | null;
        evidence: string;
      }[];
    }[];
  };
  usage?: { calls: number; input: number; output: number };
  schedule?: {
    deadlineAt: string;
    startedAt: string | null;
    milestoneAt?: string;
    callBudget: number;
    verificationReserveMs: number;
    phase: string;
    milestones: { title: string; at: string; files: number; calls: number }[];
    decisions: {
      at: string;
      action: string;
      detail: string;
      estimatedMinutes?: number;
    }[];
  };
  rubric?: {
    mode: string;
    hash: string;
    frozenAt: string;
    uncertainties: string[];
    criteria: {
      id: string;
      label: string;
      sourceId: string;
      quote: string;
      weight: number | null;
      weightQuote: string;
      origin: string;
    }[];
  };
  jury?: {
    summary: string;
    score: number | null;
    method: string;
    at: string;
    checks: {
      criterionId: string;
      status: string;
      score: number | null;
      evidence: { path: string; detail: string }[];
      gap: string;
    }[];
    improvements: {
      criterionIds: string[];
      deliverableIds: string[];
      detail: string;
      estimatedMinutes: number;
      impact: string;
    }[];
  };
  contributions?: {
    id: string;
    kind: string;
    text: string;
    author: string;
    createdAt: string;
    status: string;
    result?: string;
    actualTargets?: string[];
    assessment?: {
      reason: string;
      estimatedMinutes: number;
      risks: string[];
      confidence: string;
      decision: string;
      checks: { criterionId: string; evidence: string }[];
    };
    comparison?: { reason: string; promoted: boolean; confidence: string };
  }[];
  lastVerified?: { id: string; at: string; files: string[]; complete: boolean };
  verifiedVersions?: {
    id: string;
    at: string;
    files: string[];
    complete: boolean;
  }[];
  trial?: { contributionId: string; startedAt: string };
  startedAt?: string;
  completedAt?: string;
  files: string[];
  artifacts?: {
    id: string;
    title: string;
    kind: string;
    files: string[];
    preview: string;
  }[];
  repairs: number;
  previewUrl?: string | null;
  error?: string | null;
  submission?: string;
  stages: { name: string; status: string }[];
  events: { at: string; level: string; message: string }[];
  sources: {
    id: string;
    title: string;
    url: string | null;
    text: string;
    error?: string;
    documentId?: string;
    page?: number;
    method?: string;
    warnings?: string[];
  }[];
  plan?: {
    deliverables?: {
      id: string;
      title: string;
      kind: string;
      reason: string;
      count: number | null;
    }[];
    summary: string;
    ideas: Idea[];
    selectedId: string;
    unknowns: string[];
    criteria: {
      id: string;
      label: string;
      weight: number | null;
      verified: boolean;
      sourceId: string;
      origin?: string;
    }[];
    requirements: {
      id: string;
      kind: string;
      text: string;
      sourceId: string;
    }[];
  };
  tests?: {
    results: { name: string; passed: boolean; detail: string }[];
    screenshot: boolean;
  };
  activity?: { title: string; at: string };
  currentCall?: {
    timeoutMs?: number;
    purpose: string;
    reasoningEffort: string;
    status: string;
    startedAt: string;
    lastEventAt?: string | null;
    endedAt?: string;
    error?: string;
    errors?: string[];
    stopReason?: string;
  };
  production?: {
    checkpoints: Record<string, { status: string; createdAt: string }>;
  };
  design?: {
    recommendation: string;
    alternatives: {
      approach: string;
      benefit: string;
      tradeoff: string;
      decision: string;
    }[];
    facts: { id: string; statement: string; sourceId: string; quote: string }[];
    assumptions: {
      id: string;
      statement: string;
      impact: string;
      validation: string;
    }[];
    acceptanceCriteria: {
      id: string;
      criterion: string;
      evidence: string;
      deliverableIds: string[];
    }[];
  };
  review?: {
    summary: string;
    gaps: string[];
    checks?: {
      criterionId: string;
      status: string;
      evidence: string;
      deliverableIds: string[];
    }[];
  };
};
export type Health = { ok: boolean; providers: { codex: boolean } };
export type UploadedDocument = {
  id: string;
  name: string;
  bytes: number;
  createdAt: string;
  sha256: string;
  format: 'pdf' | 'pptx' | 'image';
  pages: { number: number; text: string; method: 'text' | 'ocr' }[];
  warnings: string[];
};
