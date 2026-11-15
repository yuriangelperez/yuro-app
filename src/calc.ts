// Evaluador de la calculadora: + − × ÷, paréntesis y %. Coma decimal. Sin eval: un parser recursivo chico.
// Convención de calculadora de bolsillo: "200 + 10%" = 220 (el % se toma sobre lo anterior); "50%" solo = 0,5.

export const OPERADORES = ['+', '−', '×', '÷'] as const;

type Tok = { t: 'n'; v: number } | { t: 'op'; v: string } | { t: '(' } | { t: ')' } | { t: '%' };

const tokenizar = (texto: string): Tok[] | null => {
  const out: Tok[] = [];
  const s = texto.replace(/\s+/g, '').replace(/-/g, '−').replace(/\*/g, '×').replace(/\//g, '÷');
  for (let i = 0; i < s.length; ) {
    const ch = s[i];
    if (/[\d,.]/.test(ch)) {
      let j = i;
      while (j < s.length && /[\d,]/.test(s[j])) j++;
      if (j === i) { i++; continue; } // un punto suelto se ignora
      const n = parseFloat(s.slice(i, j).replace(',', '.'));
      if (isNaN(n)) return null;
      out.push({ t: 'n', v: n });
      i = j;
    } else if ('+−×÷'.includes(ch)) { out.push({ t: 'op', v: ch }); i++; }
    else if (ch === '(') { out.push({ t: '(' }); i++; }
    else if (ch === ')') { out.push({ t: ')' }); i++; }
    else if (ch === '%') { out.push({ t: '%' }); i++; }
    else return null;
  }
  return out;
};

// Devuelve el resultado, o null si la cuenta está incompleta o es inválida (ej. "5+", "8÷0").
export function calcular(texto: string): number | null {
  const toks = tokenizar(texto);
  if (!toks || !toks.length) return null;
  let p = 0;
  let fallo = false;
  type Val = { v: number; pct: boolean };

  const factor = (): Val => {
    const tk = toks[p];
    if (!tk) { fallo = true; return { v: 0, pct: false }; }
    if (tk.t === 'op' && tk.v === '−') { p++; const f = factor(); return { v: -f.v, pct: f.pct }; }
    if (tk.t === 'op' && tk.v === '+') { p++; return factor(); }
    let v: number;
    if (tk.t === 'n') { v = tk.v; p++; }
    else if (tk.t === '(') {
      p++;
      v = suma();
      if (toks[p]?.t !== ')') fallo = true; else p++;
    } else { fallo = true; return { v: 0, pct: false }; }
    let pct = false;
    while (toks[p]?.t === '%') { v /= 100; pct = true; p++; }
    return { v, pct };
  };
  const producto = (): Val => {
    let a = factor();
    while (toks[p]?.t === 'op' && (toks[p] as { v: string }).v !== '+' && (toks[p] as { v: string }).v !== '−') {
      const op = (toks[p++] as { v: string }).v;
      const b = factor();
      if (op === '÷' && b.v === 0) { fallo = true; return a; }
      a = { v: op === '×' ? a.v * b.v : a.v / b.v, pct: false };
    }
    return a;
  };
  const suma = (): number => {
    let acc = producto();
    while (toks[p]?.t === 'op' && ((toks[p] as { v: string }).v === '+' || (toks[p] as { v: string }).v === '−')) {
      const op = (toks[p++] as { v: string }).v;
      const b = producto();
      const delta = b.pct ? acc.v * b.v : b.v; // "200 + 10%" suma el 10% de 200
      acc = { v: op === '+' ? acc.v + delta : acc.v - delta, pct: false };
    }
    return acc.v;
  };

  const r = suma();
  if (fallo || p < toks.length || !isFinite(r)) return null;
  return Math.round(r * 1e8) / 1e8;
}

// Formato para mostrar: 1234567.5 → "1.234.567,5"
export const formatoCalc = (n: number) => {
  const [ent, dec] = String(Math.round(n * 100) / 100).split('.');
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '');
};

// Agrega una tecla a la cuenta que se está escribiendo.
export function pulsarCalc(cuenta: string, k: string): string {
  const ultimo = cuenta.slice(-1);
  const esOp = (x: string) => '+−×÷'.includes(x) && !!x;
  if (k === '⌫') return cuenta.slice(0, -1);
  if (k === 'C') return '';
  if (k === '()') {
    const abiertos = (cuenta.match(/\(/g) ?? []).length - (cuenta.match(/\)/g) ?? []).length;
    const cierra = abiertos > 0 && /[\d)%]/.test(ultimo);
    return cuenta + (cierra ? ')' : /[\d)%]/.test(ultimo) ? '×(' : '(');
  }
  if (esOp(k)) {
    if (!cuenta) return k === '−' ? '−' : '';
    if (ultimo === '(') return k === '−' ? cuenta + k : cuenta;
    return esOp(ultimo) ? cuenta.slice(0, -1) + k : cuenta + k;
  }
  if (k === '%') return /[\d)]/.test(ultimo) ? cuenta + '%' : cuenta;
  const numero = cuenta.split(/[+−×÷()%]/).pop() ?? '';
  if (k === ',') return numero.includes(',') ? cuenta : cuenta + (numero ? ',' : '0,');
  if (numero.includes(',') && numero.split(',')[1].length >= 8) return cuenta;
  if (ultimo === ')' || ultimo === '%') return cuenta + '×' + k; // "(2+3)5" se lee como (2+3)×5
  if (!numero && k === '000') return cuenta + '0';
  if (numero === '0' && k !== ',') return cuenta.slice(0, -1) + (k === '000' ? '0' : k);
  return cuenta + k;
}
