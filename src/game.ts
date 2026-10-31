import { ExactOutputIndex } from './output-index.ts';
import { sampleCombinationIndices } from './candidate-sampling.ts';
import { binary, combine, constant, format, formatComposition, nonzeroConstant, normalize, nodeCount, variable, withinLimits, type Expr, type Operator, type Polynomial, type Variable } from './math.ts';
export type Difficulty = 'easy' | 'medium' | 'hard';
export interface DifficultySettings {
  name: string; variables: Variable[]; seconds: number; inputBound: number; constantBound: number;
  maxLength: number; maxNodes: number; maxDegree: number; maxCoefficient: number; maxOutput: number;
}
export const difficulties: Record<Difficulty, DifficultySettings> = {
  easy: { name: '쉬움', variables: ['x'], seconds: 45, inputBound: 2, constantBound: 2, maxLength: 22, maxNodes: 5, maxDegree: 2, maxCoefficient: 8, maxOutput: 16 },
  medium: { name: '중간', variables: ['x', 'y'], seconds: 30, inputBound: 2, constantBound: 2, maxLength: 28, maxNodes: 7, maxDegree: 2, maxCoefficient: 16, maxOutput: 36 },
  hard: { name: '어려움', variables: ['x', 'y', 'z'], seconds: 20, inputBound: 3, constantBound: 3, maxLength: 34, maxNodes: 9, maxDegree: 2, maxCoefficient: 24, maxOutput: 64 },
};
export const STARTING_LIVES = 3;
export const timeTone = (remaining:number, seconds:number) => remaining <= seconds / 4 ? 'critical' : remaining <= seconds / 2 ? 'warning' : 'normal';
export const MAPPING_INTERVAL = 10;
export const CONSTANT_INTERVAL = 6;
export const GAME_OPERATORS: Operator[] = ['+', '-', '*'];
export const CONSTANT_BOUND = 4;
export interface ConstantEvent { round: number; value: number; entryId: number; added: boolean }
export type InputMapping = Readonly<Record<Variable, bigint>>;
export const INPUT_BOUND = 4;
export const inputMapping = (x: number, y: number, z: number): InputMapping => Object.freeze({ x: BigInt(x), y: BigInt(y), z: BigInt(z) });
const valuesWithin = (bound: number) => Array.from({ length: bound * 2 + 1 }, (_, i) => i - bound);
function pick(values: readonly number[], random: () => number): number {
  return values[Math.min(values.length - 1, Math.max(0, Math.floor(random() * values.length)))];
}
function randomMapping(settings: DifficultySettings, previous: readonly InputMapping[], random: () => number): InputMapping {
  const vars = settings.variables;
  let bound = settings.inputBound;
  while ((2 * bound + 1) ** vars.length <= previous.length) bound++;
  const inputValues = valuesWithin(bound);
  if (!previous.length) {
    // Distinct, nonzero starting coordinates keep the initial representatives usable.
    const values = inputValues.filter(value => value !== 0);
    const take = () => { const value = pick(values, random); values.splice(values.indexOf(value), 1); return value; };
    return inputMapping(take(), take(), take());
  }
  const isNew = (candidate: InputMapping) => !previous.some(input => vars.every(v => input[v] === candidate[v]));
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = inputMapping(pick(inputValues, random), pick(inputValues, random), pick(inputValues, random));
    if (isNew(candidate)) return candidate;
  }
  // Among N+1 distinct tuples, at least one is absent from N previous inputs.
  const radix = inputValues.length;
  for (let index = 0; index <= previous.length; index++) {
    let code = index;
    const coordinates = {x: 0, y: 0, z: 0};
    for (const variable of vars) {
      coordinates[variable] = inputValues[code % radix]; code = Math.floor(code / radix);
    }
    const candidate = inputMapping(coordinates.x, coordinates.y, coordinates.z);
    if (isNew(candidate)) return candidate;
  }
  throw new Error('추가할 입력이 없습니다.');
}
export interface Entry { id: number; expr: Expr; polynomial: Polynomial }
export interface Question {
  left: Entry; right: Entry; op: Operator; expr: Expr; polynomial: Polynomial;
  matchId: number | null; mappings: readonly InputMapping[]; outputs: bigint[];
}
export interface Answer { question: Question; choice: boolean | null; correct: boolean; earned: number; replaced: Entry | null }
export interface Session { lives: number; difficulty: Difficulty; settings: DifficultySettings; records: Entry[]; mappings: InputMapping[]; answers: Answer[]; score: number; streak: number; recent: string[]; constantEvents: ConstantEvent[] }
export function evaluate(expr: Expr, input: InputMapping): bigint {
  if (expr.kind === 'constant') return expr.value;
  if (expr.kind === 'variable') return input[expr.name];
  const a = evaluate(expr.left, input), b = evaluate(expr.right, input);
  if (expr.op === '+') return a + b;
  if (expr.op === '-') return a - b;
  if (expr.op === '*') return a * b;
  throw new Error('지원하지 않는 연산입니다.');
}
export const outputsFor = (expr: Expr, mappings: readonly InputMapping[]) => mappings.map(input => evaluate(expr, input));
export function sameOutputs(a: readonly bigint[], b: readonly bigint[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
export const equivalentOnMappings = (a: Expr, b: Expr, mappings: readonly InputMapping[]) => sameOutputs(outputsFor(a, mappings), outputsFor(b, mappings));
export function initialRecords(d: Difficulty, variables = difficulties[d].variables): Entry[] {
  return variables.map((name, i) => { const expr = variable(name); return { id: i + 1, expr, polynomial: normalize(expr) }; });
}
export interface GameOptions { seconds: number; variableCount: number }
/** Presets only select time and variable count; arithmetic limits follow the variable count. */
export function resolveSettings(difficulty: Difficulty, options?: GameOptions): DifficultySettings {
  const seconds = options?.seconds ?? difficulties[difficulty].seconds;
  const count = options?.variableCount ?? difficulties[difficulty].variables.length;
  if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) throw new Error('제한 시간은 5~120초의 정수여야 합니다.');
  if (![1, 2, 3].includes(count)) throw new Error('변수 개수는 1~3개여야 합니다.');
  const base = difficulties[(['easy', 'medium', 'hard'] as Difficulty[])[count - 1]];
  return {...base, variables: [...base.variables], seconds};
}
export function createSession(difficulty: Difficulty, random = Math.random, options?: GameOptions): Session {
  const settings = resolveSettings(difficulty, options);
  const records = initialRecords(difficulty, settings.variables);
  return {lives:STARTING_LIVES, difficulty, settings, records, mappings:[randomMapping(settings, [], random)], answers:[], score:0, streak:0, recent:[], constantEvents:[]};
}
export const isGameOver = (s: Session) => s.lives <= 0;
/** Expand inputs only before the next round. Discarded expressions are never restored. */
export function addScheduledMappings(s: Session, random = Math.random): void {
  const due = 1 + Math.floor(s.answers.length / MAPPING_INTERVAL);
  while (s.mappings.length < due) s.mappings.push(randomMapping(s.settings, s.mappings, random));
}
/** Retain the shortest encountered representative, preserving its slot and immutable snapshots. */
function retainExpression(s: Session, expr: Expr, polynomial: Polynomial, mappings: readonly InputMapping[]) {
  const index = s.records.findIndex(r => equivalentOnMappings(r.expr, expr, mappings));
  if (index < 0) {
    const entry = {id: Math.max(...s.records.map(r => r.id)) + 1, expr, polynomial};
    s.records.push(entry);
    return {entry, added:true, replaced:null};
  }
  const before = s.records[index];
  if (format(expr).length < format(before.expr).length) {
    const entry = {id:before.id, expr, polynomial};
    s.records[index] = entry;
    return {entry, added:false, replaced:before};
  }
  return {entry:before, added:false, replaced:null};
}
/** Scheduled constants follow the same shortest-representative rule as candidates. */
export function addScheduledConstants(s: Session, random = Math.random): void {
  const due = Math.floor(s.answers.length / CONSTANT_INTERVAL);
  while (s.constantEvents.length < due) {
    const round = (s.constantEvents.length + 1) * CONSTANT_INTERVAL + 1;
    const values = valuesWithin(s.settings.constantBound);
    const cycleStart = Math.floor(s.constantEvents.length / values.length) * values.length;
    const available = values.filter(value => !s.constantEvents.slice(cycleStart).some(event => event.value === value));
    const novel = available.filter(value => !s.records.some(r => equivalentOnMappings(r.expr, constant(value), s.mappings)));
    const value = pick(novel.length ? novel : available, random);
    const expr = constant(value);
    const {entry, added} = retainExpression(s, expr, normalize(expr), s.mappings);
    s.constantEvents.push({ round, value, entryId: entry.id, added });
  }
}
const signature = (q: Question) => `${q.left.id}:${q.op}:${q.right.id}`;
function isIdentity(q: Question): boolean {
  const a = nonzeroConstant(q.left.polynomial), b = nonzeroConstant(q.right.polynomial);
  return (q.op === '+' && (!q.left.polynomial.size || !q.right.polynomial.size)) ||
    (q.op === '-' && !q.right.polynomial.size) ||
    (q.op === '*' && (!q.left.polynomial.size || !q.right.polynomial.size || a?.toString() === '1' || b?.toString() === '1'));
}
export function makeQuestion(s: Session, left: Entry, right: Entry, op: Operator): Question {
  const expr = binary(op, left.expr, right.expr), polynomial = combine(op, left.polynomial, right.polynomial);
  const mappings = [...s.mappings], outputs = outputsFor(expr, mappings);
  const matchId = s.records.find(r => sameOutputs(outputsFor(r.expr, mappings), outputs))?.id ?? null;
  return { left, right, op, expr, polynomial, mappings, outputs, matchId };
}
export function withinDifficultyLimits(expr: Expr, polynomial: Polynomial, difficulty: Difficulty | DifficultySettings): boolean {
  const settings = typeof difficulty === 'string' ? difficulties[difficulty] : difficulty;
  return withinLimits(expr, polynomial) && formatComposition(expr).length <= settings.maxLength && nodeCount(expr) <= settings.maxNodes &&
    [...polynomial].every(([key, coefficient]) => key.split(',').map(Number).reduce((a, b) => a + b, 0) <= settings.maxDegree &&
      (coefficient < 0n ? -coefficient : coefficient) <= BigInt(settings.maxCoefficient));
}
/** Bounded pool; every candidate uses actual current representatives. */
export function generateQuestion(s: Session, random = Math.random): Question {
  if (isGameOver(s)) throw new Error('게임이 종료되었습니다.');
  addScheduledMappings(s, random);
  addScheduledConstants(s, random);
  const duplicates: Question[] = [], novel: Question[] = [];
  const vectors = new Map(s.records.map(r => [r.id, outputsFor(r.expr, s.mappings)]));
  const representatives = new ExactOutputIndex();
  for (const entry of s.records) representatives.add(vectors.get(entry.id)!, entry.id);
  const count = s.records.length;
  for (const index of sampleCombinationIndices(count, random)) {
    const left = s.records[Math.floor(index / (count * 3))];
    const right = s.records[Math.floor(index / 3) % count];
    const op = GAME_OPERATORS[index % 3];
    const polynomial = combine(op, left.polynomial, right.polynomial), expr = binary(op, left.expr, right.expr);
    if (!withinDifficultyLimits(expr, polynomial, s.settings)) continue;
    const outputs = vectors.get(left.id)!.map((a, i) => {
      const b = vectors.get(right.id)![i]; return op === '+' ? a + b : op === '-' ? a - b : a * b;
    });
    if (outputs.some(w => (w < 0n ? -w : w) > BigInt(s.settings.maxOutput))) continue;
    const matchId = representatives.find(outputs);
    const q: Question = { left, right, op, expr, polynomial, matchId, mappings: [...s.mappings], outputs };
    if (!s.recent.includes(signature(q))) (matchId === null ? novel : duplicates).push(q);
  }
  // Independent draws avoid revealing the next answer through forced pair balancing.
  const targetDuplicate = random() < 0.55;
  const preferred = targetDuplicate ? duplicates : novel;
  let pool = preferred.length ? preferred : [...duplicates, ...novel];
  if (!pool.length) {
    const left = s.records[0], zero = s.records.find(r => r.polynomial.size === 0);
    return makeQuestion(s, left, zero ?? left, zero ? '+' : '-');
  }
  // Keep the opening gentle, then allow a little more structure without long nests.
  const opening = s.answers.length < 10 ? pool.filter(q => nodeCount(q.expr) <= 5) : [];
  if (opening.length) pool = opening;
  const shortest = Math.min(...pool.map(q => formatComposition(q.expr).length));
  pool = pool.filter(q => formatComposition(q.expr).length <= shortest + 8);
  const weights = pool.map(q => {
    const base = isIdentity(q) ? 0.15 : nonzeroConstant(q.left.polynomial) && nonzeroConstant(q.right.polynomial) ? 0.4 : 1;
    // Measure the displayed AST, including grouping; never replace the chosen expression.
    const length = formatComposition(q.expr).length;
    const match = q.matchId === null ? undefined : s.records.find(r => r.id === q.matchId);
    const lookupLength = match ? formatComposition(match.expr).length : 0;
    return base * (8 / (8 + length)) ** 4 * (8 / (8 + lookupLength));
  });
  let ticket = random() * weights.reduce((a, b) => a + b, 0);
  return pool.find((_, i) => (ticket -= weights[i]) < 0) ?? pool[pool.length - 1];
}
export function submitAnswer(s: Session, q: Question, choice: boolean | null, remaining: number): Answer {
  const existing = s.answers.find(a => a.question === q);
  if (existing) return existing;
  if (isGameOver(s)) throw new Error('게임이 종료되었습니다.');
  const correct = choice !== null && choice === (q.matchId !== null);
  const seconds = s.settings.seconds;
  const earned = correct ? 100 + Math.ceil(Math.min(seconds, Math.max(0, remaining)) / seconds * 100) : 0;
  const {replaced} = retainExpression(s, q.expr, q.polynomial, q.mappings);
  const answer: Answer = { question: q, choice, correct, earned, replaced };
  if (!correct) s.lives = Math.max(0, s.lives - 1);
  s.score += earned; s.streak = correct ? s.streak + 1 : 0;
  s.answers.push(answer); s.recent.push(signature(q));
  if (s.recent.length > 48) s.recent.splice(0, s.recent.length - 48);
  return answer;
}
