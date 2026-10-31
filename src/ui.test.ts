import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'vite';
import {Window} from 'happy-dom';
import {createQueueSession,generateQueueQuestion,submitQueueAnswer,ARRIVAL_SECONDS,enqueueCandidate,isQueueOver} from './queue-game.ts';

// Execute the actual app bundle, with deterministic time and animation support.
// This checks DOM behavior, not pixel rendering or real-browser compatibility.
const bundled = await build({logLevel:'silent', build:{write:false, minify:false}});
if (Array.isArray(bundled) || !('output' in bundled)) throw new Error('Expected one application bundle');
const code = bundled.output.find(file => file.type === 'chunk' && file.isEntry);
if (!code || code.type !== 'chunk') throw new Error('Missing application entry');
const appCode = code.code;
const flush = async () => { for (let i = 0; i < 64; i++) await Promise.resolve(); };
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
    await flush();
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
  return {w, doc, click, tick, slide, jump:async(ms:number)=>{now+=ms;const due=[...jobs].filter(([,job])=>job.at<=now);for(const [key,job]of due){jobs.delete(key);job.callback();}await flush();}, close:() => w.close()};
}

const practice=async(a:ReturnType<typeof app>)=>{
  await flush();
  for(const selector of ['#novel','[data-tutorial-record="1"]','[data-tutorial-record="1"]']){
    a.click(selector);await flush();a.click('#tutorial-next');await flush();
  }
  await flush();a.click('#novel');await flush();a.click('#tutorial-next');await flush();
  a.click('#tutorial-next');await flush();a.click('#tutorial-next');await flush();
};
const english=(a:ReturnType<typeof app>)=>{
  assert.doesNotMatch(a.doc.body.textContent.replaceAll('한국어',''),/[가-힣]/);
  for(const el of a.doc.querySelectorAll('[aria-label]'))assert.doesNotMatch(el.getAttribute('aria-label')!,/[가-힣]/);
};
test('home offers a variable slider without difficulty, competition or combo controls',async()=>{
  const a=app();try{
    assert.ok(a.doc.querySelector('#start'));assert.equal(a.doc.querySelectorAll('input').length,1);assert.ok(a.doc.querySelector('#variable-count[type=range]'));assert.equal(a.doc.querySelector('.difficulty'),null);
    assert.doesNotMatch(a.doc.body.textContent,/콤보|도전 코드/);a.click('#language');english(a);
  }finally{await a.close();}
});
test('the game exposes exactly a 3×3 list, a five-slot pending queue, and selectable expressions',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(48);assert.equal(a.doc.querySelectorAll('.archive .record').length,9);
    assert.equal(a.doc.querySelectorAll('[data-record-id]').length,1);assert.equal(a.doc.querySelectorAll('.danger-slot').length,5);
    assert.equal(a.doc.querySelector('#novel')!.textContent.trim(),'+');assert.match(a.doc.querySelector('#novel')!.getAttribute('aria-label')!,/추가/);
    assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);assert.equal(a.doc.querySelector('#exists'),null);
    assert.ok(Number(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow'))>9);assert.equal(a.doc.querySelector('.matched'),null);
    assert.ok(Number(a.doc.querySelector('.input-timer')!.getAttribute('aria-valuenow'))>18);assert.ok(a.doc.querySelector('.input-table-wrap #input-time-bar'));
    await a.tick(1000);assert.ok(Number(a.doc.querySelector('.input-timer')!.getAttribute('aria-valuenow'))<19.1);
  }finally{await a.close();}
});
test('real gameplay adds new cards and removes matching existing cards, preserving nine visible slots',async()=>{
  const seed=48271,a=app(seed),random=rng(seed),reference=createQueueSession(random);let removed=0,added=0;
  try{
    a.click('#start');
    for(let r=0;r<8&&!isQueueOver(reference);r++){
      await a.tick(48);if(!reference.queue.length)enqueueCandidate(reference,random);
      const q=generateQueueQuestion(reference,random),selection=q.matchId??'new';
      if(a.doc.querySelector('.is-introducing'))await a.tick(3000);
      await a.tick(64);
      a.click(selection==='new'?'#novel':`#record-${selection}`);await flush();
      const answer=submitQueueAnswer(reference,q,selection,40,random);if(answer.removed)removed++;if(answer.added)added++;
      assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,reference.queue.length,`queue round ${r}`);
      assert.equal(a.doc.querySelectorAll('.archive [data-record-id]').length,reference.records.length,`round ${r}, ${a.doc.querySelector('.feedback')?.textContent}`);
      assert.equal(a.doc.querySelectorAll('.archive .record').length,9);
      if(answer.removed)assert.equal(a.doc.querySelector(`#record-${answer.removed.id}`),null);
      if(answer.reason==='full')assert.match(a.doc.querySelector('.feedback')!.textContent,/목록이 가득/);
      else assert.ok(a.doc.querySelector('.feedback.correct'),`Round ${r+1}`);
      await a.tick(900);
    }
    assert.ok(removed>0);assert.ok(added>0);
  }finally{await a.close();}
});
test('a wrong selection returns only E without changing the list or double scoring',async()=>{
  const a=app(12),random=rng(12),reference=createQueueSession(random);
  try{
    a.click('#start');await a.tick(48);if(!reference.queue.length)enqueueCandidate(reference,random);
      const q=generateQueueQuestion(reference,random);
    a.click(q.matchId===null?'#record-1':'#novel');await flush();
    assert.ok(a.doc.querySelector('.feedback.incorrect'));assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,1);
    assert.equal(a.doc.querySelectorAll('.archive [data-record-id]').length,1);
    assert.ok(a.doc.querySelector(`#queue-${q.candidateId}`));
    a.click('#novel');a.click('#record-1');await flush();assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,1);
  }finally{await a.close();}
});
test('accelerating arrivals preserve the active candidate and fill the queue without timeouts',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(48);
    const candidate=a.doc.querySelector('#question-title')!.getAttribute('data-candidate-id');
    await a.tick(9900);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
    await a.tick(200);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,1);
    assert.equal(a.doc.querySelector('#question-title')!.getAttribute('data-candidate-id'),candidate);
    assert.equal(a.doc.querySelector('.feedback'),null);
    for(let i=2;i<5;i++){await a.tick((10-(i-1)*.5)*1000+32);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,i);}
    await a.tick(8000+32);assert.ok(a.doc.querySelector('.is-ending'));assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,5);
    const board=a.doc.querySelector('.game');const points=a.doc.querySelector('.score-item strong')!.textContent;a.click('#novel');assert.equal(a.doc.querySelector('.score-item strong')!.textContent,points);
    assert.ok(!a.doc.querySelector('.results'));await a.tick(500);assert.ok(!a.doc.querySelector('.results'));await a.tick(500);assert.ok(a.doc.querySelector('.results'));
    assert.equal(a.doc.querySelector('.game'),board);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,5);assert.ok((a.doc.querySelector('.game-over') as unknown as HTMLDialogElement).open);assert.equal(a.doc.querySelector('.result-stats'),null);
    a.click('#replay');assert.equal(a.doc.querySelector('.game-over'),null);await a.tick(48);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
    assert.equal(a.doc.querySelectorAll('.archive [data-record-id]').length,1);
  }finally{await a.close();}
});
test('an empty queue immediately refills and resets the timer without resetting its difficulty',async()=>{
  const seed=12,a=app(seed),reference=createQueueSession(rng(seed)),q=generateQueueQuestion(reference);
  try{
    a.click('#start');await a.tick(7048);
    a.click(q.matchId===null?'#novel':`#record-${q.matchId}`);await a.tick(1000);
    assert.equal(a.doc.querySelector('.waiting-puzzle'),null);assert.ok(a.doc.querySelector('#question-title'));
    assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
    assert.ok(Number(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow'))>9.7);
    assert.equal(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuemax'),'10');
    await a.tick(10000);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,1);
    assert.equal(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuemax'),'9.5');
    assert.equal(a.doc.querySelector('.status .time-track'),null);
    assert.equal(a.doc.querySelector('.danger-heading'),null);assert.equal(a.doc.querySelector('.queue-counter'),null);assert.equal(a.doc.querySelector('.round-label'),null);assert.equal(a.doc.querySelector('#time'),null);
    assert.ok(a.doc.querySelector('.danger-queue > .queue-timer'));
    assert.match(a.doc.querySelector('#time-bar')!.getAttribute('style')!,/scaleY/);
    assert.doesNotMatch(a.doc.body.textContent,/아래쪽 식부터|Bottom expression goes next/);
  }finally{await a.close();}
});
test('arrivals keep their schedule during feedback rather than waiting for the next answer',async()=>{
  const seed=12,a=app(seed),reference=createQueueSession(rng(seed)),q=generateQueueQuestion(reference);
  try{
    a.click('#start');await a.tick(9748);a.click(q.matchId===null?'#record-1':'#novel');
    await a.tick(350);assert.ok(a.doc.querySelector('.feedback'));assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,2);
    assert.ok(a.doc.querySelector(`#queue-${q.candidateId}`));
  }finally{await a.close();}
});
test('pause and hidden tabs preserve E without manufacturing queue entries',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(1048);a.click('#pause');const inputTime=a.doc.querySelector('.input-timer')!.getAttribute('aria-valuenow');const time=a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow');
    await a.tick(100000);assert.equal(a.doc.querySelector('.input-timer')!.getAttribute('aria-valuenow'),inputTime);assert.equal(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow'),time);a.click('#close-modal');
    Object.defineProperty(a.doc,'hidden',{configurable:true,value:true});a.doc.dispatchEvent(new a.w.Event('visibilitychange'));
    await a.tick(100000);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
    Object.defineProperty(a.doc,'hidden',{configurable:true,value:false});a.doc.dispatchEvent(new a.w.Event('visibilitychange'));await a.tick(1000);
    assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
  }finally{await a.close();}
});
test('list metadata and full-view controls are absent, and surviving cards never collapse',async()=>{
  const seed=48271,a=app(seed),random=rng(seed),reference=createQueueSession(random);let cleared=false;
  try{
    a.click('#start');
    for(let r=0;r<30;r++){
      await a.tick(48);
      assert.equal(a.doc.querySelector('.archive-heading'),null);assert.equal(a.doc.querySelector('.reduction-trace'),null);assert.equal(a.doc.querySelector('#show-records'),null);
      const before=new Map([...a.doc.querySelectorAll('.archive [data-record-id]')].map(el=>[Number(el.getAttribute('data-record-id')),el.getAttribute('data-slot')]));
      if(!reference.queue.length)enqueueCandidate(reference,random);
      const q=generateQueueQuestion(reference,random),selection=q.matchId??'new';
      if(a.doc.querySelector('.is-introducing'))await a.tick(3000);
      await a.tick(64);
      a.click(selection==='new'?'#novel':`#record-${selection}`);await flush();
      const answer=submitQueueAnswer(reference,q,selection,40,random);await a.tick(900);await a.tick(48);
      for(const [id,slot]of before)if(id!==answer.removed?.id)assert.equal(a.doc.querySelector(`#record-${id}`)!.getAttribute('data-slot'),slot);
      if(answer.removed){
        const hole=a.doc.querySelector(`.archive [data-slot="${answer.removedIndex}"]`)!;
        assert.ok(hole.classList.contains('empty-record'));cleared=true;break;
      }
    }
    assert.ok(cleared);
  }finally{await a.close();}
});
test('tutorial rehearses the new deletion and return rules, then starts a clean fixed-mode game',async()=>{
  const a=app();try{
    a.click('#tutorial');a.click('#tutorial-next');a.click('[data-tutorial-record="1"]');assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,true);
    await practice(a);assert.ok(a.doc.querySelector('#start'));a.click('#start');await a.tick(48);assert.equal(a.doc.querySelectorAll('.archive [data-record-id]').length,1);
    assert.equal(a.doc.querySelectorAll('.input-pair').length,1);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
  }finally{await a.close();}
});
test('English covers the new guide, tutorial, gameplay, queue and results',async()=>{
  const a=app(8241,'en');try{
    a.click('#help');assert.match(a.doc.querySelector('.guide-modal')!.textContent,/current input/);english(a);a.click('#close-modal');
    a.click('#tutorial');a.click('#tutorial-next');await practice(a);assert.ok(a.doc.querySelector('#start'));a.click('#start');await a.tick(48);english(a);
    await a.tick(46200);
    english(a);assert.ok(a.doc.querySelector('.results'));
  }finally{await a.close();}
});

test('a timed input is replaced inline without replacing the puzzle, disabling answers or stopping the queue timer',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(48);
    const candidate=a.doc.querySelector('#question-title'),add=a.doc.querySelector('#novel'),previousInput=a.doc.querySelector('.input-value')!.textContent;
    const value=previousInput==='5'?-5:5;a.w.eval(`Math.random=()=>${(value+5+.25)/11}`);
    await a.jump(19900);await a.tick(1000);
    assert.equal(a.doc.querySelectorAll('.input-value').length,1);assert.notEqual(a.doc.querySelector('.input-value')!.textContent,previousInput);
    assert.equal(a.doc.querySelector('#question-title'),candidate);assert.equal(a.doc.querySelector('#novel'),add);
    assert.equal((add as unknown as HTMLButtonElement).disabled,false);
    assert.equal(a.doc.querySelector('.is-introducing,.arrival-fly,.outgoing-puzzle'),null);
    const remaining=Number(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow'));
    await a.tick(500);assert.ok(Number(a.doc.querySelector('.queue-timer')!.getAttribute('aria-valuenow'))<remaining);
    assert.equal(a.doc.querySelector('.feedback'),null);
  }finally{await a.close();}
});
test('feedback lasts 900ms before the next candidate',async()=>{
  const seed=8241,a=app(seed),reference=createQueueSession(rng(seed)),q=generateQueueQuestion(reference);try{
    a.click('#start');await a.tick(48);a.click(q.matchId===null?'#novel':`#record-${q.matchId}`);
    await a.tick(899);assert.ok(a.doc.querySelector('.feedback'));
    await a.tick(1);assert.equal(a.doc.querySelector('.feedback'),null);
  }finally{await a.close();}
});

test('the variable slider persists, selects the initial cards and input rows, and separates best scores',async()=>{
  const a=app(8241,null,{'exists-renewal-input-v6':'111','exists-renewal-input-v6:2':'222','exists-renewal-input-v6:3':'333'});
  try{
    assert.equal(a.doc.querySelector('#best-score')!.textContent,'111');
    a.slide('#variable-count',2);assert.equal(a.doc.querySelector('#variable-value')!.textContent,'2');assert.equal(a.doc.querySelector('#best-score')!.textContent,'222');
    a.slide('#variable-count',3);assert.equal(a.w.localStorage.getItem('exists-renewal-variables'),'3');assert.equal(a.doc.querySelector('#best-score')!.textContent,'333');
    a.click('#start');await a.tick(48);assert.equal(a.doc.querySelectorAll('.input-pair').length,3);assert.equal(a.doc.querySelectorAll('[data-record-id]').length,3);
    assert.deepEqual([...a.doc.querySelectorAll('[data-record-id]')].map(e=>e.getAttribute('aria-label')),['x','y','z']);
    await a.jump(20_100);await a.tick(48);assert.equal(a.doc.querySelectorAll('.input-pair').length,3);assert.equal(a.doc.querySelectorAll('.input-value').length,3);
  }finally{await a.close();}
  const b=app(8241,null,{'exists-renewal-variables':'2'});try{assert.equal((b.doc.querySelector('#variable-count') as unknown as HTMLInputElement).value,'2');b.click('#start');await b.tick(48);assert.equal(b.doc.querySelectorAll('.input-pair').length,2);}finally{await b.close();}
});

test('game-over overlay changes language and returns home without leaving a stale modal',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(46200);assert.ok(a.doc.querySelector('.game-over'));
    a.click('#results-language');assert.equal(a.doc.querySelector('#replay')!.textContent.trim(),'Play again ↻');
    assert.equal(a.doc.querySelectorAll('.game-over').length,1);assert.ok(a.doc.querySelector('.game'));
    a.click('#home');assert.equal(a.doc.querySelector('.game-over'),null);assert.ok(a.doc.querySelector('#variable-count'));
    a.click('#start');await a.tick(48);assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);
  }finally{await a.close();}
});

test('wrong answers wait 2500ms before advancing',async()=>{
  const seed=8241,a=app(seed),reference=createQueueSession(rng(seed)),q=generateQueueQuestion(reference);
  try{
    a.click('#start');await a.tick(48);a.click(q.matchId===null?'#record-1':'#novel');
    await a.tick(2499);assert.ok(a.doc.querySelector('.feedback.incorrect'));
    await a.tick(1);assert.ok(!a.doc.querySelector('.feedback'));
  }finally{await a.close();}
});
test('unchanged input numbers never receive a change animation',async()=>{
  for(const changeY of [false,true]){
    const a=app(8241,null,{'exists-renewal-variables':'3'});try{
      a.click('#start');await a.tick(48);
      const before=a.doc.querySelector('.input-values'),values=[...a.doc.querySelectorAll('.input-value')].map(el=>Number(el.textContent.replace('−','-')));
      if(changeY)values[1]=values[1]===5?-5:values[1]+1;
      const code=values.reduce((sum,value,i)=>sum+(value+5)*11**i,0);
      a.w.eval(`Math.random=()=>${(code+.25)/1331}`);
      await a.jump(19900);await a.tick(200);
      const animated=[...a.doc.querySelectorAll('.input-enter')].map(el=>el.getAttribute('data-variable'));
      assert.deepEqual(animated,changeY?['y']:[]);
      assert.equal(a.doc.querySelector('.input-timer')!.getAttribute('aria-valuemax'),'19.5');
      if(!changeY)assert.equal(a.doc.querySelector('.input-values'),before);
      assert.ok(Number(a.doc.querySelector('.input-timer')!.getAttribute('aria-valuenow'))>18);
      assert.equal(a.doc.querySelector('.feedback'),null);
    }finally{await a.close();}
  }
});

test('tutorial requires input replacement, points to both timers, and keeps practice outside game scores',async()=>{
  const a=app();try{
    a.click('#tutorial');a.click('#tutorial-next');
    for(const selector of ['#novel','[data-tutorial-record="1"]','[data-tutorial-record="1"]']){await flush();a.click(selector);await flush();a.click('#tutorial-next');await flush();}
    assert.equal(a.doc.querySelector('#tutorial-change'),null);await flush();
    assert.equal(a.doc.querySelector('.input-value')!.textContent,'2');assert.equal(a.doc.querySelectorAll('.input-value').length,1);
    a.click('#novel');await flush();a.click('#tutorial-next');await flush();assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,3);
    assert.equal(a.doc.querySelector('#tutorial-arrival'),null);assert.equal(a.doc.querySelectorAll('.tutorial-timer-pointers [data-timer]').length,2);assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,false);
    a.click('#tutorial-next');await flush();assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,5);assert.ok(a.doc.querySelector('.tutorial-game-over'));a.click('#tutorial-next');assert.ok(a.doc.querySelector('#start'));assert.equal(a.doc.querySelector('.game'),null);a.click('#start');await a.tick(48);assert.equal(a.doc.querySelector('.score-item strong')!.textContent,'0');assert.equal(a.doc.querySelectorAll('[data-record-id]').length,1);
    a.click('#help');const guide=a.doc.querySelector('.guide-modal')!.textContent;
    assert.match(guide,/20초/);assert.match(guide,/20%/);assert.match(guide,/1.01/);assert.doesNotMatch(guide,/시간 초과|시간 보너스|모든 입력 열|라운드가 끝날 때/);
  }finally{await a.close();}
});

test('tutorial highlights the required control and supports previous/next navigation',async()=>{
  const a=app();try{
    a.click('#tutorial');a.click('#tutorial-next');await flush();
    assert.equal(a.doc.querySelector('.tutorial-shade'),null);assert.equal(a.doc.querySelector('#tutorial-exit,#tutorial-skip'),null);
    assert.ok(a.doc.querySelector('#novel.tutorial-target'));assert.equal(a.doc.querySelector('.tutorial-target')!.getAttribute('aria-describedby'),'tutorial-instruction');
    assert.equal((a.doc.querySelector('#tutorial-prev') as unknown as HTMLButtonElement).disabled,false);
    a.click('#novel');await flush();assert.ok(a.doc.querySelector('#tutorial-next.tutorial-target'));
    a.click('#tutorial-next');await flush();assert.ok(a.doc.querySelector('[data-tutorial-record="1"].tutorial-target'));
    assert.equal(a.doc.querySelectorAll('.tutorial-target').length,1);
    a.click('#tutorial-prev');await flush();assert.ok(a.doc.querySelector('#novel.tutorial-target'));assert.match(a.doc.querySelector('.coach-step')!.textContent,/1\/6/);
    a.click('#novel');await flush();a.click('#tutorial-next');await flush();a.click('[data-tutorial-record="1"]');await flush();a.click('#tutorial-next');await flush();
    a.click('[data-tutorial-record="1"]');await flush();a.click('#tutorial-next');await flush();assert.equal(a.doc.querySelector('#tutorial-change'),null);assert.ok(a.doc.querySelector('#novel.tutorial-target'));
    a.click('#novel');await flush();a.click('#tutorial-next');await flush();assert.ok(a.doc.querySelector('#tutorial-next.tutorial-target'));assert.equal(a.doc.querySelectorAll('.tutorial-timer-pointers [data-timer]').length,2);
  }finally{await a.close();}
});

test('completed practice steps persist, can be skipped, and the last arrow returns to the lobby',async()=>{
  const a=app();try{
    a.click('#tutorial');a.click('#tutorial-next');await flush();a.click('#novel');await flush();
    assert.equal(a.w.localStorage.getItem('exists-tutorial-progress-v1'),'[0]');
    a.click('#tutorial-next');await flush();assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,true);
  }finally{await a.close();}
  const b=app(8241,null,{'exists-tutorial-progress-v1':'[0,1,2,3,4,5]'});try{
    b.click('#tutorial');b.click('#tutorial-next');await flush();
    for(let i=0;i<6;i++){
      assert.equal((b.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,false);
      b.click('#tutorial-next');await flush();
    }
    assert.ok(b.doc.querySelector('#variable-count'));assert.ok(b.doc.querySelector('#start'));assert.equal(b.doc.querySelector('.game'),null);
    assert.equal(b.doc.querySelector('.tutorial-coach'),null);assert.equal(b.doc.querySelector('.tutorial-timer-pointers'),null);assert.equal(b.doc.body.classList.contains('tutorial-playing'),false);
  }finally{await b.close();}
});
test('partial or invalid saved tutorial history never unlocks an unfinished step',async()=>{
  for(const history of ['[0]','{"done":true}','[9,-1,"1",null]','broken']){
    const a=app(8241,null,{'exists-tutorial-progress-v1':history});try{
      a.click('#tutorial');a.click('#tutorial-next');await flush();
      if(history==='[0]'){assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,false);a.click('#tutorial-next');await flush();}
      assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,true);
    }finally{await a.close();}
  }
});

test('saved completion unlocks skipping without moving the highlight away from the practice control',async()=>{
  const a=app(8241,null,{'exists-tutorial-progress-v1':'[0,1,2,3,4,5]'});try{
    a.click('#tutorial');a.click('#tutorial-next');await flush();
    for(const selector of ['#novel','[data-tutorial-record="1"]','[data-tutorial-record="1"]','#novel','#tutorial-next','#tutorial-next']){
      assert.ok(a.doc.querySelector(`${selector}.tutorial-target`));
      assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,false);
      a.click('#tutorial-next');await flush();
    }
    assert.ok(a.doc.querySelector('#start'));
  }finally{await a.close();}
});

test('tutorial starts at 0/6 with an overview before any practice or scoring',async()=>{
  const a=app();try{
    a.click('#tutorial');await flush();assert.match(a.doc.querySelector('.coach-step')!.textContent,/0\/6/);
    assert.equal(a.doc.querySelector('#question-title')!.textContent,'');assert.equal(a.doc.querySelector('#question-title')!.getAttribute('aria-hidden'),'true');
    assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,1);assert.equal(a.doc.querySelector('.danger-slot.occupied math')!.getAttribute('aria-label'),'x + x');
    assert.match(a.doc.querySelector('.tutorial-prompt')!.textContent,/같은 결과/);assert.match(a.doc.querySelector('.tutorial-prompt')!.textContent,/추가/);
    assert.equal((a.doc.querySelector('#tutorial-prev') as unknown as HTMLButtonElement).disabled,true);
    assert.equal((a.doc.querySelector('#tutorial-next') as unknown as HTMLButtonElement).disabled,false);
    assert.equal((a.doc.querySelector('#novel') as unknown as HTMLButtonElement).disabled,true);
    assert.equal(a.w.localStorage.getItem('exists-tutorial-progress-v1'),null);
    a.click('#tutorial-next');await flush();assert.match(a.doc.querySelector('.coach-step')!.textContent,/1\/6/);assert.ok(a.doc.querySelector('#novel.tutorial-target'));assert.equal(a.doc.querySelectorAll('.danger-slot.occupied').length,0);assert.equal(a.doc.querySelector('#question-title math')!.getAttribute('aria-label'),'x + x');
    a.click('#tutorial-prev');await flush();assert.match(a.doc.querySelector('.coach-step')!.textContent,/0\/6/);
    assert.equal(a.w.localStorage.getItem('exists-tutorial-progress-v1'),null);
  }finally{await a.close();}
});

test('language changes during play and help preserve the active puzzle and timers',async()=>{
  const a=app();try{
    a.click('#start');await a.tick(48);await a.tick(1200);
    const candidate=a.doc.querySelector('#question-title'),timer=a.doc.querySelector('.queue-timer'),remaining=timer!.getAttribute('aria-valuenow');
    a.click('#language');english(a);assert.equal(a.doc.querySelector('#language')!.textContent,'EN');
    assert.equal(a.doc.querySelector('#question-title'),candidate);assert.equal(a.doc.querySelector('.queue-timer'),timer);assert.equal(timer!.getAttribute('aria-valuenow'),remaining);
    a.click('#help');a.click('#modal-language');assert.equal(a.doc.documentElement.lang,'ko');assert.match(a.doc.querySelector('.guide-modal')!.textContent,/판정 기준/);
    const frozen=timer!.getAttribute('aria-valuenow');await a.tick(5000);assert.equal(timer!.getAttribute('aria-valuenow'),frozen);
    a.click('#modal-language');english(a);a.click('#close-modal');await a.tick(200);assert.equal(a.doc.querySelector('#question-title'),candidate);assert.ok(Number(timer!.getAttribute('aria-valuenow'))<Number(frozen));
  }finally{await a.close();}
});

test('language changes during tutorial motion preserve its step and moving elements',async()=>{
  const a=app(8241,null,{'exists-tutorial-progress-v1':'[0,1,2,3]'});try{
    a.click('#tutorial');a.click('#tutorial-next');await flush();
    for(let i=0;i<3;i++){a.click('#tutorial-next');await flush();}
    a.click('#tutorial-prev');await flush();a.click('#tutorial-next');
    const candidate=a.doc.querySelector('#question-title'),input=a.doc.querySelector('.input-values');
    a.click('#language');english(a);assert.equal(a.doc.querySelector('#question-title'),candidate);assert.equal(a.doc.querySelector('.input-values'),input);assert.match(a.doc.querySelector('.coach-step')!.textContent,/4\/6/);
    await flush();assert.equal(a.doc.querySelector('.input-value')!.textContent,'2');assert.match(a.doc.querySelector('.tutorial-prompt')!.textContent,/Choose/);
  }finally{await a.close();}
});
