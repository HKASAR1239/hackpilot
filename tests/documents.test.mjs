import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  extractDocument,
  Documents,
  MAX_FILE_BYTES,
} from '../engine/documents.mjs';
import { collectSources } from '../engine/sources.mjs';
import { normalizePlan } from '../engine/schema.mjs';
import { fixturePlan } from '../engine/fixture.mjs';
import { pdfFixture, pptxFixture, imageFixture } from './fixtures.mjs';
test('PDF: extrait les pages dans l’ordre', async () => {
  const d = await extractDocument(pdfFixture(), 'brief.pdf');
  assert.equal(d.pages.length, 2);
  assert.match(d.pages[0].text, /HACKATHON BRIEF/);
  assert.match(d.pages[1].text, /50 percent/);
  assert.equal(d.pages[0].method, 'text');
});
test('PPTX: respecte l’ordre déclaré des slides et décode les caractères', async () => {
  const d = await extractDocument(pptxFixture(), 'brief.pptx');
  assert.equal(d.pages.length, 2);
  assert.match(d.pages[0].text, /HACKATHON BRIEF/);
  assert.match(d.pages[1].text, /Functionality & design/);
  assert.ok(d.warnings.includes('pptx_visuals'));
});
test('PNG: reconnaît le texte localement', async () => {
  const d = await extractDocument(await imageFixture(), 'slide.png');
  assert.match(d.pages[0].text, /HACKATHON DEMO DAY/);
  assert.match(d.pages[0].text, /18:00/);
  assert.equal(d.pages[0].method, 'ocr');
  assert.ok(d.warnings.includes('ocr_review'));
});
test('refuse format, fichier corrompu, taille excessive et document vide', async () => {
  await assert.rejects(extractDocument(Buffer.from('bad'), 'brief.exe'), {
    code: 'format',
  });
  await assert.rejects(extractDocument(Buffer.from('bad'), 'brief.pdf'), {
    code: 'invalid_document',
  });
  await assert.rejects(
    extractDocument(Buffer.alloc(MAX_FILE_BYTES + 1), 'brief.pdf'),
    { code: 'file_size' },
  );
  await assert.rejects(
    extractDocument(pdfFixture(Array(81).fill('page')), 'brief.pdf'),
    { code: 'page_limit' },
  );
});
test('conserve les documents et leurs citations après rechargement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hp-doc-'));
  try {
    const a = new Documents(root);
    await a.init();
    const doc = await a.add(pptxFixture(), 'brief.pptx');
    const b = new Documents(root);
    await b.init();
    const restored = await b.resolve([doc.id]);
    const sources = await collectSources({
      brief: '',
      url: '',
      documents: restored,
    });
    assert.equal(sources.length, 2);
    assert.equal(sources[1].page, 2);
    assert.equal(sources[1].documentId, doc.id);
    const p = fixturePlan();
    p.requirements = [
      {
        id: 'video',
        text: 'Video under three minutes',
        kind: 'mandatory',
        sourceId: sources[1].id,
        quote: 'Demo video under three minutes.',
      },
    ];
    assert.equal(normalizePlan(p, sources).requirements[0].verified, true);
    await assert.rejects(b.resolve(['../invalid']), {
      code: 'document_missing',
    });
    await assert.rejects(b.resolve([doc.id, doc.id]), {
      code: 'document_count',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
