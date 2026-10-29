/** Exact rational-coefficient polynomials in x, y, z. No sampling or eval. */
export type Variable = 'x' | 'y' | 'z';
export type Operator = '+' | '-' | '*';
export type Expr = { kind: 'constant'; value: Rational } | { kind: 'variable'; name: Variable } |
  { kind: 'binary'; op: Operator; left: Expr; right: Expr };
const abs = (n: bigint) => n < 0n ? -n : n;
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a); b = abs(b);
  while (b !== 0n) { const r = a % b; a = b; b = r; }
  return a;
}
export class Rational {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d = 1n) {
    if (d === 0n) throw new Error('0으로 나눌 수 없습니다.');
    const g = gcd(n, d), sign = d < 0n ? -1n : 1n;
    this.n = sign * n / g; this.d = sign * d / g;
  }
  add(b: Rational) { return new Rational(this.n * b.d + b.n * this.d, this.d * b.d); }
  neg() { return new Rational(-this.n, this.d); }
  mul(b: Rational) { return new Rational(this.n * b.n, this.d * b.d); }
  div(b: Rational) { return new Rational(this.n * b.d, this.d * b.n); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
}
export const constant = (n: bigint | number, d: bigint | number = 1): Expr => ({ kind: 'constant', value: new Rational(BigInt(n), BigInt(d)) });
export const variable = (name: Variable): Expr => ({ kind: 'variable', name });
export const binary = (op: Operator, left: Expr, right: Expr): Expr => ({ kind: 'binary', op, left, right });
// Exponents, not expression text, identify monomials.
export type Polynomial = Map<string, Rational>;
const ZERO = '0,0,0';
function accumulate(p: Polynomial, key: string, c: Rational) {
  const sum = (p.get(key) ?? new Rational(0n)).add(c);
  if (sum.n === 0n) p.delete(key); else p.set(key, sum);
}
export function nonzeroConstant(p: Polynomial): Rational | null {
  return p.size === 1 && p.has(ZERO) ? p.get(ZERO)! : null;
}
export function combine(op: Operator, a: Polynomial, b: Polynomial): Polynomial {
  const result: Polynomial = new Map();
  if (op === '+' || op === '-') {
    for (const [k, c] of a) accumulate(result, k, c);
    for (const [k, c] of b) accumulate(result, k, op === '+' ? c : c.neg());
  } else if (op === '*') {
    for (const [ka, ca] of a) for (const [kb, cb] of b) {
      const ea = ka.split(',').map(Number), eb = kb.split(',').map(Number);
      accumulate(result, ea.map((e, i) => e + eb[i]).join(','), ca.mul(cb));
    }
  } else {
    throw new Error('지원하지 않는 연산입니다. +, −, ×만 사용할 수 있습니다.');
  }
  return result;
}
export function normalize(e: Expr): Polynomial {
  if (e.kind === 'constant') return e.value.n === 0n ? new Map() : new Map([[ZERO, e.value]]);
  if (e.kind === 'variable') return new Map([[['x', 'y', 'z'].map(v => v === e.name ? 1 : 0).join(','), new Rational(1n)]]);
  return combine(e.op, normalize(e.left), normalize(e.right));
}
export function equal(a: Polynomial, b: Polynomial): boolean {
  return a.size === b.size && [...a].every(([k, c]) => {
    const other = b.get(k); return other !== undefined && c.n === other.n && c.d === other.d;
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
      || (a.kind === 'constant' && a.value.n < 0n);
    return needs ? `(${format(a)})` : format(a);
  };
  return `${child(e.left, false)} ${symbols[e.op]} ${child(e.right, true)}`;
}
/** Show the selected subexpression as one visibly grouped operand. */
export function formatOperand(e: Expr): string {
  return e.kind === 'binary' || (e.kind === 'constant' && e.value.n < 0n) ? `(${format(e)})` : format(e);
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
    const magnitude = new Rational(abs(c.n), c.d).toString();
    const term = mono ? (magnitude === '1' ? mono : `${magnitude} × ${mono}`) : magnitude;
    return (i === 0 ? c.n < 0n ? '−' : '' : c.n < 0n ? ' − ' : ' + ') + term;
  }).join('');
}
export function nodeCount(e: Expr): number { return e.kind === 'binary' ? 1 + nodeCount(e.left) + nodeCount(e.right) : 1; }
export function withinLimits(e: Expr, p: Polynomial): boolean {
  return nodeCount(e) <= 31 && format(e).length <= 88 && p.size <= 12 && [...p].every(([k, c]) =>
    k.split(',').map(Number).reduce((s, n) => s + n, 0) <= 4 && abs(c.n) <= 10000n && c.d <= 1000n);
}
