import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tutorialLesson} from './tutorial.ts';
import {equivalentOnMappings, submitAnswer} from './game.ts';

test('tutorial lessons use real records, real inputs and the ordinary scoring engine', () => {
  const expected = [false, true, false, true];
  for (let i = 0; i < expected.length; i++) {
    const {s, q} = tutorialLesson(i);
    assert.ok(s.records.includes(q.left)); assert.ok(s.records.includes(q.right));
    assert.equal(q.matchId !== null, expected[i]);
    assert.equal(q.mappings.length, i < 2 ? 1 : 2);
    const count = s.records.length;
    assert.equal(submitAnswer(s, q, expected[i], 0).correct, true);
    assert.equal(s.records.length, count + (expected[i] ? 0 : 1));
    assert.equal(s.records.filter(r => equivalentOnMappings(r.expr, q.expr, q.mappings)).length, 1);
  }
});
test('the same square changes from existing to novel when the second input arrives', () => {
  const before = tutorialLesson(1), after = tutorialLesson(2);
  assert.deepEqual(before.q.expr, after.q.expr);
  assert.equal(before.q.matchId, before.s.records[0].id);
  assert.equal(after.q.matchId, null);
  assert.deepEqual(after.q.outputs.map(n => n.toString()), ['1', '4']);
});
