import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import PptxGenJS from 'pptxgenjs';
import { verifyCalculationChecks } from './calculation-checks.mjs';
import ExcelJS from 'exceljs';
import { unzipSync, strFromU8 } from 'fflate';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { deliverablesFor } from './schema.mjs';
import { calculateRows } from './calculations.mjs';

const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const text = (v, max = 12000) =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const refs = (ids, sources) =>
  Array.isArray(ids) &&
  ids.every((id) => sources.some((s) => s.id === id && s.text));
export function validateArtifacts(bundle, plan, sources) {
  const expected = deliverablesFor(plan).filter((d) => d.kind !== 'web');
  const artifacts = bundle.artifacts || [];
  if (
    !Array.isArray(artifacts) ||
    artifacts.length !== expected.length ||
    JSON.stringify(artifacts).length > 300000
  )
    throw new Error(
      'Les documents ne correspondent pas aux livrables attendus.',
    );
  const ids = new Set();
  for (const a of artifacts) {
    const d = expected.find((d) => d.id === a.id);
    if (
      !d ||
      ids.has(a.id) ||
      !text(a.title, 160) ||
      !Array.isArray(a.sections) ||
      !Array.isArray(a.slides) ||
      !Array.isArray(a.sheets)
    )
      throw new Error('Document invalide ou dupliqué.');
    ids.add(a.id);
    if (d.kind === 'analysis') {
      if (
        !a.sections.length ||
        a.sections.length > 30 ||
        a.slides.length ||
        a.sheets.length
      )
        throw new Error('Analyse vide ou format incorrect.');
      for (const s of a.sections)
        if (
          !text(s.heading, 160) ||
          !Array.isArray(s.paragraphs) ||
          !s.paragraphs.length ||
          s.paragraphs.length > 20 ||
          !s.paragraphs.every((p) => text(p, 4000)) ||
          !refs(s.sourceIds, sources)
        )
          throw new Error('Section ou référence invalide.');
    }
    if (d.kind === 'presentation') {
      if (
        !a.slides.length ||
        a.slides.length > 30 ||
        (d.count !== null && a.slides.length !== d.count) ||
        a.sections.length ||
        a.sheets.length
      )
        throw new Error(
          'Le nombre de slides ne correspond pas au livrable attendu.',
        );
      for (const s of a.slides)
        if (
          !text(s.title, 110) ||
          !Array.isArray(s.bullets) ||
          !s.bullets.length ||
          s.bullets.length > 5 ||
          !s.bullets.every((b) => text(b, 220)) ||
          s.bullets.join('').length > 750 ||
          typeof s.notes !== 'string' ||
          s.notes.length > 6000 ||
          !refs(s.sourceIds, sources)
        )
          throw new Error('Slide trop dense, vide ou référence invalide.');
    }
    if (d.kind === 'spreadsheet') {
      if (
        !a.sheets.length ||
        a.sheets.length > 8 ||
        a.sections.length ||
        a.slides.length
      )
        throw new Error('Classeur vide ou format incorrect.');
      const names = new Set();
      for (const s of a.sheets) {
        if (
          !text(s.name, 31) ||
          /[\\/?*[\]:]/.test(s.name) ||
          names.has(s.name.toLowerCase()) ||
          !Array.isArray(s.rows) ||
          !s.rows.length ||
          s.rows.length > 200
        )
          throw new Error('Feuille invalide.');
        names.add(s.name.toLowerCase());
        for (const r of s.rows)
          if (
            !text(r.label, 180) ||
            typeof r.formula !== 'string' ||
            r.formula.length > 600 ||
            typeof r.unit !== 'string' ||
            typeof r.assumption !== 'string' ||
            (r.sourceId && !refs([r.sourceId], sources)) ||
            (!r.formula && !r.sourceId && !text(r.assumption))
          )
            throw new Error(
              'Chaque donnée doit avoir une source ou une hypothèse explicite.',
            );
        calculateRows(s.rows);
      }
    }
  }
}
function citation(ids, sources) {
  return ids
    .map((id) => {
      const s = sources.find((s) => s.id === id);
      return `${id} — ${s.title}${s.url ? ' — ' + s.url : ''}`;
    })
    .join('\n');
}
export function artifactMarkdown(a, kind, sources, _en = false) {
  const lines = ['# ' + a.title, ''];
  if (kind === 'analysis')
    for (const s of a.sections)
      lines.push(
        '## ' + s.heading,
        '',
        ...s.paragraphs.flatMap((p) => [p, '']),
        citation(s.sourceIds, sources),
        '',
      );
  if (kind === 'presentation')
    for (const [i, s] of a.slides.entries())
      lines.push(
        `## ${i + 1}. ${s.title}`,
        '',
        ...s.bullets.map((p) => '- ' + p),
        '',
        s.notes,
        '',
        citation(s.sourceIds, sources),
        '',
      );
  if (kind === 'spreadsheet')
    for (const s of a.sheets) {
      const values = calculateRows(s.rows);
      lines.push('## ' + s.name, '');
      s.rows.forEach((r, i) =>
        lines.push(
          `${r.label}: ${values[i] === null ? '—' : values[i] * (r.unit === '%' ? 100 : 1)} ${r.unit}${r.formula ? ' (' + r.formula + ')' : ''}${r.assumption ? ' — ' + r.assumption : ''}${r.sourceId ? ' [' + r.sourceId + ']' : ''}`,
        ),
      );
      lines.push(
        '',
        citation(
          [...new Set(s.rows.map((r) => r.sourceId).filter(Boolean))],
          sources,
        ),
        '',
      );
    }
  return lines.join('\n');
}
function htmlDocument(a, kind, sources) {
  const body =
    kind === 'analysis'
      ? `<h1>${escape(a.title)}</h1>` +
        a.sections
          .map(
            (s) =>
              `<section><h2>${escape(s.heading)}</h2>${s.paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}<small>${escape(citation(s.sourceIds, sources))}</small></section>`,
          )
          .join('')
      : a.slides
          .map(
            (s, i) =>
              `<section class="slide"><h1>${escape(s.title)}</h1><ul>${s.bullets.map((b) => `<li>${escape(b)}</li>`).join('')}</ul><small>${escape(citation(s.sourceIds, sources))}</small><footer>${i + 1} / ${a.slides.length}</footer></section>`,
          )
          .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${kind === 'presentation' ? '13.333in 7.5in' : 'A4'};margin:${kind === 'presentation' ? '0' : '19mm'}}*{box-sizing:border-box}body{margin:0;color:#20242b;font-family:Arial,sans-serif;font-size:11pt;line-height:1.55}h1{font-size:27pt;line-height:1.15;margin:0 0 20pt}h2{font-size:16pt;margin:22pt 0 8pt;break-after:avoid}p{white-space:pre-wrap;orphans:3;widows:3;margin:0 0 10pt}small{display:block;font-size:8pt;line-height:1.5;color:#555;white-space:pre-wrap;overflow-wrap:anywhere}.slide{width:13.333in;height:7.5in;padding:.6in .75in;position:relative;break-after:page;overflow:hidden}.slide:last-child{break-after:auto}.slide h1{font-size:32pt;height:1.1in}.slide ul{margin:.35in 0 0;padding-left:.3in;font-size:22pt;line-height:1.35}.slide li{padding:0 0 .2in .06in}.slide small{position:absolute;bottom:.38in;left:.75in;right:1.2in;max-height:.55in;font-size:8pt}.slide footer{position:absolute;bottom:.38in;right:.65in;font-size:10pt;color:#555}</style></head><body>${body}</body></html>`;
}
export async function materializeArtifacts(
  bundle,
  plan,
  sources,
  dir,
  signal,
  locale = 'fr',
) {
  validateArtifacts(bundle, plan, sources);
  const files = [],
    metadata = [];
  let browser;
  const abort = () => browser?.close().catch(() => {});
  signal?.addEventListener('abort', abort, { once: true });
  try {
    for (const a of bundle.artifacts || []) {
      if (signal?.aborted) throw new Error('Mission interrompue.');
      const d = deliverablesFor(plan).find((d) => d.id === a.id),
        paths = [];
      const md = a.id + '.md';
      await writeFile(
        join(dir, md),
        artifactMarkdown(a, d.kind, sources, locale === 'en'),
      );
      paths.push(md);
      if (['analysis', 'presentation'].includes(d.kind)) {
        browser ||= await chromium.launch({ headless: true });
        const page = await browser.newPage({
          viewport: { width: 1280, height: 720 },
        });
        await page.route('**/*', (route) => route.abort());
        await page.setContent(htmlDocument(a, d.kind, sources));
        if (
          d.kind === 'presentation' &&
          (await page
            .locator('.slide')
            .evaluateAll((nodes) =>
              nodes.some(
                (n) =>
                  n.querySelector('ul').getBoundingClientRect().bottom >
                  n.querySelector('small').getBoundingClientRect().top - 12,
              ),
            ))
        )
          throw new Error(
            'Le texte dépasse une slide. Réduis la densité et place les détails dans les notes.',
          );
        const pdf = a.id + '.pdf';
        await page.pdf({
          path: join(dir, pdf),
          printBackground: true,
          preferCSSPageSize: true,
        });
        paths.push(pdf);
        await page.close();
      }
      if (d.kind === 'presentation') {
        const pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = 'HackPilot';
        pptx.subject = a.title;
        pptx.title = a.title;
        pptx.lang = locale === 'en' ? 'en-GB' : 'fr-FR';
        for (const [i, s] of a.slides.entries()) {
          const slide = pptx.addSlide();
          slide.background = { color: 'FFFFFF' };
          slide.addText(s.title, {
            x: 0.75,
            y: 0.6,
            w: 11.8,
            h: 1.1,
            fontFace: 'Arial',
            fontSize: 32,
            bold: true,
            color: '20242B',
            margin: 0,
            breakLine: false,
          });
          slide.addText(
            s.bullets.map((b) => ({
              text: b,
              options: { bullet: { indent: 22 }, hanging: 5, breakLine: true },
            })),
            {
              x: 0.75,
              y: 2.0,
              w: 11.8,
              h: 4.1,
              fontFace: 'Arial',
              fontSize: 22,
              paraSpaceAfterPt: 18,
              margin: 0,
              color: '20242B',
              valign: 'top',
            },
          );
          slide.addText(s.sourceIds.join(', '), {
            x: 0.75,
            y: 6.8,
            w: 10.8,
            h: 0.25,
            fontFace: 'Arial',
            fontSize: 9,
            color: '555555',
            margin: 0,
          });
          slide.addText(`${i + 1} / ${a.slides.length}`, {
            x: 11.85,
            y: 6.8,
            w: 0.75,
            h: 0.25,
            fontFace: 'Arial',
            fontSize: 10,
            color: '555555',
            margin: 0,
            align: 'right',
          });
          slide.addNotes(s.notes + '\n\n' + citation(s.sourceIds, sources));
        }
        const path = a.id + '.pptx';
        await pptx.writeFile({ fileName: join(dir, path) });
        paths.push(path);
      }
      if (d.kind === 'spreadsheet') {
        const wb = new ExcelJS.Workbook();
        wb.creator = 'HackPilot';
        wb.calcProperties.fullCalcOnLoad = true;
        for (const [index, s] of a.sheets.entries()) {
          const ws = wb.addWorksheet(s.name, {
            views: [{ state: 'frozen', ySplit: 1 }],
            pageSetup: {
              orientation: 'landscape',
              paperSize: 9,
              fitToPage: true,
              fitToWidth: 1,
              fitToHeight: 0,
              printTitlesRow: '1:1',
            },
          });
          ws.columns = [
            {
              header: locale === 'en' ? 'Item' : 'Élément',
              key: 'label',
              width: 45,
            },
            {
              header: locale === 'en' ? 'Value' : 'Valeur',
              key: 'value',
              width: 20,
            },
            {
              header: locale === 'en' ? 'Unit' : 'Unité',
              key: 'unit',
              width: 16,
            },
            { header: 'Source', key: 'source', width: 42 },
            {
              header:
                locale === 'en' ? 'Assumption / method' : 'Hypothèse / méthode',
              key: 'note',
              width: 65,
            },
          ];
          const values = calculateRows(s.rows);
          for (const [i, r] of s.rows.entries()) {
            const row = ws.addRow([
              r.label,
              r.formula
                ? { formula: r.formula.replace(/^=/, ''), result: values[i] }
                : r.value,
              r.unit,
              r.sourceId ? citation([r.sourceId], sources) : '',
              r.assumption,
            ]);
            row.height = Math.min(
              409,
              Math.max(
                46,
                16 *
                  Math.max(
                    Math.ceil(r.label.length / 40),
                    Math.ceil(r.assumption.length / 60),
                    Math.ceil(
                      (r.sourceId
                        ? citation([r.sourceId], sources).length
                        : 0) / 38,
                    ),
                  ) +
                  12,
              ),
            );
            row.alignment = { vertical: 'middle', wrapText: true };
            row.font = { name: 'Arial', size: 11 };
            row.getCell(2).numFmt = r.unit === '%' ? '0.0%' : '#,##0.00';
            row.getCell(2).font = {
              name: 'Arial',
              size: 11,
              color: { argb: r.formula ? 'FF20242B' : 'FF2457B2' },
            };
          }
          ws.getRow(1).height = 30;
          ws.getRow(1).font = {
            name: 'Arial',
            size: 11,
            bold: true,
            color: { argb: 'FFFFFFFF' },
          };
          ws.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF20242B' },
          };
          ws.autoFilter = `A1:E${s.rows.length + 1}`;
          const csv = a.id + '-' + (index + 1) + '.csv';
          const safeCSV = (value) =>
            '"' +
            String(value)
              .replace(/^[=+@-]/, "'$&")
              .replace(/"/g, '""') +
            '"';
          const rows = [
            [
              locale === 'en' ? 'Item' : 'Élément',
              locale === 'en' ? 'Value' : 'Valeur',
              locale === 'en' ? 'Unit' : 'Unité',
              'Source',
              locale === 'en' ? 'Assumption' : 'Hypothèse',
            ],
            ...s.rows.map((r, i) => [
              r.label,
              values[i] === null ? '' : values[i] * (r.unit === '%' ? 100 : 1),
              r.unit,
              r.sourceId,
              r.assumption,
            ]),
          ];
          await writeFile(
            join(dir, csv),
            '\uFEFF' +
              rows
                .map((r) =>
                  r
                    .map((v) =>
                      typeof v === 'number' ? String(v) : safeCSV(v),
                    )
                    .join(','),
                )
                .join('\r\n'),
          );
          paths.push(csv);
        }
        const path = a.id + '.xlsx';
        await wb.xlsx.writeFile(join(dir, path));
        paths.push(path);
      }
      files.push(...paths);
      metadata.push({
        id: a.id,
        title: a.title,
        kind: d.kind,
        files: paths,
        preview: md,
      });
    }
    return { files, metadata };
  } finally {
    signal?.removeEventListener('abort', abort);
    await browser?.close();
  }
}
export async function verifyArtifacts(
  bundle,
  plan,
  sources,
  dir,
  calculationChecks = [],
) {
  const results = [];
  for (const a of bundle.artifacts || []) {
    const d = deliverablesFor(plan).find((d) => d.id === a.id);
    const evidence = [];
    try {
      const md = await readFile(join(dir, a.id + '.md'), 'utf8');
      if (md !== artifactMarkdown(a, d.kind, sources))
        throw new Error(
          'Le document enregistré ne correspond pas au contenu généré.',
        );
      if (d.kind === 'presentation') {
        const zip = unzipSync(
          new Uint8Array(await readFile(join(dir, a.id + '.pptx'))),
        );
        const slides = Object.keys(zip).filter((p) =>
          /^ppt\/slides\/slide\d+\.xml$/.test(p),
        );
        if (
          slides.length !== a.slides.length ||
          slides.some((p) => !strFromU8(zip[p]).includes('<a:t>'))
        )
          throw new Error('PowerPoint incomplet.');
      }
      if (['presentation', 'analysis'].includes(d.kind)) {
        const task = getDocument({
          data: new Uint8Array(await readFile(join(dir, a.id + '.pdf'))),
          useSystemFonts: true,
          isEvalSupported: false,
        });
        try {
          const pdf = await task.promise;
          if (
            !pdf.numPages ||
            (d.kind === 'presentation' && pdf.numPages !== a.slides.length)
          )
            throw new Error('Nombre de pages PDF incorrect.');
          for (let i = 1; i <= pdf.numPages; i++) {
            const p = await pdf.getPage(i),
              t = await p.getTextContent();
            if (!t.items.some((x) => x.str?.trim()))
              throw new Error('Page PDF vide.');
          }
        } finally {
          await task.destroy();
        }
      }
      if (d.kind === 'spreadsheet') {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(join(dir, a.id + '.xlsx'));
        for (const s of a.sheets) {
          const ws = wb.getWorksheet(s.name),
            values = calculateRows(s.rows);
          evidence.push({
            sheet: s.name,
            headers: ws?.getRow(1).values,
            cells: s.rows.map((r, i) => ({
              label: r.label,
              cell: 'B' + (i + 2),
              value: ws?.getCell('B' + (i + 2)).value,
            })),
          });
          for (const [i, r] of s.rows.entries()) {
            const cell = ws?.getCell('B' + (i + 2));
            if ((r.formula ? cell?.result : cell?.value) !== values[i])
              throw new Error(
                'Résultat Excel incohérent en B' +
                  (i + 2) +
                  ': ' +
                  JSON.stringify(cell?.value) +
                  ' ; attendu ' +
                  values[i],
              );
            if (r.formula && cell.formula !== r.formula.replace(/^=/, ''))
              throw new Error('Formule Excel manquante.');
          }
        }
      }
      results.push({
        name: d.title,
        deliverableIds: [d.id],
        passed: true,
        evidence,
        detail:
          d.kind === 'spreadsheet'
            ? 'Fichier Excel relu ; formules recalculées et résultats conservés vérifiés.'
            : 'Fichiers relus ; contenu et pages contrôlés.',
      });
    } catch (e) {
      results.push({
        name: d.title,
        deliverableIds: [d.id],
        passed: false,
        detail: e.message,
      });
    }
  }
  results.push(
    ...(await verifyCalculationChecks(calculationChecks, bundle, dir)),
  );
  return { passed: results.every((r) => r.passed), screenshot: false, results };
}
