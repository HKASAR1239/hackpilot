import { parentPort, workerData } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
const require = createRequire(import.meta.url);
const MAX_PAGES = 80,
  MAX_TEXT = 40000;
function fail(code) {
  throw Object.assign(new Error(code), { code });
}
function clean(text) {
  return text
    .replaceAll(String.fromCharCode(0), '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
let ocr;
async function recognize(bytes) {
  if (!ocr) {
    const { createWorker } = await import('tesseract.js');
    // Language data ships as npm dependencies; no remote OCR or model download.
    const { copyFile } = await import('node:fs/promises');
    await Promise.all(
      ['eng', 'fra'].map((code) =>
        copyFile(
          join(
            dirname(require.resolve('@tesseract.js-data/' + code)),
            '4.0.0_best_int',
            code + '.traineddata.gz',
          ),
          join(workerData.tempDir, code + '.traineddata.gz'),
        ),
      ),
    );
    ocr = await createWorker('eng+fra', 1, {
      langPath: workerData.tempDir,
      cacheMethod: 'none',
    });
  }
  const { data } = await ocr.recognize(Buffer.from(bytes));
  return clean(data.text);
}
async function imageText(data) {
  const { loadImage, createCanvas } = require('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(data));
  if (!image.width || !image.height || image.width * image.height > 16000000)
    fail('image_size');
  const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
  const canvas = createCanvas(
    Math.ceil(image.width * scale),
    Math.ceil(image.height * scale),
  );
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return recognize(canvas.toBuffer('image/png'));
}
async function pdf(data) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const base = dirname(require.resolve('pdfjs-dist/package.json'));
  const loading = getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    standardFontDataUrl: join(base, 'standard_fonts') + '/',
    cMapUrl: join(base, 'cmaps') + '/',
    cMapPacked: true,
    wasmUrl: join(base, 'wasm') + '/',
    verbosity: 0,
  });
  let doc;
  try {
    doc = await loading.promise;
    if (doc.numPages > MAX_PAGES) fail('page_limit');
    const pages = [];
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number),
        content = await page.getTextContent();
      let text = clean(
        content.items
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
          )
          .join(''),
      );
      let method = 'text';
      if (text.length < 25) {
        const { createCanvas } = require('@napi-rs/canvas');
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({
          scale: Math.min(2, 1800 / Math.max(natural.width, natural.height)),
        });
        const canvas = createCanvas(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        await page.render({ canvasContext: canvas.getContext('2d'), viewport })
          .promise;
        text = await recognize(canvas.toBuffer('image/png'));
        method = 'ocr';
      }
      pages.push({ number, text, method });
      page.cleanup();
    }
    return { pages, warnings: [], format: 'pdf' };
  } catch (e) {
    if (e.name === 'PasswordException') fail('password');
    throw e;
  } finally {
    await loading.destroy();
  }
}
function xml(bytes) {
  const text = strFromU8(bytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('invalid_document');
  return new XMLParser({
    ignoreAttributes: false,
    transformTagName: (name) => name.split(':').pop(),
    parseTagValue: false,
    processEntities: true,
  }).parse(text);
}
function array(value) {
  return value == null ? [] : Array.isArray(value) ? value : [value];
}
function texts(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    if (key === 't')
      for (const v of array(value))
        out.push(typeof v === 'object' ? String(v['#text'] || '') : String(v));
    else if (!key.startsWith('@')) for (const v of array(value)) texts(v, out);
  }
  return out;
}
function relationPath(base, target) {
  if (
    typeof target !== 'string' ||
    target.includes('\\') ||
    target.startsWith('/') ||
    /^[a-z]+:/i.test(target)
  )
    return null;
  const path = posix.normalize(posix.join(posix.dirname(base), target));
  return path.startsWith('ppt/') ? path : null;
}
async function pptx(data) {
  let expanded = 0,
    entries = 0;
  const zip = unzipSync(data, {
    filter: (entry) => {
      if (++entries > 3000) fail('expanded_limit');
      // Decompress only presentation XML and slide XML; never execute attachments.
      const keep =
        /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml)$/.test(
          entry.name,
        );
      if (keep) {
        expanded += entry.originalSize;
        if (entry.originalSize > 2000000 || expanded > 16000000)
          fail('expanded_limit');
      }
      return keep;
    },
  });
  if (!zip['ppt/presentation.xml'] || !zip['ppt/_rels/presentation.xml.rels'])
    fail('invalid_document');
  const rels = array(
    xml(zip['ppt/_rels/presentation.xml.rels']).Relationships?.Relationship,
  );
  const slides = array(
    xml(zip['ppt/presentation.xml']).presentation?.sldIdLst?.sldId,
  );
  if (!slides.length) fail('no_text');
  if (slides.length > MAX_PAGES) fail('page_limit');
  const pages = slides.map((slide, index) => {
    const rel = rels.find((r) => r['@_Id'] === slide['@_r:id']);
    const path =
      rel && rel['@_TargetMode'] !== 'External'
        ? relationPath('ppt/presentation.xml', rel['@_Target'])
        : null;
    if (!path || !zip[path]) fail('invalid_document');
    return {
      number: index + 1,
      text: clean(texts(xml(zip[path])).join('\n')),
      method: 'text',
    };
  });
  return { pages, format: 'pptx', warnings: ['pptx_visuals'] };
}
try {
  const data = new Uint8Array(workerData.data),
    ext = workerData.ext;
  let result;
  if (ext === 'pdf') {
    if (Buffer.from(data.subarray(0, 1024)).indexOf('%PDF-') < 0)
      fail('invalid_document');
    result = await pdf(data);
  } else if (ext === 'pptx') {
    if (data[0] !== 80 || data[1] !== 75) fail('invalid_document');
    result = await pptx(data);
  } else {
    const png =
      data[0] === 137 && Buffer.from(data.subarray(1, 4)).toString() === 'PNG';
    const jpeg = data[0] === 255 && data[1] === 216;
    if (!((ext === 'png' && png) || (['jpg', 'jpeg'].includes(ext) && jpeg)))
      fail('invalid_document');
    result = {
      pages: [{ number: 1, text: await imageText(data), method: 'ocr' }],
      format: 'image',
      warnings: [],
    };
  }
  let total = 0;
  result.pages = result.pages.map((page) => {
    const text = page.text.slice(0, Math.max(0, MAX_TEXT - total));
    if (text.length < page.text.length) result.warnings.push('text_limit');
    total += text.length;
    return { ...page, text };
  });
  if (total < 30) fail('no_text');
  if (result.pages.some((page) => !page.text))
    result.warnings.push('empty_pages');
  if (result.pages.some((page) => page.method === 'ocr'))
    result.warnings.push('ocr_review');
  result.warnings = [...new Set(result.warnings)];
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({ ok: false, code: error.code || 'invalid_document' });
} finally {
  if (ocr) await ocr.terminate();
}
