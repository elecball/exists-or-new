import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, isGameOver, generateQuestion, makeQuestion, submitAnswer, initialRecords, addScheduledMappings, addScheduledConstants, evaluate, equivalentOnMappings, outputsFor, sameOutputs, inputMapping, difficulties, INPUT_BOUND, CONSTANT_BOUND, withinDifficultyLimits, timeTone, type Difficulty } from './game.ts';
import { equal, normalize, withinLimits, binary, constant, variable, formatComposition, nodeCount } from './math.ts';
const TEST_ROUNDS = 12;
function rng(seed: number) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
test('each difficulty starts with one input mapping; initial representatives are only its variables', () => {
  for (const [difficulty, count] of [['easy', 1], ['medium', 2], ['hard', 3]] as [Difficulty, number][]) {
    const records = initialRecords(difficulty), s = createSession(difficulty, rng(1));
    assert.equal(records.length, count);
    assert.ok(records.every(r => r.expr.kind === 'variable'));
    assert.equal(s.mappings.length, 1);
    for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) assert.equal(equivalentOnMappings(records[i].expr, records[j].expr, s.mappings), false);
  }
});
test('finite mapping equivalence: x and x² match at 1, but not across 1 and 2', () => {
  const x = variable('x'), square = binary('*', x, x);
  assert.ok(equivalentOnMappings(x, square, [inputMapping(1, 2, 3)]));
  assert.equal(equivalentOnMappings(x, square, [inputMapping(1, 2, 3), inputMapping(2, 3, 4)]), false);
  assert.equal(equal(normalize(x), normalize(square)), false); // Polynomial identity is not the game answer.
});
test('all input coordinates and mappings participate, with exact integer outputs', () => {
  const input={x:9007199254740993n,y:-2n,z:5n};
  const expr=binary('+',binary('*',variable('x'),constant(3)),binary('-',variable('z'),variable('y')));
  assert.equal(evaluate(expr,input),27021597764222986n);
  assert.equal(evaluate(binary('-',variable('x'),constant(9007199254740992n)),input),1n);
  assert.equal(sameOutputs([1n,2n],[1n,3n]),false);
  assert.equal(sameOutputs([1n],[1n,1n]),false);
});
test('seeded full games: sampled answers, actual operands, bounded expressions and consistent archive', () => {
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) for (let seed = 1; seed <= 12; seed++) {
    const random = rng(seed), s = createSession(d, random);
    for (let round = 0; round < TEST_ROUNDS; round++) {
      const q = generateQuestion(s, random), before = s.records.length;
      assert.equal(q.mappings.length, 1 + Math.floor(round / 10));
      assert.ok(s.records.includes(q.left) && s.records.includes(q.right));
      assert.ok(withinLimits(q.expr, q.polynomial));
      assert.ok(withinDifficultyLimits(q.expr, q.polynomial, d));
      assert.ok(q.outputs.every(w => (w < 0n ? -w : w) <= BigInt(difficulties[d].maxOutput)));
      assert.ok(equal(normalize(q.expr), q.polynomial));
      assert.ok(['+', '-', '*'].includes(q.op));
      assert.ok(sameOutputs(q.outputs, outputsFor(q.expr, q.mappings)));
      const match = s.records.find(r => equivalentOnMappings(r.expr, q.expr, q.mappings));
      assert.equal(q.matchId, match?.id ?? null);
      const a = submitAnswer(s, q, round === 1 ? !(q.matchId !== null) : q.matchId !== null, 5);
      assert.equal(a.correct, round !== 1);
      assert.equal(s.records.length, before + (match ? 0 : 1));
      assert.equal(s.records.filter(r => equivalentOnMappings(r.expr, q.expr, q.mappings)).length, 1);
      const after = s.records.length;
      assert.equal(submitAnswer(s, q, true, 9), a);
      assert.equal(s.answers.length, round + 1);
      assert.equal(s.records.length, after);
      for (let i = 0; i < s.records.length; i++) for (let j = i + 1; j < s.records.length; j++) assert.equal(equivalentOnMappings(s.records[i].expr, s.records[j].expr, s.mappings), false);
    }
    assert.ok(s.score > 0);
    assert.equal(s.lives, 2);
  }
});
test('gentler games stay short and varied without predictable opposite-answer pairs', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    let duplicates = 0, oppositePairs = 0, totalLength = 0;
    const operators = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const random = rng(seed), s = createSession(difficulty, random);
      let previous = false;
      for (let round = 0; round < 50; round++) {
        const q = generateQuestion(s, random), duplicate = q.matchId !== null;
        assert.ok(withinDifficultyLimits(q.expr, q.polynomial, s.settings));
        if (round < 10) assert.ok(nodeCount(q.expr) <= 5);
        if (round % 2 && duplicate !== previous) oppositePairs++;
        if (duplicate) duplicates++;
        previous = duplicate;
        operators.add(q.op); totalLength += formatComposition(q.expr).length;
        submitAnswer(s, q, duplicate, s.settings.seconds);
      }
    }
    assert.ok(duplicates > 600 * .35 && duplicates < 600 * .7, `Answer distribution: ${duplicates}/600`);
    assert.ok(oppositePairs > 300 * .3 && oppositePairs < 300 * .7, `Opposite pairs: ${oppositePairs}/300`);
    assert.ok(totalLength / 600 < 11, `Mean displayed length: ${totalLength / 600}`);
    assert.deepEqual([...operators].sort(), ['*', '+', '-']);
  }
});
test('correctness, timeout and scoring follow mapping equivalence', () => {
  const s = createSession('easy'), x = s.records[0];
  s.mappings = [inputMapping(1, 2, 3)];
  const q = makeQuestion(s, x, x, '*'); // x² ~ x only on currently public input.
  const a = submitAnswer(s, q, true, 4.21);
  assert.equal(a.correct, true); assert.equal(a.earned, 110); assert.equal(s.streak, 1);
  assert.equal(s.records.length, 1); assert.equal(s.records[0], x);
  const next = generateQuestion(s, rng(8));
  assert.equal(submitAnswer(s, next, null, 0).correct, false);
  assert.equal(s.streak, 0); assert.equal(s.score, 110);
});
test('fallback works even when there is no zero representative', () => {
  const s = createSession('easy');
  s.recent = s.records.flatMap(a => s.records.flatMap(b => ['+', '-', '*'].map(op => `${a.id}:${op}:${b.id}`)));
  const q = generateQuestion(s, () => 0);
  assert.equal(q.matchId, null); assert.equal(q.left, q.right);
  assert.ok(sameOutputs(q.outputs, outputsFor(q.expr, s.mappings)));
});
test('mappings remain unchanged for ten rounds and grow once before round eleven', () => {
  const s = createSession('easy');
  for (let round = 1; round <= TEST_ROUNDS; round++) {
    const q = generateQuestion(s, rng(round));
    assert.equal(s.mappings.length, 1 + Math.floor((round - 1) / 10));
    const length = s.mappings.length;
    addScheduledMappings(s); addScheduledMappings(s);
    assert.equal(s.mappings.length, length);
    submitAnswer(s, q, q.matchId !== null, 5);
    assert.equal(s.mappings.length, length);
  }
});
test('one representative survives; added mappings do not restore discarded candidates', () => {
  const s = createSession('easy'), x = s.records[0];
  s.mappings = [inputMapping(1, 2, 3)];
  const discarded = makeQuestion(s, x, x, '*');
  submitAnswer(s, discarded, true, 5);
  assert.equal(s.records.length, 1);
  for (const op of ['-', '+'] as const) { const q = makeQuestion(s, x, x, op); submitAnswer(s, q, false, 5); }
  while (s.answers.length < 10) {
    const q = generateQuestion(s, rng(s.answers.length)); submitAnswer(s, q, q.matchId !== null, 5);
  }
  const before = [...s.records];
  addScheduledMappings(s, () => 0.99);
  assert.equal(s.mappings.length, 2);
  assert.deepEqual(s.records, before);
  assert.ok(!s.records.some(r => r.expr === discarded.expr));
  assert.equal(discarded.mappings.length, 1); // Historical answer remains tied to its original inputs.
  assert.equal(discarded.matchId, x.id);
  const rediscovered = makeQuestion(s, x, x, '*');
  assert.equal(rediscovered.matchId, null);
  const a = submitAnswer(s, rediscovered, true, 5); // Wrong answer still stores the new representative.
  assert.equal(a.correct, false);
  assert.equal(s.records.length, before.length + 1);
});
test('a shorter observational match replaces the same slot even after a wrong answer or timeout', () => {
  for (const choice of [true, false, null]) {
    const s = createSession('medium', rng(1));
    s.mappings = [inputMapping(2, 3, 0)];
    const [x, y] = s.records;
    const expr = binary('-', binary('+', x.expr, y.expr), binary('-', y.expr, x.expr));
    const old = {id:3, expr, polynomial:normalize(expr)};
    s.records.push(old);
    const history = makeQuestion(s, old, x, '+');
    const q = makeQuestion(s, x, x, '*'); // x² and 2x coincide only on the revealed x=2.
    assert.equal(q.matchId, old.id);
    const a = submitAnswer(s, q, choice, 10);
    assert.equal(a.correct, choice === true);
    assert.equal(a.replaced, old);
    assert.equal(s.records.length, 3);
    assert.equal(s.records[2].id, old.id);
    assert.equal(s.records[2].expr, q.expr);
    assert.ok(equal(s.records[2].polynomial, normalize(q.expr)));
    assert.equal(history.left, old); // History and operand ASTs must never be mutated.
    assert.ok(equal(history.left.polynomial, normalize(expr)));
    assert.equal(submitAnswer(s, q, true, 10), a);
    s.mappings.push(inputMapping(3, 4, 0));
    assert.equal(makeQuestion(s, x, x, '+').matchId, null);
    assert.deepEqual(q.outputs.map(value => value.toString()), ['4']);
    assert.equal(s.records.some(r => r === old), false);
  }
});
test('ties and longer matches keep the existing representative', () => {
  const s = createSession('medium', rng(3)), [x, y] = s.records;
  s.mappings = [inputMapping(1, 2, 0), inputMapping(2, 3, 0)];
  const first = makeQuestion(s, x, y, '+');
  submitAnswer(s, first, false, 10);
  const representative = s.records.at(-1);
  const tie = makeQuestion(s, y, x, '+');
  assert.equal(submitAnswer(s, tie, true, 10).replaced, null);
  assert.equal(s.records.at(-1), representative);
  const longer = makeQuestion(s, representative!, x, '-'); // (x+y)-x = y
  assert.equal(submitAnswer(s, longer, true, 10).replaced, null);
  assert.equal(s.records[1], y);
});
test('an arriving constant also replaces a longer matching representative without adding a slot', () => {
  const s = createSession('easy', rng(5)), x = s.records[0];
  s.mappings = [inputMapping(2, 0, 0)];
  const zero = makeQuestion(s, x, x, '-');
  submitAnswer(s, zero, false, 0);
  const old = s.records.at(-1)!;
  for (const value of [-2, -1, 1]) {
    const expr = constant(value); s.records.push({id:s.records.length + 1, expr, polynomial:normalize(expr)});
  }
  while (s.answers.length < 6) {
    const q = makeQuestion(s, x, x, '*'); submitAnswer(s, q, q.matchId !== null, 0);
  }
  const before = s.records.length;
  addScheduledConstants(s, () => .5);
  assert.equal(s.records.length, before);
  assert.equal(s.records.find(r => r.id === old.id)!.expr.kind, 'constant');
  assert.deepEqual(s.constantEvents[0], {round:7, value:0, entryId:old.id, added:false});
  assert.equal(old.expr, zero.expr);
});

test('initial inputs vary across games, include signs, and retain distinct variable representatives', () => {
  const seen = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    const s = createSession('hard', rng(seed * 971));
    const values = difficulties.hard.variables.map(v => s.mappings[0][v]);
    seen.add(values[0].toString());
    assert.equal(new Set(values).size, 3);
    assert.ok(values.every(n => n !== 0n && n >= -BigInt(INPUT_BOUND) && n <= BigInt(INPUT_BOUND)));
  }
  assert.ok(seen.size >= 6);
  assert.ok([...seen].some(n => Number(n) < 0));
  assert.ok([...seen].some(n => Number(n) > 0));
});
test('additional mappings stay unique on active variables even with a stuck random source', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const s = createSession(difficulty, () => 0), random = () => 0;
    for (let round = 0; round < TEST_ROUNDS; round++) {
      const q = generateQuestion(s, random); submitAnswer(s, q, q.matchId !== null, 1);
    }
    assert.equal(s.mappings.length, 2);
    const keys = s.mappings.map(input => difficulties[difficulty].variables.map(v => input[v].toString()).join(','));
    assert.equal(new Set(keys).size, 2);
  }
});

test('random constants arrive once before rounds 7 and 13 and do not affect scoring', () => {
  const random = rng(2026), s = createSession('hard', random);
  for (let round = 1; round <= 13; round++) {
    const q = generateQuestion(s, random);
    assert.equal(s.constantEvents.length, Math.floor((round - 1) / 6));
    for (const event of s.constantEvents) {
      const representative = s.records.find(r => r.id === event.entryId)!;
      assert.ok(equivalentOnMappings(representative.expr, constant(event.value), s.mappings));
    }
    const records = [...s.records], count = s.constantEvents.length;
    addScheduledConstants(s); addScheduledConstants(s);
    assert.deepEqual(s.records, records);
    assert.equal(s.constantEvents.length, count);
    const score = s.score;
    submitAnswer(s, q, q.matchId !== null, 0);
    assert.equal(s.score, score + 100);
    assert.equal(s.constantEvents.length, count); // No injection during feedback.
  }
  assert.deepEqual(s.constantEvents.map(event => event.round), [7, 13]);
  assert.equal(new Set(s.constantEvents.map(event => event.value)).size, 2);
  assert.ok(s.constantEvents.every(event => event.value >= -CONSTANT_BOUND && event.value <= CONSTANT_BOUND));
  assert.equal(createSession('hard').constantEvents.length, 0);
});
test('a scheduled constant keeps an equivalent earlier representative instead of replacing it', () => {
  const s = createSession('easy');
  s.mappings = [inputMapping(1, 2, 3)];
  const x = s.records[0];
  for (const op of ['*', '+', '-', '*', '+', '-'] as const) { const q = makeQuestion(s, x, x, op); submitAnswer(s, q, q.matchId !== null, 0); }
  for (let value = -CONSTANT_BOUND; value <= CONSTANT_BOUND; value++) {
    const expr = constant(value);
    if (!s.records.some(r => equivalentOnMappings(r.expr, expr, s.mappings))) {
      s.records.push({id: Math.max(...s.records.map(r => r.id)) + 1, expr, polynomial: normalize(expr)});
    }
  }
  const before = [...s.records];
  addScheduledConstants(s, () => 0.6);
  assert.deepEqual(s.records, before);
  assert.deepEqual(s.constantEvents[0], {round:7,value:1,entryId:x.id,added:false});
  assert.equal(s.records[0], x);
});
test('constant additions keep their schedule independently of ten-round input growth', () => {
  const s = createSession('easy', rng(8));
  for (let round = 1; round <= 31; round++) {
    const q = generateQuestion(s, rng(round));
    assert.equal(s.mappings.length, 1 + Math.floor((round - 1) / 10));
    assert.equal(s.constantEvents.length, [7, 13, 19, 25, 31].filter(value => value <= round).length);
    submitAnswer(s, q, q.matchId !== null, 5);
  }
});
test('scheduled constant values vary across games and include negative values', () => {
  const values = new Set<number>();
  for (let seed = 1; seed <= 40; seed++) {
    const random = rng(seed * 1717), s = createSession('easy', random);
    for (let round = 1; round <= 7; round++) {
      const q = generateQuestion(s, random); submitAnswer(s, q, q.matchId !== null, 1);
    }
    values.add(s.constantEvents[0].value);
  }
  assert.ok(values.size >= 4);
  assert.ok([...values].some(value => value < 0));
  assert.ok([...values].some(value => value > 0));
});

test('candidate selection favors shorter displayed ASTs while retaining valid random choices', () => {
  const s = createSession('hard', rng(19));
  s.mappings = [inputMapping(-2, 1, 3), inputMapping(2, 3, 4)];
  const x = variable('x'), y = variable('y'), z = variable('z');
  const sum = binary('+', x, y), square = binary('*', sum, sum);
  for (const expr of [sum, square, binary('+', square, z), binary('-', binary('*', x, y), z)]) {
    if (!s.records.some(r => equivalentOnMappings(r.expr, expr, s.mappings))) {
      s.records.push({id: s.records.length + 1, expr, polynomial: normalize(expr)});
    }
  }
  const uniformLengths: number[] = [];
  for (const left of s.records) for (const right of s.records) for (const op of ['+', '-', '*'] as const) {
    const q = makeQuestion(s, left, right, op);
    if (q.matchId === null && withinLimits(q.expr, q.polynomial)) uniformLengths.push(formatComposition(q.expr).length);
  }
  const random = rng(123), choices = new Set<string>(); let totalLength = 0;
  for (let i = 0; i < 250; i++) {
    let first = true;
    const q = generateQuestion(s, () => { if (first) { first = false; return 0.75; } return random(); });
    assert.equal(q.matchId, null);
    assert.ok(s.records.includes(q.left) && s.records.includes(q.right));
    const text = formatComposition(q.expr); choices.add(text); totalLength += text.length;
  }
  const uniformMean = uniformLengths.reduce((a, b) => a + b, 0) / uniformLengths.length;
  assert.ok(totalLength / 250 < uniformMean * 0.8, `weighted ${totalLength / 250}, uniform ${uniformMean}`);
  assert.ok(choices.size > 10); // Preference must not collapse generation to a single shortest expression.
});

test('three mistakes or timeouts end play; repeated submission never costs another life', () => {
  const s = createSession('easy', rng(44));
  assert.equal(s.lives, 3); assert.equal(isGameOver(s), false);
  for (let mistake = 1; mistake <= 3; mistake++) {
    const q = generateQuestion(s, rng(mistake));
    const answer = submitAnswer(s, q, mistake === 2 ? null : !(q.matchId !== null), 0);
    assert.equal(answer.correct, false);
    assert.equal(s.lives, 3 - mistake);
    assert.equal(submitAnswer(s, q, true, 10), answer);
    assert.equal(s.lives, 3 - mistake);
  }
  assert.equal(s.answers.length, 3);
  assert.equal(isGameOver(s), true);
  assert.throws(() => generateQuestion(s), /종료/);
  assert.equal(createSession('easy').lives, 3);
});
test('surviving twelve rounds no longer ends a game', () => {
  const s = createSession('hard', rng(18));
  for (let round = 0; round < TEST_ROUNDS; round++) {
    const q = generateQuestion(s, rng(round));
    assert.equal(submitAnswer(s, q, q.matchId !== null, 5).correct, true);
    assert.equal(s.lives, 3);
  }
  assert.equal(isGameOver(s), false);
  assert.ok(generateQuestion(s, rng(999)));
});

test('difficulty eases mental arithmetic and scales the time bonus to each round duration', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const random = rng(919), s = createSession(difficulty, random), settings = difficulties[difficulty];
    assert.ok(Object.values(s.mappings[0]).every(value => value >= -BigInt(settings.inputBound) && value <= BigInt(settings.inputBound)));
    const q = generateQuestion(s, random);
    assert.equal(submitAnswer(s, q, q.matchId !== null, settings.seconds).earned, 200);
  }
  assert.equal(difficulties.easy.seconds, 45);
  assert.equal(difficulties.medium.seconds, 30);
  const square = binary('*', variable('x'), variable('x'));
  const cube = binary('*', square, variable('x'));
  assert.ok(withinDifficultyLimits(square, normalize(square), 'easy'));
  assert.equal(withinDifficultyLimits(cube, normalize(cube), 'easy'), false);
});

test('endless play passes old round, input and constant limits without exhausting generators', () => {
  for (const difficulty of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const random = rng(88), s = createSession(difficulty, random);
    for (let round = 0; round < 100; round++) {
      const q = generateQuestion(s, random);
      assert.equal(q.mappings.length, 1 + Math.floor(round / 10));
      assert.ok(s.records.includes(q.left) && s.records.includes(q.right));
      assert.ok(sameOutputs(q.outputs, outputsFor(q.expr, q.mappings)));
      submitAnswer(s, q, q.matchId !== null, 5);
      assert.equal(s.lives, 3);
      assert.equal(isGameOver(s), false);
      assert.ok(s.recent.length <= 48);
    }
    assert.equal(s.constantEvents.length, 16);
    const keys = s.mappings.map(input => difficulties[difficulty].variables.map(v => input[v].toString()).join(','));
    assert.equal(new Set(keys).size, s.mappings.length);
    const valueCount = difficulties[difficulty].constantBound * 2 + 1;
    for (let index = 0; index + valueCount <= s.constantEvents.length; index += valueCount) {
      assert.equal(new Set(s.constantEvents.slice(index, index + valueCount).map(event => event.value)).size, valueCount);
    }
  }
});

test('custom time and variable count override either preset independently, including later inputs', () => {
  for (const variableCount of [1, 2, 3]) for (const seconds of [5, 47, 120]) {
    const random = rng(variableCount * seconds);
    const options = {seconds, variableCount};
    const s = createSession('hard', random, options);
    options.seconds = 18; options.variableCount = 1;
    assert.equal(s.settings.seconds, seconds);
    assert.equal(s.records.length, variableCount);
    assert.equal(s.settings.variables.length, variableCount);
    for (let round = 0; round < 11; round++) {
      const q = generateQuestion(s, random);
      const expectedMatch = s.records.find(r => equivalentOnMappings(r.expr, q.expr, q.mappings))?.id ?? null;
      assert.equal(q.matchId, expectedMatch);
      const a = submitAnswer(s, q, q.matchId !== null, seconds / 2);
      assert.equal(a.earned, 150);
      assert.equal(s.lives, 3);
    }
    assert.equal(s.mappings.length, 2);
    assert.equal(difficulties.hard.seconds, 20);
    assert.equal(difficulties.hard.variables.length, 3);
  }
});
test('custom settings reject invalid times and variable counts before starting a game', () => {
  for (const seconds of [0, 4, 121, NaN, Infinity, 5.5]) {
    assert.throws(() => createSession('easy', rng(1), {seconds, variableCount:1}));
  }
  for (const variableCount of [0, 4, NaN, 1.5]) {
    assert.throws(() => createSession('easy', rng(1), {seconds:18, variableCount}));
  }
});

test('large archives can generate with recent as well as old representatives, checking answers against the whole archive', () => {
  const s = createSession('hard', rng(1));
  // This synthetic archive uses longer representatives than the playable presets.
  s.settings = {...s.settings, maxLength:60, maxNodes:19, maxCoefficient:128, maxOutput:512};
  s.mappings = [inputMapping(1, 0, 0), inputMapping(2, 0, 0)];
  s.records = [];
  for (let a = -4; a <= 4; a++) for (let b = -8; b <= 8; b++) {
    const expr = binary('+', binary('*', constant(a), variable('x')), constant(b));
    s.records.push({id:s.records.length + 1, expr, polynomial:normalize(expr)});
  }
  const random = rng(20261029); let old = 0, recent = 0;
  for (let i = 0; i < 32; i++) {
    const q = generateQuestion(s, random);
    assert.ok(s.records.includes(q.left) && s.records.includes(q.right));
    assert.equal(q.matchId, s.records.find(r => equivalentOnMappings(r.expr, q.expr, q.mappings))?.id ?? null);
    if (q.left.id < 40 || q.right.id < 40) old++;
    if (q.left.id > 114 || q.right.id > 114) recent++;
  }
  assert.ok(old > 5, `Old representatives only appeared ${old} times`);
  assert.ok(recent > 5, `Recent representatives only appeared ${recent} times`);
});


test('timer colors switch at half and quarter of the configured duration, including exact boundaries', () => {
  for (const seconds of [5, 12, 18, 47, 120]) {
    assert.equal(timeTone(seconds, seconds), 'normal');
    assert.equal(timeTone(seconds / 2 + .001, seconds), 'normal');
    assert.equal(timeTone(seconds / 2, seconds), 'warning');
    assert.equal(timeTone(seconds / 4 + .001, seconds), 'warning');
    assert.equal(timeTone(seconds / 4, seconds), 'critical');
    assert.equal(timeTone(0, seconds), 'critical');
  }
});
