import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoAdvance, type DelayClock } from './auto-advance.ts';
function fakeClock() {
  let now = 0, nextId = 0;
  const jobs = new Map<number, { at: number; callback: () => void }>();
  const clock: DelayClock = {
    now: () => now,
    schedule(callback, delay) {
      const id = ++nextId;
      jobs.set(id, { at: now + delay, callback });
      return () => { jobs.delete(id); };
    },
  };
  return { clock, tick(ms: number) {
    const until = now + ms;
    while (true) {
      const job = [...jobs].sort((a, b) => a[1].at - b[1].at).find(([, job]) => job.at <= until);
      if (!job) break;
      now = job[1].at; jobs.delete(job[0]); job[1].callback();
    }
    now = until;
  } };
}
test('feedback advances exactly once after 2000ms, never before', () => {
  const { clock, tick } = fakeClock(); let rounds = 0;
  const advance = new AutoAdvance(() => rounds++, clock);
  advance.start(); tick(1999); assert.equal(rounds, 0);
  tick(1); assert.equal(rounds, 1);
  tick(5000); assert.equal(rounds, 1);
});
test('hidden tab or help pauses the remaining feedback delay until explicit resume', () => {
  const { clock, tick } = fakeClock(); let rounds = 0;
  const advance = new AutoAdvance(() => rounds++, clock);
  advance.start(); tick(200); advance.pause(); advance.pause();
  tick(10000); assert.equal(rounds, 0);
  advance.resume(); advance.resume(); tick(1799); assert.equal(rounds, 0);
  tick(1); assert.equal(rounds, 1);
});
test('restart and cancellation prevent stale feedback from advancing another round', () => {
  const { clock, tick } = fakeClock(); let rounds = 0;
  const advance = new AutoAdvance(() => rounds++, clock);
  advance.start(); tick(300); advance.start(); tick(200); assert.equal(rounds, 0);
  tick(1800); assert.equal(rounds, 1);
  advance.start(); advance.cancel(); advance.resume(); tick(1000); assert.equal(rounds, 1);
});

test('custom transition delays preserve remaining time across pause and resume', () => {
  const { clock, tick } = fakeClock(); let questionStarted = 0;
  const introduction = new AutoAdvance(() => questionStarted++, clock);
  introduction.start(900); tick(400); introduction.pause();
  tick(5000); assert.equal(questionStarted, 0);
  introduction.resume(); tick(499); assert.equal(questionStarted, 0);
  tick(1); assert.equal(questionStarted, 1);
});
