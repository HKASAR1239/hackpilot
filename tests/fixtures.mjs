import { zipSync, strToU8 } from 'fflate';
export function pdfFixture(
  pages = [
    'HACKATHON BRIEF\nBuild a working local project.',
    'JUDGING CRITERIA\nFunctionality 50 percent. Demo under 3 minutes.',
  ],
) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const kids = [];
  for (const text of pages) {
    const id = objects.length + 1;
    kids.push(id + ' 0 R');
    const stream =
      'BT /F1 20 Tf 50 720 Td ' +
      text
        .split('\n')
        .map(
          (line, i) =>
            (i ? '0 -35 Td ' : '') +
            '(' +
            line.replace(/[()\\]/g, '\\$&') +
            ') Tj',
        )
        .join('\n') +
      ' ET';
    objects.push(
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' +
        (id + 1) +
        ' 0 R >>',
      '<< /Length ' +
        Buffer.byteLength(stream) +
        ' >>\nstream\n' +
        stream +
        '\nendstream',
    );
  }
  objects[1] =
    '<< /Type /Pages /Count ' +
    pages.length +
    ' /Kids [' +
    kids.join(' ') +
    '] >>';
  let data = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(data));
    data += i + 1 + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(data);
  data +=
    'xref\n0 ' +
    (objects.length + 1) +
    '\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((x) => String(x).padStart(10, '0') + ' 00000 n \n')
      .join('') +
    'trailer\n<< /Size ' +
    (objects.length + 1) +
    ' /Root 1 0 R >>\nstartxref\n' +
    xref +
    '\n%%EOF';
  return Buffer.from(data);
}
export function pptxFixture() {
  const slide = (text) =>
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  const files = {
    '[Content_Types].xml':
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    '_rels/.rels':
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
    'ppt/presentation.xml':
      '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId r:id="rId1" id="257"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels':
      '<Relationships><Relationship Id="rId1" Target="slides/slide2.xml"/><Relationship Id="rId2" Target="slides/slide7.xml"/></Relationships>',
    'ppt/slides/slide7.xml': slide(
      'HACKATHON BRIEF: Build a useful app for shared equipment.',
    ),
    'ppt/slides/slide2.xml': slide(
      'JUDGING: Functionality &amp; design. Demo video under three minutes.',
    ),
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([key, value]) => [key, strToU8(value)]),
      ),
    ),
  );
}
export async function imageFixture() {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(1200, 500),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 1200, 500);
  ctx.fillStyle = 'black';
  ctx.font = '44px Arial';
  for (const [i, line] of [
    'HACKATHON DEMO DAY',
    'Build a working equipment lending app.',
    'Deadline: Friday at 18:00.',
    'Video length: three minutes maximum.',
  ].entries())
    ctx.fillText(line, 50, 90 + i * 85);
  return canvas.toBuffer('image/png');
}
