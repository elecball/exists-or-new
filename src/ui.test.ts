import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {Window} from 'happy-dom';
import {createSession, generateQuestion, submitAnswer} from './game.ts';

// Execute the actual app bundle, with deterministic time and animation support.
// This checks DOM behavior, not pixel rendering or real-browser compatibility.
const bundled = await build({logLevel:'silent', build:{write:false, minify:false}});
if (Array.isArray(bundled) || !('output' in bundled)) throw new Error('Expected one application bundle');
const code = bundled.output.find(file => file.type === 'chunk' && file.isEntry);
if (!code || code.type !== 'chunk') throw new Error('Missing application entry');
const appCode = code.code;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function rng(seed:number) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
function app(seed = 8241, language:'ko' | 'en' | null = null, saved:Record<string,string> = {}) {
  const w = new Window({url:`https://example.test/exists-or-new/${language ? '?lang=' + language : ''}`, settings:{enableJavaScriptEvaluation:true, suppressInsecureJavaScriptEnvironmentWarning:true}});
  Object.defineProperty(w, 'Math', {configurable:true, value:Object.assign(Object.create(Math), {random:rng(seed)})});
  let now = 0, id = 0;
  const jobs = new Map<number, {at:number; callback:() => void}>();
  const schedule = (callback:() => void, delay:number) => { const key = ++id; jobs.set(key, {at:now + delay, callback}); return key; };
  Object.assign(w, {
    setTimeout:(callback:() => void, delay = 0) => schedule(callback, delay),
    clearTimeout:(key:number) => { jobs.delete(key); },
    requestAnimationFrame:(callback:(time:number) => void) => schedule(() => callback(now), 16),
    cancelAnimationFrame:(key:number) => { jobs.delete(key); },
  });
  Object.defineProperty(w, 'performance', {configurable:true, value:{now:() => now}});
  Object.defineProperty(w.document, 'hidden', {configurable:true, value:false});
  w.HTMLElement.prototype.scrollIntoView = () => {};
  // Animation timing is tested separately; here animations finish in a microtask.
  w.HTMLElement.prototype.animate = (() => ({finished:Promise.resolve(), cancel() {}, pause() {}, play() {}})) as unknown as typeof w.HTMLElement.prototype.animate;
  w.document.body.innerHTML = '<div id="app"></div>';
  for (const [key, value] of Object.entries(saved)) w.localStorage.setItem(key, value);
  w.eval(appCode);
  const doc = w.document;
  const click = (selector:string) => {
    const button = doc.querySelector(selector);
    assert.ok(button, `Missing ${selector}`); (button as unknown as HTMLButtonElement).click();
  };
  const tick = async (ms:number) => {
    const until = now + ms;
    let count = 0;
    while (true) {
      const next = [...jobs].filter(([, job]) => job.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++count < 20000, 'Timer loop did not settle');
      now = next[1].at; jobs.delete(next[0]); next[1].callback(); await flush();
    }
    now = until; await flush();
  };
  const slide = (selector:string, value:number) => {
    const input = doc.querySelector(selector) as unknown as HTMLInputElement;
    input.value = String(value); input.dispatchEvent(new w.Event('input') as unknown as Event);
  };
  return {w, doc, click, tick, slide, close:() => w.close()};
}

test('the optional tutorial teaches four scenes and preserves chosen settings', async () => {
  const a = app();
  try {
    a.slide('#seconds', 47); a.slide('#variables', 3);
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '47초');
    assert.equal(a.doc.querySelector('#variables-value')!.textContent, '3개');
    a.click('#tutorial');
    assert.ok(a.doc.querySelector('.tutorial'));
    for (const choice of [false, true, false, true]) {
      a.click(`[data-choice="${choice}"]`); await flush();
      assert.equal((a.doc.querySelector('#tutorial-next') as unknown as {disabled:boolean}).disabled, false);
      a.click('#tutorial-next'); await flush();
    }
    await a.tick(48);
    assert.ok(a.doc.querySelector('.game:not(.tutorial)'));
    assert.equal(a.doc.querySelectorAll('.input-table tr').length, 3);
    for (const cell of a.doc.querySelectorAll('.input-table td')) assert.ok(cell.getAttribute('aria-label')!.endsWith(`= ${cell.textContent.replace(/−/g, '-')}`));
    assert.ok(Number(a.doc.querySelector('#time')!.textContent) > 46);
  } finally {await a.close();}
});

test('wrong tutorial answers retry and skip starts the selected game', async () => {
  const a = app();
  try {
    a.click('#tutorial'); a.click('[data-choice="true"]');
    assert.equal(a.doc.querySelector('#tutorial-next'), null);
    assert.match(a.doc.querySelector('.tutorial-response')!.textContent, /한 번 더/);
    a.click('#tutorial-skip'); await a.tick(48);
    assert.ok(a.doc.querySelector('#exists'));
  } finally {await a.close();}
});

test('play starts immediately; timeouts have no hints, advance after two seconds and allow replay', async () => {
  const a = app();
  try {
    a.slide('#seconds', 5); a.click('#start'); await a.tick(5100);
    assert.ok(a.doc.querySelector('.feedback.incorrect'));
    assert.match(a.doc.querySelector('.lives')!.getAttribute('aria-label')!, /2개/);
    assert.equal(a.doc.querySelector('.first-mistake-hint'), null);
    const score = a.doc.querySelector('.score-item strong')!.textContent;
    a.click('#exists'); a.click('#novel');
    assert.equal(a.doc.querySelector('.score-item strong')!.textContent, score);
    await a.tick(1900); assert.ok(a.doc.querySelector('.feedback'));
    await a.tick(100); assert.equal(a.doc.querySelector('.feedback'), null);
    await a.tick(5100);
    assert.equal(a.doc.querySelector('.first-mistake-hint'), null);
    assert.match(a.doc.querySelector('.lives')!.getAttribute('aria-label')!, /1개/);
    await a.tick(2000); await a.tick(5100); await a.tick(2000); assert.match(a.doc.querySelector('.results h1')!.textContent, /Game over/);
    a.click('#replay'); await a.tick(48);
    assert.match(a.doc.querySelector('.lives')!.getAttribute('aria-label')!, /3개/);
  } finally {await a.close();}
});

test('help and hidden tabs freeze the countdown and the remaining feedback delay', async () => {
  const a = app();
  try {
    a.slide('#seconds', 5); a.click('#start'); await a.tick(1048);
    a.click('#pause');
    const time = a.doc.querySelector('#time')!.textContent;
    await a.tick(10000); assert.equal(a.doc.querySelector('#time')!.textContent, time);
    a.click('#close-modal'); await a.tick(1000);
    assert.ok(Number(a.doc.querySelector('#time')!.textContent) < Number(time));
    Object.defineProperty(a.doc, 'hidden', {configurable:true, value:true});
    a.doc.dispatchEvent(new a.w.Event('visibilitychange'));
    const hiddenTime = a.doc.querySelector('#time')!.textContent;
    await a.tick(10000); assert.equal(a.doc.querySelector('#time')!.textContent, hiddenTime);
    Object.defineProperty(a.doc, 'hidden', {configurable:true, value:false});
    a.doc.dispatchEvent(new a.w.Event('visibilitychange')); await a.tick(3200);
    assert.ok(a.doc.querySelector('.feedback'));
    a.click('#help'); await a.tick(10000); assert.ok(a.doc.querySelector('.feedback'));
    a.click('#close-modal'); await a.tick(1600); assert.ok(a.doc.querySelector('.feedback'));
    await a.tick(500); assert.equal(a.doc.querySelector('.feedback'), null);
  } finally {await a.close();}
});

test('returning from the optional tutorial preserves settings and play starts immediately', async () => {
  const a = app();
  try {
    a.slide('#seconds', 30); a.click('#tutorial');
    for (const choice of [false, true, false]) {
      a.click(`[data-choice="${choice}"]`); await flush(); a.click('#tutorial-next'); await flush();
    }
    a.click('[data-choice="true"]'); await flush(); a.click('#tutorial-settings');
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '30초');
    a.click('#start'); await a.tick(48);
    assert.equal(a.doc.querySelector('.tutorial'), null);
    assert.ok(Number(a.doc.querySelector('#time')!.textContent) > 29);
  } finally {await a.close();}
});


test('a large archive keeps every representative accessible with unique IDs and permits answering in full view', async () => {
  const seed = 48271, a = app(seed), random = rng(seed);
  const reference = createSession('easy', random, {seconds:120, variableCount:3});
  try {
    a.slide('#seconds', 120); a.slide('#variables', 3); a.click('#start');
    for (let round = 0; round < 40; round++) {
      await a.tick(48);
      const q = generateQuestion(reference, random), choice = q.matchId !== null;
      a.click(choice ? '#exists' : '#novel'); await flush();
      submitAnswer(reference, q, choice, 120);
      assert.equal(a.doc.querySelectorAll('.archive .records .record').length, reference.records.length);
      assert.equal(a.doc.querySelector('.selected-wrong'), null);
      await a.tick(2000);
    }
    assert.ok(reference.records.length > 20);
    const nextQuestion = generateQuestion(reference, random);
    await a.tick(48); a.click('#show-records');
    assert.equal(a.doc.querySelectorAll('#all-records .record').length, reference.records.length);
    assert.equal(a.doc.querySelectorAll('.archive-modal .input-table tr').length, 3);
    const ids = [...a.doc.querySelectorAll('[id]')].map(element => element.id);
    assert.equal(new Set(ids).size, ids.length);
    const time = Number(a.doc.querySelector('#archive-time')!.textContent);
    await a.tick(1000); assert.ok(Number(a.doc.querySelector('#archive-time')!.textContent) < time);
    a.click('#archive-close'); assert.equal(a.doc.querySelector('.archive-modal'), null);
    a.click('#show-records');
    a.click(`[data-archive-choice="${nextQuestion.matchId !== null}"]`); await flush();
    assert.equal(a.doc.querySelector('.archive-modal'), null);
    assert.ok(a.doc.querySelector('.feedback.correct'));
    assert.match(a.doc.querySelector('.lives')!.getAttribute('aria-label')!, /3개/);
  } finally {await a.close();}
});

test('full archive view neither pauses nor extends time; expiry closes it and scores one timeout', async () => {
  const a = app();
  try {
    a.slide('#seconds', 5); a.click('#start'); await a.tick(48); a.click('#show-records');
    await a.tick(5100);
    assert.equal(a.doc.querySelector('.archive-modal'), null);
    assert.ok(a.doc.querySelector('.feedback.incorrect'));
    assert.match(a.doc.querySelector('.lives')!.getAttribute('aria-label')!, /2개/);
    await a.tick(2000); assert.equal(a.doc.querySelector('.feedback'), null);
  } finally {await a.close();}
});

test('custom time changes both clocks and the progress bar at half and quarter, then resets next round', async () => {
  const a = app();
  try {
    a.slide('#seconds', 20); a.click('#start'); await a.tick(48); a.click('#show-records');
    const selectors = ['.time-value', '#time-bar', '.archive-clock'];
    for (const selector of selectors) assert.ok(a.doc.querySelector(selector)!.classList.contains('time-normal'));
    await a.tick(10000);
    for (const selector of selectors) assert.ok(a.doc.querySelector(selector)!.classList.contains('time-warning'));
    await a.tick(5000);
    for (const selector of selectors) assert.ok(a.doc.querySelector(selector)!.classList.contains('time-critical'));
    a.click('#archive-close'); a.click('#exists');
    assert.ok(a.doc.querySelector('.time-value')!.classList.contains('time-critical'));
    await a.tick(2048);
    assert.ok(a.doc.querySelector('.time-value')!.classList.contains('time-normal'));
    assert.ok(a.doc.querySelector('#time-bar')!.classList.contains('time-normal'));
  } finally {await a.close();}
});


const assertEnglish = (element:{textContent:string | null; querySelectorAll:(selector:string) => Iterable<{getAttribute:(name:string) => string | null}>}) => {
  assert.doesNotMatch((element.textContent ?? '').replaceAll('한국어', ''), /[가-힣]/);
  for (const node of element.querySelectorAll('[aria-label]')) assert.doesNotMatch(node.getAttribute('aria-label') ?? '', /[가-힣]/);
};
test('updated home copy and presets, numeric variable ticks and language switching preserve custom settings', async () => {
  const a = app();
  try {
    assert.equal(a.doc.querySelector('.home-caption'), null);
    assert.match(a.doc.querySelector('.best-line')!.textContent, /이 설정의 최고 점수/);
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '30초');
    a.click('input[value="medium"]');
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '20초');
    a.click('input[value="hard"]');
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '12초');
    assert.deepEqual([...a.doc.querySelector('#variables')!.parentElement!.querySelectorAll('.slider-bounds span')].map(n => n.textContent), ['1', '2', '3']);
    a.slide('#seconds', 47); a.slide('#variables', 2); a.click('#language');
    assert.equal(a.doc.documentElement.lang, 'en');
    assert.equal(a.doc.querySelector('#language')!.textContent, 'EN');
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '47s');
    assert.equal(a.doc.querySelector('#variables-value')!.textContent, '2');
    assert.match(a.doc.querySelector('.best-line')!.textContent, /Best score for these settings/);
    assert.equal(a.w.localStorage.getItem('exists-or-new-language'), 'en');
    assert.equal(a.w.location.pathname, '/exists-or-new/');
    assert.equal(a.w.location.search, '?lang=en');
    assertEnglish(a.doc.body);
    a.click('#language');
    assert.equal(a.doc.documentElement.lang, 'ko');
    assert.equal(a.doc.querySelector('#language')!.textContent, 'KR');
    assert.equal(a.doc.querySelector('#seconds-value')!.textContent, '47초');
  } finally {await a.close();}
});
test('English covers guide, every tutorial scene, full archive, feedback and results without resetting the best badge', async () => {
  const a = app(8241, 'en');
  try {
    a.slide('#seconds', 5); a.click('#help');
    assert.match(a.doc.querySelector('.guide-modal')!.textContent, /every column/);
    assertEnglish(a.doc.body); a.click('#close-modal'); a.click('#tutorial');
    for (const choice of [false, true, false, true]) {
      assertEnglish(a.doc.body);
      a.click(`[data-choice="${choice}"]`); await flush();
      assertEnglish(a.doc.body); a.click('#tutorial-next'); await flush();
    }
    await a.tick(48); a.click('#show-records');
    assert.match(a.doc.querySelector('#archive-title')!.textContent, /All expressions/);
    assertEnglish(a.doc.body); a.click('#archive-close');
    const random = rng(8241), reference = createSession('easy', random, {seconds:5, variableCount:1});
    const q = generateQuestion(reference, random);
    a.click(q.matchId !== null ? '#exists' : '#novel'); await flush();
    assert.match(a.doc.querySelector('.feedback')!.textContent, /Correct/);
    assertEnglish(a.doc.body); await a.tick(2000);
    for (let i = 0; i < 3; i++) {
      await a.tick(5100); assert.match(a.doc.querySelector('.feedback')!.textContent, /Time up/);
      assertEnglish(a.doc.body); await a.tick(2000);
    }
    assert.match(a.doc.querySelector('.results')!.textContent, /New best/);
    assertEnglish(a.doc.body);
    const score = a.doc.querySelector('.final-score')!.textContent.replace(/[^0-9]/g, '');
    a.click('#language');
    assert.match(a.doc.querySelector('.final-score')!.textContent, /최고 기록/);
    assert.equal(a.doc.querySelector('.final-score')!.textContent.replace(/[^0-9]/g, ''), score);
  } finally {await a.close();}
});
test('language preference persists, an explicit language link wins, and unsupported preferences fall back to Korean', async () => {
  for (const [query, stored, expected] of [[null, 'en', 'en'], ['ko', 'en', 'ko'], ['en', 'ko', 'en'], [null, 'fr', 'ko']] as const) {
    const a = app(8241, query, {'exists-or-new-language':stored});
    try {assert.equal(a.doc.documentElement.lang, expected);} finally {await a.close();}
  }
});
test('changed presets never mix old-time best scores into new-time settings', async () => {
  const a = app(8241, 'ko', {
    'equivalence-best-v6-endless-easy':'9000',
    'equivalence-best-v6-endless-medium':'7000',
    'equivalence-best-v7-custom-1-30':'123',
    'equivalence-best-v8-config-1-30':'200',
  });
  try {
    assert.equal(a.doc.querySelector('#best-score')!.textContent, '200');
    a.slide('#seconds', 18); assert.equal(a.doc.querySelector('#best-score')!.textContent, '9,000');
    a.click('input[value="medium"]'); assert.equal(a.doc.querySelector('#best-score')!.textContent, '0');
    a.slide('#seconds', 15); assert.equal(a.doc.querySelector('#best-score')!.textContent, '7,000');
    a.click('#language'); assert.equal(a.doc.querySelector('#best-score')!.textContent, '7,000');
  } finally {await a.close();}
});
