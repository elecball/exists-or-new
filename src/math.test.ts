import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binary as b, constant as c, variable as v, equivalent as eq, normalize, Rational, format, formatComposition, formatOperand, formatPolynomial, withinLimits, type Operator } from './math.ts';
const x = v('x'), y = v('y'), z = v('z');
test('neutral elements, cancellation and collected terms', () => {
  assert.ok(eq(b('+', x, c(0)), x));
  assert.ok(eq(b('-', x, x), c(0)));
  assert.ok(eq(b('+', x, x), b('*', c(2), x)));
  assert.ok(eq(b('*', x, c(1)), x));
});
test('multivariate distributivity, commutativity and associativity', () => {
  assert.ok(eq(b('*', x, b('+', y, z)), b('+', b('*', x, y), b('*', x, z))));
  assert.ok(eq(b('+', x, y), b('+', y, x)));
  assert.ok(eq(b('*', x, y), b('*', y, x)));
  assert.ok(eq(b('+', b('+', x, y), z), b('+', x, b('+', y, z))));
  assert.ok(eq(b('*', b('*', x, y), z), b('*', x, b('*', y, z))));
  assert.ok(eq(b('-', b('+', b('*', x, y), z), b('*', y, x)), z));
});
test('polynomials are not identified through a finite sample', () => {
  assert.equal(eq(b('+', x, x), b('*', x, x)), false);
  assert.equal(eq(b('-', x, y), b('-', y, x)), false);
  // They agree at x=0 and x=1 but are different polynomials.
  assert.equal(eq(b('*', x, b('-', x, c(1))), c(0)), false);
});
test('fraction coefficients and huge integers stay exact', () => {
  assert.ok(eq(b('+', b('*', c(1, 3), x), b('*', c(1, 6), x)), b('*', c(1, 2), x)));
  assert.ok(eq(b('+', c(1, 10), c(2, 10)), c(3, 10)));
  assert.ok(eq(b('-', c(9007199254740993n), c(9007199254740992n)), c(1)));
  assert.equal(new Rational(6n, -8n).toString(), '-3/4');
  assert.equal(new Rational(0n, -8n).toString(), '0');
});
test('division is outside the game AST operations', () => {
  assert.throws(() => normalize(b('/' as Operator, x, c(2))), /지원하지 않는 연산/);
  assert.throws(() => new Rational(1n, 0n));
});
test('notation preserves non-associative operand grouping', () => {
  assert.equal(format(b('-', x, b('-', y, z))), 'x − (y − z)');
  assert.equal(formatComposition(b('*', b('+', x, y), b('-', x, y))), '(x + y) × (x − y)');
  assert.equal(formatComposition(b('-', x, b('-', y, z))), 'x − (y − z)');
  assert.equal(formatOperand(x), 'x');
  assert.equal(formatOperand(c(-2)), '(−2)');
  assert.equal(format(b('*', b('+', x, y), z)), '(x + y) × z');
  assert.equal(formatPolynomial(normalize(b('+', b('*', c(-1, 2), x), c(1, 3)))), '−1/2 × x + 1/3');
  const big = b('*', b('*', x, x), b('*', x, b('*', x, x)));
  assert.equal(withinLimits(big, normalize(big)), false);
});
