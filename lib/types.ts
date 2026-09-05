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
  review?: { summary: string; gaps: string[] };
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
