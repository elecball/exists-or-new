import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExactOutputIndex} from './output-index.ts';
import {Rational} from './math.ts';
const r = (n:bigint, d = 1n) => new Rational(n, d);

test('exact output lookup preserves the first representative and canonical fractional equality', () => {
  const index = new ExactOutputIndex();
  index.add([r(1n, 3n), r(-2n)], 7);
  index.add([r(2n, 6n), r(-4n, 2n)], 9);
  assert.equal(index.find([r(3n, 9n), r(-2n)]), 7);
  assert.equal(index.find([r(1n, 3n), r(2n)]), null);
});
test('all exact coordinates and vector length matter, even beyond floating point precision', () => {
  const index = new ExactOutputIndex(), huge = 9007199254740992n;
  index.add([r(huge), r(3n)], 1);
  index.add([r(huge + 1n), r(3n)], 2);
  assert.equal(index.find([r(huge), r(3n)]), 1);
  assert.equal(index.find([r(huge + 1n), r(3n)]), 2);
  assert.equal(index.find([r(huge), r(4n)]), null);
  assert.equal(index.find([r(huge)]), null);
  assert.equal(index.find([r(huge), r(3n), r(0n)]), null);
});
