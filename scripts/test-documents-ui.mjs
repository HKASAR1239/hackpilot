import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pdfFixture, pptxFixture, imageFixture } from '../tests/fixtures.mjs';
import { extractDocument } from '../engine/documents.mjs';
const base = process.env.HACKPILOT_URL || 'http://127.0.0.1:4317';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
const page = await context.newPage();
const checks = [],
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.setDefaultTimeout(12000);
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('#language').selectOption('en');
  await page
    .getByRole('heading', { name: 'New project', exact: true })
    .waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByRole('heading', { name: 'New project', exact: true })
    .waitFor();
  assert.equal(await page.locator('#language').inputValue(), 'en');
  checks.push('English interface, document language and saved preference');
  await page.locator('#document-files').setInputFiles([
    { name: 'brief.pdf', mimeType: 'application/pdf', buffer: pdfFixture() },
    {
      name: 'rules.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: pptxFixture(),
    },
  ]);
  await page
    .locator('.uploaded-document')
    .filter({ hasText: 'rules.pptx' })
    .waitFor();
  assert.equal(await page.locator('.uploaded-document').count(), 2);
  await page
    .locator('.uploaded-document')
    .filter({ hasText: 'brief.pdf' })
    .getByRole('button', { name: 'View extracted text' })
    .click();
  await page
    .locator('.extracted-pages')
    .getByText('JUDGING CRITERIA', { exact: false })
    .waitFor();
  checks.push(
    'PDF and PPTX uploaded with separate numbered pages and readable extraction',
  );
  await page.locator('#language').selectOption('fr');
  await page
    .getByRole('heading', { name: 'Nouveau projet', exact: true })
    .waitFor();
  assert.equal(await page.locator('.uploaded-document').count(), 2);
  await page.locator('#language').selectOption('en');
  checks.push('Language switching preserves uploaded documents and the brief');
  const png = await imageFixture();
  await page
    .locator('#document-files')
    .setInputFiles({ name: 'slide.png', mimeType: 'image/png', buffer: png });
  await page
    .locator('.uploaded-document')
    .filter({ hasText: 'slide.png' })
    .waitFor();
  assert.equal(await page.locator('.upload-zone').isDisabled(), true);
  checks.push('Image upload uses OCR; three-file limit enforced in UI');
  await page
    .getByRole('button', { name: 'Remove document slide.png', exact: true })
    .click();
  assert.equal(await page.locator('.uploaded-document').count(), 2);
  await page.locator('#document-files').setInputFiles({
    name: 'invalid.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  });
  await page
    .getByText('Unsupported format. Use PDF, PPTX, PNG or JPEG.')
    .waitFor();
  checks.push('Removal and unsupported file errors');
  await page.screenshot({
    path: 'validation/uploads-desktop-en.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    ),
    false,
  );
  await page.screenshot({
    path: 'validation/uploads-mobile-en.png',
    fullPage: true,
  });
  checks.push('Upload form and language selector fit a mobile screen');
  await page.setViewportSize({ width: 1440, height: 1050 });
  const payload = {
    brief: '',
    url: '',
    provider: 'demo',
    hours: 24,
    locale: 'en',
  };
  const forged = await fetch(base + '/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      documents: [
        { pages: [{ text: 'A forged document must never be trusted.' }] },
      ],
    }),
  });
  assert.equal(forged.status, 400);
  const missing = await fetch(base + '/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      documentIds: ['00000000-0000-0000-0000-000000000000'],
    }),
  });
  assert.equal(missing.status, 400);
  checks.push(
    'Server rejects missing IDs and client-supplied extracted content',
  );
  await page.getByRole('button', { name: /Generation settings/ }).click();
  await page.locator('#provider').selectOption('demo');
  assert.equal(await page.locator('#brief').inputValue(), '');
  assert.equal(
    await page
      .getByRole('button', { name: 'Create project', exact: true })
      .isEnabled(),
    true,
  );
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/missions') && r.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Create project', exact: true })
    .click();
  const mission = await (await created).json();
  await page
    .getByText('Prototype verified', { exact: true })
    .waitFor({ timeout: 60000 });
  const m = await (await fetch(base + '/api/missions/' + mission.id)).json();
  assert.equal(m.input.locale, 'en');
  assert.equal(m.input.documents.length, 2);
  assert.equal(m.sources.filter((s) => s.documentId).length, 4);
  assert.equal(m.sources[1].page, 2);
  assert.equal(m.tests.passed, true);
  assert.match(m.submission, /## Known limitations/);
  checks.push(
    'Document-only project completes and retains four page sources and English delivery headings',
  );
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('.source-excerpt').first().locator('summary').click();
  await page
    .locator('.source-excerpt')
    .first()
    .getByText('HACKATHON BRIEF', { exact: false })
    .waitFor();
  checks.push(
    'Extracted evidence remains accessible from the completed project',
  );
  // Scanned PDF exercises the actual PDF render + OCR path, not text extraction.
  const scan = await context.newPage();
  await scan.setContent(
    '<img style="width:1100px" src="data:image/png;base64,' +
      png.toString('base64') +
      '">',
  );
  await scan.locator('img').evaluate((img) => img.decode());
  const scanned = await scan.pdf({
    width: '1200px',
    height: '540px',
    printBackground: true,
  });
  await scan.close();
  const read = await extractDocument(scanned, 'scan.pdf');
  assert.equal(read.pages[0].method, 'ocr');
  assert.match(read.pages[0].text, /HACKATHON DEMO DAY/);
  checks.push('Scanned PDF renders and recognizes text locally');
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const image = await loadImage(png),
    canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const jpeg = await extractDocument(
    canvas.toBuffer('image/jpeg'),
    'capture.jpg',
  );
  assert.match(jpeg.pages[0].text, /HACKATHON DEMO DAY/);
  checks.push('JPEG screenshots recognized locally');
  assert.deepEqual(errors, []);
  checks.push('No JavaScript exception in the interface');
  await writeFile(
    'validation/documents-ui-result.json',
    JSON.stringify(
      {
        passed: true,
        at: new Date().toISOString(),
        checks,
        mission: mission.id,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: true, count: checks.length, checks }, null, 2),
  );
} catch (error) {
  await page.screenshot({
    path: 'validation/documents-ui-failure.png',
    fullPage: true,
  });
  console.error(error);
  process.exitCode = 1;
  await writeFile(
    'validation/documents-ui-result.json',
    JSON.stringify(
      { passed: false, checks, error: error.message, errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
