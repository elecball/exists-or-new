import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CANDIDATE_LIMIT, sampleCombinationIndices} from './candidate-sampling.ts';
function rng(seed:number) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}

test('small archives examine every ordered pair and each operator exactly once', () => {
  assert.deepEqual(sampleCombinationIndices(2), Array.from({length:12}, (_, i) => i));
});
test('large archives use a bounded sample without duplicates, covering old and recent operands on both sides', () => {
  const count = 200, indices = sampleCombinationIndices(count, rng(2026));
  assert.equal(indices.length, CANDIDATE_LIMIT);
  assert.equal(new Set(indices).size, indices.length);
  const buckets = [Array(4).fill(0), Array(4).fill(0)];
  for (const index of indices) {
    assert.ok(index >= 0 && index < count * count * 3);
    const left = Math.floor(index / (count * 3)), right = Math.floor(index / 3) % count;
    buckets[0][Math.floor(left / 50)]++; buckets[1][Math.floor(right / 50)]++;
  }
  for (const bucket of buckets.flat()) assert.ok(bucket > 300 && bucket < 500, `Uneven age bucket: ${bucket}`);
});
test('a stuck random source still terminates with distinct valid combinations', () => {
  for (const value of [0, .5, .999999]) {
    let calls = 0;
    const indices = sampleCombinationIndices(300, () => {calls++; return value;});
    assert.equal(calls, CANDIDATE_LIMIT);
    assert.equal(new Set(indices).size, CANDIDATE_LIMIT);
    assert.ok(indices.every(i => Number.isInteger(i) && i >= 0 && i < 270000));
  }
});
