import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AdditionTransition, ARRIVAL_DURATION_MS, ARRIVAL_HOLD_OFFSET, type ArrivalTarget } from './addition-transition.ts';
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(reduced = false) {
  const animations: FakeAnimation[] = [], ghosts: FakeNode[] = [];
  class FakeAnimation {
    state = 'running';
    keyframes: Keyframe[];
    private resolve!: () => void;
    private reject!: (error: Error) => void;
    finished = new Promise<void>((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    constructor(keyframes: Keyframe[]) { this.keyframes = keyframes; }
    pause() { this.state = 'paused'; }
    play() { this.state = 'running'; }
    finish() { this.state = 'finished'; this.resolve(); }
    cancel() { this.state = 'cancelled'; this.reject(new Error('cancelled')); }
  }
  class FakeNode {
    removed = false;
    inert = false;
    style: Record<string, string> = {};
    innerHTML = '';
    children: FakeNode[] = [];
    append(node: FakeNode) { this.children.push(node); }
    classes: Set<string>;
    rect: {left: number; top: number; width: number; height: number};
    classList = {
      add: (...names: string[]) => names.forEach(name => this.classes.add(name)),
      remove: (...names: string[]) => names.forEach(name => this.classes.delete(name)),
    };
    constructor(left: number, top: number, width: number, height: number, classes: string[] = []) {
      this.rect = {left, top, width, height}; this.classes = new Set(classes);
    }
    removeAttribute() {}
    setAttribute() {}
    querySelectorAll() { return []; }
    getBoundingClientRect() { return this.rect; }
    cloneNode() { return new FakeNode(this.rect.left, this.rect.top, this.rect.width, this.rect.height, [...this.classes]); }
    remove() { this.removed = true; }
    animate(keyframes: Keyframe[]) { const animation = new FakeAnimation(keyframes); animations.push(animation); return animation; }
  }
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = ['window', 'document', 'getComputedStyle'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {matchMedia: () => ({matches: reduced}), scrollX: 0, scrollY: 0} });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {body: {append: (node: FakeNode) => ghosts.push(node)}, createElement: () => new FakeNode(0, 0, 0, 0)} });
  Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: () => ({font: '20px Georgia'}) });
  const host = new FakeNode(20, 250, 400, 350);
  const outgoing = new FakeNode(20, 250, 400, 350);
  const puzzle = new FakeNode(20, 250, 400, 350, ['preparing']);
  const targets = [new FakeNode(250, 130, 60, 50, ['arrival-target']), new FakeNode(70, 220, 45, 25, ['arrival-target'])];
  return { animations, ghosts, host, outgoing, puzzle, targets, restore() {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globals[name];
    }
  } };
}
test('puzzle fades out, additions fly to their real slots, then question fades in before completion', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const run = transition.run(f.host as unknown as HTMLElement, f.outgoing as unknown as HTMLElement, f.puzzle as unknown as HTMLElement, f.targets.map(target => ({parts: [target], reveal: [target]})) as unknown as ArrivalTarget[], () => completed++);
    assert.equal(f.animations.length, 1);
    assert.equal(f.ghosts.length, 0);
    assert.deepEqual(f.animations[0].keyframes, [{opacity:1},{opacity:0}]);
    transition.pause(); assert.equal(f.animations[0].state, 'paused'); transition.resume();
    f.animations[0].finish(); await flush();
    assert.equal(f.outgoing.removed, true);
    assert.equal(f.ghosts.length, 2);
    assert.equal(completed, 0);
    f.ghosts.forEach((ghost, i) => {
      assert.equal(ghost.style.left, `${f.targets[i].rect.left}px`);
      assert.equal(ghost.style.top, `${f.targets[i].rect.top}px`);
      assert.equal(ghost.style.background, 'transparent');
      assert.equal(ghost.style.boxShadow, 'none');
    });
    for (const animation of f.animations.slice(1)) {
      assert.match(String(animation.keyframes[0].transform), /translate.*scale\(1.8\)/);
      assert.equal(animation.keyframes.at(-1)!.transform, 'translate(0, 0) scale(1)');
      assert.ok(ARRIVAL_DURATION_MS * (ARRIVAL_HOLD_OFFSET - .1) >= 1500);
      assert.equal(animation.keyframes[1].transform, animation.keyframes[2].transform);
    }
    transition.pause(); assert.equal(f.animations[1].state, 'paused'); transition.resume();
    f.animations[1].finish(); f.animations[2].finish(); await flush();
    assert.ok(f.targets.every(target => !target.classes.has('arrival-target')));
    assert.ok(f.ghosts.every(ghost => ghost.removed));
    assert.equal(f.animations.length, 4);
    assert.equal(completed, 0);
    f.animations[3].finish(); await run;
    assert.equal(completed, 1);
  } finally { transition.cancel(); f.restore(); }
});
test('cancelling a flight cleans up temporary items and never starts the next timer', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const run = transition.run(f.host as unknown as HTMLElement, f.outgoing as unknown as HTMLElement, f.puzzle as unknown as HTMLElement, f.targets.map(target => ({parts: [target], reveal: [target]})) as unknown as ArrivalTarget[], () => completed++);
    f.animations[0].finish(); await flush();
    transition.cancel(); await run;
    assert.equal(completed, 0);
    assert.ok(f.ghosts.every(ghost => ghost.removed));
    assert.ok(f.targets.every(target => !target.classes.has('arrival-target')));
  } finally { transition.cancel(); f.restore(); }
});

test('a tuple column moves as one group and reveals every coordinate together', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const run = transition.run(f.host as unknown as HTMLElement, null, f.puzzle as unknown as HTMLElement, [{parts:f.targets, reveal:f.targets}] as unknown as ArrivalTarget[], () => completed++);
    assert.equal(f.ghosts.length, 1);
    assert.equal(f.ghosts[0].children.length, 2);
    assert.equal(f.ghosts[0].style.left, '70px');
    assert.equal(f.ghosts[0].style.top, '130px');
    assert.equal(f.ghosts[0].style.height, '115px');
    f.animations[0].finish(); await flush();
    assert.ok(f.targets.every(target => !target.classes.has('arrival-target')));
    f.animations[1].finish(); await run;
    assert.equal(completed, 1);
  } finally { transition.cancel(); f.restore(); }
});

test('a correct novel expression leaves the puzzle and reaches the archive before its slot is revealed', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const target = f.targets[0];
    const run = transition.store(f.puzzle as unknown as HTMLElement, {parts:[target], reveal:[target]} as unknown as ArrivalTarget, () => completed++);
    assert.equal(f.animations.length, 2);
    assert.equal(f.ghosts.length, 1);
    assert.equal(f.ghosts[0].style.background, 'transparent');
    assert.ok(target.classes.has('arrival-target'));
    transition.pause(); assert.ok(f.animations.every(animation => animation.state === 'paused')); transition.resume();
    f.animations[0].finish(); await flush();
    assert.equal(completed, 0);
    assert.ok(target.classes.has('arrival-target'));
    f.animations[1].finish(); await run;
    assert.equal(completed, 1);
    assert.ok(!target.classes.has('arrival-target'));
    assert.equal(f.puzzle.style.opacity, '0');
    assert.ok(f.ghosts.every(ghost => ghost.removed));
  } finally { transition.cancel(); f.restore(); }
});

test('expression arrivals carry a frame from the center into the full archive card', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const part = f.targets[0], card = part.cloneNode();
    card.rect = {left:240, top:120, width:80, height:70};
    const run = transition.run(f.host as unknown as HTMLElement, null, f.puzzle as unknown as HTMLElement, [{parts:[part], reveal:[part], frame:card}] as unknown as ArrivalTarget[], () => completed++);
    const ghost = f.ghosts[0];
    assert.ok(ghost.classes.has('framed-flight'));
    assert.match(ghost.style.border, /solid/);
    assert.equal(ghost.style.width, '80px');
    assert.equal(ghost.style.left, '240px');
    assert.equal(ghost.children[0].style.left, '10px');
    assert.equal(ghost.style.background, 'transparent');
    f.animations[0].finish(); await flush();
    f.animations[1].finish(); await run;
    assert.equal(completed, 1);
  } finally { transition.cancel(); f.restore(); }
});

test('an existing expression is absorbed into its representative, with a pausable arrival pulse', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    f.puzzle.innerHTML = '<math><mi>x</mi><mo>×</mo><mi>x</mi></math>';
    f.targets[0].innerHTML = '<math><mi>x</mi></math>';
    const run = transition.absorb(f.puzzle as unknown as HTMLElement, f.targets[0] as unknown as HTMLElement, () => completed++);
    assert.equal(f.ghosts.length, 1);
    assert.equal(f.ghosts[0].innerHTML, f.puzzle.innerHTML); // The discarded form travels, not a copy of the representative.
    assert.ok(f.ghosts[0].classes.has('absorption-flight'));
    assert.equal(f.animations[1].keyframes.at(-1)!.opacity, 0);
    assert.match(String(f.animations[1].keyframes.at(-1)!.transform), /translate.*scale\(\.08\)/);
    transition.pause(); assert.ok(f.animations.every(a => a.state === 'paused')); transition.resume();
    f.animations[0].finish(); f.animations[1].finish(); await flush();
    assert.equal(f.puzzle.style.opacity, '0');
    assert.equal(completed, 0);
    assert.ok(f.ghosts.every(ghost => ghost.removed));
    assert.equal(f.targets[0].innerHTML, '<math><mi>x</mi></math>');
    transition.pause(); assert.equal(f.animations[2].state, 'paused'); transition.resume();
    f.animations[2].finish(); await run;
    assert.equal(completed, 1);
  } finally {transition.cancel(); f.restore();}
});
test('leaving during absorption removes the ghost and prevents stale completion', async () => {
  const f = fixture(); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const run = transition.absorb(f.puzzle as unknown as HTMLElement, f.targets[0] as unknown as HTMLElement, () => completed++);
    transition.cancel(); await run;
    assert.equal(completed, 0);
    assert.ok(f.ghosts.every(ghost => ghost.removed));
    assert.equal(f.animations.length, 2);
  } finally {transition.cancel(); f.restore();}
});
test('reduced motion uses only opacity for absorption and representative emphasis', async () => {
  const f = fixture(true); let completed = 0;
  const transition = new AdditionTransition();
  try {
    const run = transition.absorb(f.puzzle as unknown as HTMLElement, f.targets[0] as unknown as HTMLElement, () => completed++);
    assert.ok(f.animations[1].keyframes.every(frame => frame.transform === 'none'));
    f.animations[0].finish(); f.animations[1].finish(); await flush();
    assert.ok(f.animations[2].keyframes.every(frame => !frame.transform));
    f.animations[2].finish(); await run; assert.equal(completed, 1);
  } finally {transition.cancel(); f.restore();}
});
