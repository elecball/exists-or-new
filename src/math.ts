/** Exact integer-coefficient polynomials in x, y, z. No sampling or eval. */
export type Variable = 'x' | 'y' | 'z';
export type Operator = '+' | '-' | '*';
export type Expr = { kind: 'constant'; value: bigint } | { kind: 'variable'; name: Variable } |
  { kind: 'binary'; op: Operator; left: Expr; right: Expr };
const abs = (n: bigint) => n < 0n ? -n : n;
export const constant = (n: bigint | number): Expr => {
  if(typeof n==='number'&&!Number.isSafeInteger(n))throw new Error('상수는 안전한 정수 또는 BigInt여야 합니다.');
  return {kind:'constant',value:BigInt(n)};
};
export const variable = (name: Variable): Expr => ({ kind: 'variable', name });
export const binary = (op: Operator, left: Expr, right: Expr): Expr => ({ kind: 'binary', op, left, right });
// Exponents, not expression text, identify monomials.
export type Polynomial = Map<string, bigint>;
const ZERO = '0,0,0';
function accumulate(p: Polynomial, key: string, c: bigint) {
  const sum = (p.get(key) ?? 0n) + c;
  if (sum === 0n) p.delete(key); else p.set(key, sum);
}
export function nonzeroConstant(p: Polynomial): bigint | null {
  return p.size === 1 && p.has(ZERO) ? p.get(ZERO)! : null;
}
export function combine(op: Operator, a: Polynomial, b: Polynomial): Polynomial {
  const result: Polynomial = new Map();
  if (op === '+' || op === '-') {
    for (const [k, c] of a) accumulate(result, k, c);
    for (const [k, c] of b) accumulate(result, k, op === '+' ? c : -c);
  } else if (op === '*') {
    for (const [ka, ca] of a) for (const [kb, cb] of b) {
      const ea = ka.split(',').map(Number), eb = kb.split(',').map(Number);
      accumulate(result, ea.map((e, i) => e + eb[i]).join(','), ca * cb);
    }
  } else {
    throw new Error('지원하지 않는 연산입니다. +, −, ×만 사용할 수 있습니다.');
  }
  return result;
}
export function normalize(e: Expr): Polynomial {
  if (e.kind === 'constant') return e.value === 0n ? new Map() : new Map([[ZERO, e.value]]);
  if (e.kind === 'variable') return new Map([[['x', 'y', 'z'].map(v => v === e.name ? 1 : 0).join(','), 1n]]);
  return combine(e.op, normalize(e.left), normalize(e.right));
}
export function equal(a: Polynomial, b: Polynomial): boolean {
  return a.size === b.size && [...a].every(([k, c]) => {
    const other = b.get(k); return other !== undefined && c === other;
  });
}
export const equivalent = (a: Expr, b: Expr) => equal(normalize(a), normalize(b));
const symbols: Record<Operator, string> = { '+': '+', '-': '−', '*': '×' };
export const symbol = (op: Operator) => symbols[op];
export function format(e: Expr): string {
  if (e.kind === 'variable') return e.name;
  if (e.kind === 'constant') return e.value.toString().replace('-', '−');
  const precedence = (a: Expr) => a.kind !== 'binary' ? 3 : a.op === '+' || a.op === '-' ? 1 : 2;
  const p = precedence(e);
  const child = (a: Expr, right: boolean) => {
    const needs = precedence(a) < p || (right && precedence(a) === p &&
      e.op === '-')
      || (a.kind === 'constant' && a.value < 0n);
    return needs ? `(${format(a)})` : format(a);
  };
  return `${child(e.left, false)} ${symbols[e.op]} ${child(e.right, true)}`;
}
/** Show the selected subexpression as one visibly grouped operand. */
export function formatOperand(e: Expr): string {
  return e.kind === 'binary' || (e.kind === 'constant' && e.value < 0n) ? `(${format(e)})` : format(e);
}
export function formatComposition(e: Expr): string {
  return e.kind === 'binary' ? `${formatOperand(e.left)} ${symbol(e.op)} ${formatOperand(e.right)}` : format(e);
}
export function formatPolynomial(p: Polynomial): string {
  if (p.size === 0) return '0';
  const entries = [...p].sort(([a], [b]) => {
    const ea = a.split(',').map(Number), eb = b.split(',').map(Number);
    return eb.reduce((s, n) => s + n, 0) - ea.reduce((s, n) => s + n, 0) ||
      eb[0] - ea[0] || eb[1] - ea[1] || eb[2] - ea[2];
  });
  return entries.map(([key, c], i) => {
    const mono = key.split(',').map((n, j) => Number(n) === 0 ? '' : ['x', 'y', 'z'][j] + (Number(n) === 1 ? '' : `^${n}`)).filter(Boolean).join(' × ');
    const magnitude = abs(c).toString();
    const term = mono ? (magnitude === '1' ? mono : `${magnitude} × ${mono}`) : magnitude;
    return (i === 0 ? c < 0n ? '−' : '' : c < 0n ? ' − ' : ' + ') + term;
  }).join('');
}
export function nodeCount(e: Expr): number { return e.kind === 'binary' ? 1 + nodeCount(e.left) + nodeCount(e.right) : 1; }
export function withinLimits(e: Expr, p: Polynomial): boolean {
  return nodeCount(e) <= 31 && format(e).length <= 88 && p.size <= 12 && [...p].every(([k, c]) =>
    k.split(',').map(Number).reduce((s, n) => s + n, 0) <= 4 && abs(c) <= 10000n);
}
