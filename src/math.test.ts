import { test } from 'node:test';
import assert from 'node:assert/strict';
import { binary as b, constant as c, variable as v, equivalent as eq, normalize, format, formatComposition, formatOperand, formatPolynomial, withinLimits, type Operator } from './math.ts';
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
test('large integer coefficients and cancellation stay exact', () => {
  const huge=9007199254740993n;
  assert.ok(eq(b('+',b('*',c(huge),x),b('*',c(-huge+2n),x)),b('*',c(2),x)));
  assert.ok(eq(b('-',c(huge),c(huge-1n)),c(1)));
  assert.ok(eq(b('*',c(huge),c(huge)),c(huge*huge)));
  assert.equal(normalize(c(0)).size,0);
});
test('fractional constants, unsafe numeric constants and division are rejected', () => {
  assert.throws(()=>c(.5));assert.throws(()=>c(Number.MAX_SAFE_INTEGER+1));
  assert.throws(() => normalize(b('/' as Operator, x, c(2))), /지원하지 않는 연산/);
});
test('notation preserves non-associative operand grouping', () => {
  assert.equal(format(b('-', x, b('-', y, z))), 'x − (y − z)');
  assert.equal(formatComposition(b('*', b('+', x, y), b('-', x, y))), '(x + y) × (x − y)');
  assert.equal(formatComposition(b('-', x, b('-', y, z))), 'x − (y − z)');
  assert.equal(formatOperand(x), 'x');
  assert.equal(formatOperand(c(-2)), '(−2)');
  assert.equal(format(b('*', b('+', x, y), z)), '(x + y) × z');
  assert.equal(formatPolynomial(normalize(b('+', b('*', c(-2), x), c(3)))), '−2 × x + 3');
  const big = b('*', b('*', x, x), b('*', x, b('*', x, x)));
  assert.equal(withinLimits(big, normalize(big)), false);
});
