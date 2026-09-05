// Small arithmetic grammar: data never becomes JavaScript or a command.
export function calculateRows(rows) {
  const cache = new Map(),
    visiting = new Set();
  function cell(address) {
    const match = /^B([1-9]\d*)$/.exec(address);
    const index = match ? Number(match[1]) - 2 : -1;
    if (index < 0 || index >= rows.length)
      throw new Error('Référence de calcul invalide : ' + address);
    if (cache.has(index)) return cache.get(index);
    if (visiting.has(index))
      throw new Error('Référence circulaire : ' + address);
    visiting.add(index);
    const row = rows[index];
    const value = row.formula
      ? expression(row.formula.replace(/^=/, ''))
      : row.value;
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error('Valeur numérique manquante ou invalide : ' + address);
    visiting.delete(index);
    cache.set(index, value);
    return value;
  }
  function expression(input) {
    const tokens =
      input
        .toUpperCase()
        .replace(/\$/g, '')
        .match(
          /(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?|B[1-9]\d*|SUM|AVERAGE|MIN|MAX|[()+*/^,:-]/g,
        ) || [];
    if (
      tokens.join('') !==
        input.toUpperCase().replace(/\$/g, '').replace(/\s/g, '') ||
      tokens.length > 200
    )
      throw new Error('Formule non prise en charge : ' + input);
    let pos = 0;
    const take = (s) => {
      if (tokens[pos] !== s) throw new Error('Formule invalide : ' + input);
      pos++;
    };
    function primary() {
      const token = tokens[pos++];
      if (token === '(') {
        const v = add();
        take(')');
        return v;
      }
      if (['SUM', 'AVERAGE', 'MIN', 'MAX'].includes(token)) {
        take('(');
        const values = [];
        do {
          if (tokens[pos] === ',') pos++;
          if (/^B\d+$/.test(tokens[pos]) && tokens[pos + 1] === ':') {
            const a = Number(tokens[pos++].slice(1));
            pos++;
            const end = tokens[pos++];
            if (!/^B\d+$/.test(end)) throw new Error('Plage invalide.');
            const b = Number(end.slice(1));
            if (b < a || b - a > 200) throw new Error('Plage invalide.');
            for (let i = a; i <= b; i++) values.push(cell('B' + i));
          } else values.push(add());
        } while (tokens[pos] === ',');
        take(')');
        if (token === 'MIN') return Math.min(...values);
        if (token === 'MAX') return Math.max(...values);
        const sum = values.reduce((a, b) => a + b, 0);
        return token === 'AVERAGE' ? sum / values.length : sum;
      }
      if (/^B\d+$/.test(token)) return cell(token);
      if (token && /^(?:\d|\.)/.test(token)) return Number(token);
      throw new Error('Formule invalide : ' + input);
    }
    function unary() {
      if (tokens[pos] === '+') {
        pos++;
        return unary();
      }
      if (tokens[pos] === '-') {
        pos++;
        return -unary();
      }
      return primary();
    }
    function power() {
      const a = unary();
      if (tokens[pos] === '^') {
        pos++;
        return a ** power();
      }
      return a;
    }
    function mul() {
      let a = power();
      while (['*', '/'].includes(tokens[pos])) {
        const op = tokens[pos++],
          b = power();
        if (op === '/' && b === 0) throw new Error('Division par zéro.');
        a = op === '*' ? a * b : a / b;
      }
      return a;
    }
    function add() {
      let a = mul();
      while (['+', '-'].includes(tokens[pos])) {
        const op = tokens[pos++],
          b = mul();
        a = op === '+' ? a + b : a - b;
      }
      return a;
    }
    const result = add();
    if (pos !== tokens.length || !Number.isFinite(result))
      throw new Error('Résultat de calcul invalide.');
    return result;
  }
  // Unknown inputs stay blank. A formula referencing one still fails in cell().
  return rows.map((row, i) =>
    !row.formula && row.value === null ? null : cell('B' + (i + 2)),
  );
}
