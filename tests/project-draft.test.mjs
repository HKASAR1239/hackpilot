import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDraft,
  restoreDraft,
  serializeDraft,
} from '../lib/project-draft.mjs';

const now = Date.parse('2026-09-05T12:00:00Z');
const document = () => ({
  id: '8a1768af-2713-4c91-9a51-3b0155cc290c',
  name: 'brief.pdf',
  sha256: 'a'.repeat(64),
  bytes: 2000,
  format: 'pdf',
  createdAt: new Date(now - 1000).toISOString(),
  pages: [
    { number: 1, text: 'Deliver an analysis and 4 slides.', method: 'text' },
  ],
  warnings: [],
});
test('restores a brief and unexpired source documents without changing the input', () => {
  const draft = {
    brief: 'Study the repair-service launch.',
    url: 'https://example.org/brief',
    hours: '1',
    provider: 'codex',
    documents: [document()],
  };
  assert.deepEqual(restoreDraft(serializeDraft(draft), now), {
    draft,
    expired: 0,
  });
});
test('drops expired uploads but keeps the assignment and generation settings', () => {
  const doc = document();
  doc.createdAt = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const draft = {
    ...emptyDraft(),
    brief: 'Keep this assignment.',
    documents: [doc],
  };
  const restored = restoreDraft(serializeDraft(draft), now);
  assert.equal(restored.expired, 1);
  assert.equal(restored.draft.brief, draft.brief);
  assert.deepEqual(restored.draft.documents, []);
});
test('recovers from corrupt storage and ignores malformed cached documents', () => {
  for (const value of ['bad json', 'null', '{"version":99}', '{}']) {
    assert.deepEqual(restoreDraft(value, now).draft, emptyDraft());
  }
  const restored = restoreDraft(
    serializeDraft({
      brief: 'x'.repeat(40001),
      url: {},
      hours: '0',
      provider: 'other',
      documents: [
        { ...document(), pages: [null] },
        { ...document(), id: '../../file' },
      ],
    }),
    now,
  );
  assert.equal(restored.draft.brief.length, 40000);
  assert.equal(restored.draft.url, '');
  assert.equal(restored.draft.hours, '24');
  assert.equal(restored.draft.provider, 'auto');
  assert.deepEqual(restored.draft.documents, []);
});
