import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';
import { caseBrief } from '../tests/case-fixture.mjs';
const base = process.env.HACKPILOT_URL || 'http://127.0.0.1:4317';
let first;
if (process.env.HACKPILOT_MISSION_ID)
  first = { id: process.env.HACKPILOT_MISSION_ID };
else {
  const response = await fetch(base + '/api/missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      brief: caseBrief,
      url: '',
      hours: 1,
      provider: 'codex',
      locale: 'fr',
    }),
  });
  first = await response.json();
  if (!response.ok) throw new Error(first.error);
}
console.log('Étude de cas réelle : ' + first.id);
let m, last;
while (true) {
  m = await (await fetch(base + '/api/missions/' + first.id)).json();
  const event = m.events.at(-1)?.message;
  if (event !== last) {
    console.log(m.status + ' — ' + event);
    last = event;
  }
  if (!['queued', 'running'].includes(m.status)) break;
  await new Promise((r) => setTimeout(r, 5000));
}
await mkdir('validation', { recursive: true });
await writeFile(
  'validation/live-case-result.json',
  JSON.stringify(
    {
      id: m.id,
      status: m.status,
      error: m.error,
      plan: m.plan,
      files: m.files,
      tests: m.tests,
      review: m.review,
      repairs: m.repairs,
      usage: m.usage,
    },
    null,
    2,
  ),
);
assert.equal(m.status, 'completed', m.error);
for (const kind of ['analysis', 'presentation', 'spreadsheet']) {
  assert(
    m.plan.deliverables.some((d) => d.kind === kind),
    'Livrable imposé manquant : ' + kind,
  );
}
const web = m.plan.deliverables.some((d) => d.kind === 'web');
if (web)
  assert(m.plan.deliverables.find((d) => d.kind === 'web').reason.trim());
assert.equal(m.plan.ideas.length, 1);
assert.equal(
  m.plan.deliverables.find((d) => d.kind === 'presentation').count,
  4,
);
assert.equal(Boolean(m.previewUrl), web);
assert.equal(
  m.files.some((f) => /\.(html|css|js)$/.test(f)),
  web,
);
const exported = await fetch(base + '/api/missions/' + m.id + '/export');
const bytes = new Uint8Array(await exported.arrayBuffer());
const zip = unzipSync(bytes);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(zip[m.files.find((f) => f.endsWith('.xlsx'))]);
const values = [];
wb.eachSheet((s) =>
  s.eachRow((r) =>
    r.eachCell((c) => {
      const v = c.formula ? c.result : c.value;
      if (typeof v === 'number') values.push(v);
    }),
  ),
);
for (const n of [240, -4500, 4500])
  assert(
    values.some((v) => Math.abs(v - n) < 1e-8),
    'Résultat attendu absent : ' + n,
  );
await writeFile('validation/case-study.zip', bytes);
console.log(
  'Vérifié : analyse + 4 slides + Excel, compléments conformes au plan, seuil et scénarios corrects.',
);
