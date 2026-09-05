export const DRAFT_KEY = 'hackpilot-project-draft';
const DAY = 24 * 60 * 60 * 1000;

/** @returns {{brief: string, url: string, hours: string, callBudget?: string, provider: string, documents: import('./types').UploadedDocument[]}} */
export function emptyDraft() {
  return { brief: '', url: '', hours: '24', provider: 'auto', documents: [] };
}

// Browser drafts are untrusted and uploads still expire on the local server.
export function restoreDraft(serialized, now = Date.now()) {
  const fallback = { draft: emptyDraft(), expired: 0 };
  try {
    const raw = JSON.parse(serialized);
    if (raw?.version !== 1 || !raw.draft || typeof raw.draft !== 'object')
      return fallback;
    const saved = raw.draft;
    const text = (value, limit) =>
      typeof value === 'string' ? value.slice(0, limit) : '';
    const hours = Number(saved.hours);
    const documents = Array.isArray(saved.documents)
      ? saved.documents.slice(0, 3)
      : [];
    let expired = 0;
    const validDocuments = documents.filter((doc) => {
      if (!doc || typeof doc !== 'object') return false;
      const age = now - Date.parse(doc.createdAt);
      if (!Number.isFinite(age) || age < 0 || age >= DAY) {
        expired++;
        return false;
      }
      return (
        typeof doc.id === 'string' &&
        /^[a-f0-9-]{36}$/.test(doc.id) &&
        typeof doc.name === 'string' &&
        doc.name.length <= 255 &&
        typeof doc.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(doc.sha256) &&
        Number.isFinite(doc.bytes) &&
        doc.bytes > 0 &&
        doc.bytes <= 10 * 1024 * 1024 &&
        ['pdf', 'pptx', 'image'].includes(doc.format) &&
        Array.isArray(doc.warnings) &&
        doc.warnings.every((w) => typeof w === 'string') &&
        Array.isArray(doc.pages) &&
        doc.pages.length > 0 &&
        doc.pages.length <= 80 &&
        doc.pages.every(
          (page) =>
            page &&
            Number.isInteger(page.number) &&
            page.number > 0 &&
            typeof page.text === 'string' &&
            ['text', 'ocr'].includes(page.method),
        ) &&
        doc.pages.reduce((length, page) => length + page.text.length, 0) <=
          40000
      );
    });
    return {
      draft: {
        brief: text(saved.brief, 40000),
        url: text(saved.url, 2000),
        hours:
          Number.isFinite(hours) && hours >= 0.5 && hours <= 720
            ? String(hours)
            : '24',
        provider: ['auto', 'codex', 'demo'].includes(saved.provider)
          ? saved.provider
          : 'auto',
        documents: validDocuments,
        ...(saved.callBudget !== undefined
          ? {
              callBudget:
                Number.isInteger(Number(saved.callBudget)) &&
                Number(saved.callBudget) >= 8 &&
                Number(saved.callBudget) <= 72
                  ? String(saved.callBudget)
                  : '24',
            }
          : {}),
      },
      expired,
    };
  } catch {
    return fallback;
  }
}

export function serializeDraft(draft) {
  return JSON.stringify({ version: 1, draft });
}
