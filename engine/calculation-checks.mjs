import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { calculateRows } from './calculations.mjs';
const str = { type: 'string' };
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const values = {
  type: 'array',
  items: object({ label: str, value: { type: 'number' } }),
  minItems: 1,
  maxItems: 10,
};
export const calculationChecksSchema = {
  type: 'array',
  maxItems: 12,
  items: object({
    id: str,
    deliverableId: str,
    sheet: str,
    description: str,
    inputs: values,
    expected: { ...values, maxItems: 20 },
  }),
};
export const verificationPlanSchema = object({
  calculationChecks: calculationChecksSchema,
});
const close = (actual, expected) =>
  typeof actual === 'number' &&
  Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected));
function rowIndex(rows, label) {
  const found = rows.flatMap((r, i) => (r.label === label ? [i] : []));
  if (found.length !== 1)
    throw new Error('Calculation check needs a unique row label: ' + label);
  return found[0];
}
export function exerciseCalculation(rows, check) {
  const changed = structuredClone(rows);
  const inputs = check.inputs.map((input) => {
    const index = rowIndex(changed, input.label);
    if (changed[index].formula)
      throw new Error(
        'A calculation check cannot replace a formula with an input.',
      );
    changed[index].value = input.value;
    return { cell: 'B' + (index + 2), label: input.label, value: input.value };
  });
  const result = calculateRows(changed);
  const outputs = check.expected.map((expected) => {
    const index = rowIndex(changed, expected.label),
      actual = result[index];
    return {
      cell: 'B' + (index + 2),
      label: expected.label,
      expected: expected.value,
      actual,
      passed: close(actual, expected.value),
    };
  });
  return { inputs, outputs, passed: outputs.every((r) => r.passed) };
}
export function validateCalculationChecks(checks, design, plan) {
  if (
    !Array.isArray(checks) ||
    checks.length > 12 ||
    new Set(checks.map((c) => c.id)).size !== checks.length
  )
    throw new Error('Invalid calculation checks.');
  for (const check of checks) {
    if (
      !['id', 'deliverableId', 'sheet', 'description'].every(
        (k) => typeof check[k] === 'string' && check[k].trim(),
      ) ||
      !plan.deliverables.some(
        (d) => d.id === check.deliverableId && d.kind === 'spreadsheet',
      )
    )
      throw new Error('Invalid calculation check target.');
    for (const key of ['inputs', 'expected']) {
      if (
        !Array.isArray(check[key]) ||
        !check[key].length ||
        check[key].length > (key === 'expected' ? 20 : 10) ||
        new Set(check[key].map((v) => v.label)).size !== check[key].length ||
        check[key].some(
          (v) =>
            typeof v.label !== 'string' ||
            !v.label.trim() ||
            !Number.isFinite(v.value),
        )
      )
        throw new Error('Invalid calculation check values.');
    }
    const sheet = design.calculations.find((s) => s.name === check.sheet);
    if (!sheet)
      throw new Error(
        'Calculation check sheet is not in the shared reference.',
      );
    const result = exerciseCalculation(sheet.rows, check);
    if (!result.passed)
      throw new Error(
        'Reference calculation disagrees with expected check results: ' +
          check.id +
          ': ' +
          JSON.stringify(result.outputs),
      );
  }
  return checks;
}
export async function verifyCalculationChecks(checks, bundle, dir) {
  const results = [];
  for (const check of checks) {
    try {
      const artifact = (bundle.artifacts || []).find(
        (a) => a.id === check.deliverableId,
      );
      if (!artifact) continue; // Partial publication checks only its own outputs.
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(join(dir, artifact.id + '.xlsx'));
      const sheet = workbook.getWorksheet(check.sheet);
      if (!sheet) throw new Error('Worksheet not found: ' + check.sheet);
      const rows = [];
      for (let i = 2; i <= sheet.rowCount; i++) {
        const cell = sheet.getCell('B' + i);
        rows.push({
          label: sheet.getCell('A' + i).text,
          value: cell.formula ? null : cell.value,
          formula: cell.formula || '',
        });
      }
      const evidence = exerciseCalculation(rows, check);
      results.push({
        name: check.description,
        deliverableIds: [check.deliverableId],
        passed: evidence.passed,
        detail: evidence.passed
          ? 'Changed inputs and evaluated formulas read from the exported workbook. Original file unchanged.'
          : 'Changed-input results differ from the reference expectations.',
        evidence: {
          sheet: check.sheet,
          evaluator:
            'HackPilot arithmetic evaluator; not native Excel recalculation',
          ...evidence,
        },
      });
    } catch (error) {
      results.push({
        name: check.description,
        deliverableIds: [check.deliverableId],
        passed: false,
        detail: error.message,
      });
    }
  }
  return results;
}
