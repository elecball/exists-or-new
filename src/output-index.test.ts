import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ExactOutputIndex} from './output-index.ts';

test('exact output lookup preserves the first representative and exact integer equality', () => {
  const index = new ExactOutputIndex();
  index.add([1n, -2n], 7);
  index.add([1n, -2n], 9);
  assert.equal(index.find([1n, -2n]), 7);
  assert.equal(index.find([1n, 2n]), null);
});
test('all exact coordinates and vector length matter, even beyond floating point precision', () => {
  const index = new ExactOutputIndex(), huge = 9007199254740992n;
  index.add([huge, 3n], 1);
  index.add([huge + 1n, 3n], 2);
  assert.equal(index.find([huge, 3n]), 1);
  assert.equal(index.find([huge + 1n, 3n]), 2);
  assert.equal(index.find([huge, 4n]), null);
  assert.equal(index.find([huge]), null);
  assert.equal(index.find([huge, 3n, 0n]), null);
});
