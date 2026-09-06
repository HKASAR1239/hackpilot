// Read exported CSV independently of the writer, including quoted multiline text.
export function parseCSV(text) {
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field);
      field = '';
      if (c !== ',') {
        rows.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else field += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
const decoded = (value) => value.replace(/^'(?=[=+@-])/, '');
export function checkCSV(text, worksheet, rows, path) {
  const csv = parseCSV(text);
  if (csv.length !== rows.length + 1 || csv.some((r) => r.length !== 5))
    throw new Error('CSV dimensions differ from the workbook: ' + path);
  for (let i = 0; i < rows.length; i++) {
    const row = csv[i + 1],
      source = rows[i],
      cell = worksheet.getCell('B' + (i + 2));
    const actual = cell.formula ? cell.result : cell.value;
    const expected =
      actual === null || actual === undefined
        ? ''
        : actual * (source.unit === '%' ? 100 : 1);
    if (row[1] !== String(expected))
      throw new Error(
        'CSV value differs from the workbook: ' + path + ':' + (i + 2),
      );
    for (const [col, value] of [
      [0, source.label],
      [2, source.unit],
      [3, source.sourceId],
      [4, source.assumption],
    ])
      if (decoded(row[col]) !== String(value))
        throw new Error(
          'CSV metadata differs from the workbook: ' + path + ':' + (i + 2),
        );
  }
  return {
    path,
    rowsRead: rows.length,
    columns: 5,
    valuesMatchWorkbook: true,
    percentageConvention:
      'Percentage values are exported as percentage points; workbook cells store fractions.',
  };
}
