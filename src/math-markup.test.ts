import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMath } from './math-markup.ts';
import { binary, constant, variable } from './math.ts';
test('mathematical variables and true minus signs replace upright text and hyphens', () => {
  const expression = binary('-', variable('x'), constant(-1));
  const markup = renderMath(expression);
  assert.match(markup, /<mi mathvariant="italic">x<\/mi>/);
  assert.equal((markup.match(/<mo>−<\/mo>/g) ?? []).length, 2);
  assert.ok(!markup.includes('<mn>-1'));
});
test('subtraction grouping and composed operands stay explicit in MathML', () => {
  const expression = binary('-', variable('x'), binary('-', variable('y'), variable('z')));
  const markup = renderMath(expression);
  assert.equal((markup.match(/<mo>\(<\/mo>/g) ?? []).length, 1);
  assert.equal((markup.match(/<mo>\)<\/mo>/g) ?? []).length, 1);
  const grouped = renderMath(expression, true);
  assert.equal((grouped.match(/<mo>\(<\/mo>/g) ?? []).length, 2);
  assert.equal((grouped.match(/<mo>\)<\/mo>/g) ?? []).length, 2);
});
test('fraction coefficients have a proper mathematical numerator and denominator', () => {
  const markup = renderMath(constant(-1, 3));
  assert.match(markup, /<mfrac><mn>1<\/mn><mn>3<\/mn><\/mfrac>/);
  assert.match(markup, /<mo>−<\/mo>/);
});
