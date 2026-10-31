import './style.css';
import {gameBoardMarkup,inputMarkup,queueMarkup,emptyRecord,localizeGameBoard,type BoardState} from './game-board.ts';
import {getLanguage, initializeLanguage, setLanguage, t} from './i18n.ts';
import {guideMarkup} from './guide.ts';
import { mountTutorial, type TutorialControls } from './tutorial.ts';
import { renderMath } from './math-markup.ts';
import { AutoAdvance } from './auto-advance.ts';
import { fitCandidate,fitQueueExpressions } from './fit-candidate.ts';
import { AdditionTransition } from './addition-transition.ts';
import {QueueMotion,captureQueueCard,type QueueSnapshot} from './queue-motion.ts';
import { playFeedback, soundEnabled, toggleSound, unlockSound } from './sound.ts';
import {timeTone} from './game.ts';
import {createQueueSession as createSession, isQueueOver as isGameOver, generateQueueQuestion as generateQuestion, submitQueueAnswer as submitAnswer, type QueueAnswer as Answer, type QueueSession as Session, type Selection, ARRIVAL_SECONDS, inputIntervalSeconds, inputSecondsRemaining, advanceQueueTime, updateQueueInput, hasDueQueueMapping, nextArrivalSeconds, enqueueCandidate, type QueueQuestion as Question} from './queue-game.ts';

initializeLanguage();
const root = document.querySelector<HTMLDivElement>('#app')!;
const variablesKey='exists-renewal-variables';
let variableCount=1;
try{const saved=Number(localStorage.getItem(variablesKey));if([1,2,3].includes(saved))variableCount=saved;}catch{/* Storage is optional. */}
let session: Session | null = null;
let question: Question | null = null;
let answer: Answer | null = null;
let screen: 'home' | 'tutorial' | 'playing' | 'feedback' | 'ending' | 'results' = 'home';
let lastTick=0;
let arrivalInterval = ARRIVAL_SECONDS;
let remaining = ARRIVAL_SECONDS, deadline = 0, frame = 0, readyFrame = 0, paused = false;
let dialog: HTMLDialogElement | null = null;
let refreshDialogLanguage:(()=>void)|null=null;
let newBest = false;
let visibilityPaused = false;
let newInputIndexes: number[] = [];
const storageFlight = new AdditionTransition();
const queueDraw = new QueueMotion(), queueArrival = new QueueMotion();
let drawing = false, arriving = false;
let arrivingId:number|null=null;
let storing = false;
let tutorialControls: TutorialControls | null = null;
const ending = new AutoAdvance(()=>{if(screen==='ending')finish();});
const advance = new AutoAdvance(() => {
  if (screen !== 'feedback') return;
  if (document.hidden || dialog?.open) {
    advance.start(0); advance.pause();
    if (document.hidden) freezeForVisibility();
    return;
  }
  nextRound();
});

function scoreKey(): string { return 'exists-renewal-input-v6'+(variableCount===1?'':':'+variableCount); }
function best(): number {
  try {
    // This plan has separate local records from earlier game rules.
    const keys = [scoreKey()];
    return Math.max(0, ...keys.map(key => Number(localStorage.getItem(key))).filter(n => Number.isFinite(n) && n > 0));
  } catch { return 0; }
}
function saveBest() {
  newBest = session!.score > best();
  if (newBest) try { localStorage.setItem(scoreKey(), String(session!.score)); } catch { /* Private mode: game still works. */ }
}
const mark = '<svg viewBox="0 0 64 64" fill="none" focusable="false"><path class="mark-question" d="M24 16c0-9 16-9 16 0 0 6-8 5-8 11"/><circle class="mark-dot" cx="32" cy="32" r="2"/><path class="mark-equals" d="M16 41h32M16 52h32"/></svg>';
const icon = `<span class="brand-symbol" aria-hidden="true">${mark}</span>`;
function header() {
  return `<header class="site-header"><a class="brand" href="./" aria-label="${t('Exists or New 처음으로', 'Exists or New home')}">${icon}<span>Exists <i>or</i> New</span></a><div class="header-controls">${`<button class="language-button" id="language" aria-label="${t('영어로 전환', 'Switch to Korean')}">${getLanguage() === 'en' ? 'EN' : 'KR'}</button>`}<button class="sound-button ${soundEnabled() ? '' : 'muted'}" id="sound" aria-label="${soundEnabled() ? t('효과음 끄기', 'Mute sound') : t('효과음 켜기', 'Enable sound')}" aria-pressed="${soundEnabled()}">♫</button><button class="help-button" id="help" aria-label="${t('게임 도움말', 'How to play')}">?</button></div></header>`;
}
function renderHome() {
  closeResults();
  tutorialControls?.cancel(); tutorialControls = null;
  screen = 'home';
  root.innerHTML = `${header()}<main class="home"><div class="home-symbol" aria-hidden="true"><span class="hero-bracket">(</span><span class="hero-mark">${mark}</span><span class="hero-bracket">)</span></div><h1 lang="en">Exists <i>or</i> New</h1>

    <div class="custom-settings variable-settings"><label for="variable-count"><span class="setting-label">${t('변수 개수','Variables')}<output id="variable-value" for="variable-count">${variableCount}</output></span><input id="variable-count" type="range" min="1" max="3" step="1" value="${variableCount}"/><span class="slider-bounds" aria-hidden="true"><span>1</span><span>2</span><span>3</span></span></label></div>
    <button class="primary start-button" id="start">${t('플레이', 'Play')} <span aria-hidden="true">→</span></button>
    <button class="secondary tutorial-launch" id="tutorial">${t('튜토리얼', 'Tutorial')} <span aria-hidden="true">↗</span></button><p class="best-line"><span>${t('최고 점수', 'Best score')} <span id="best-score">${best().toLocaleString()}</span></span></p></main>`;
  bindCommon(); root.querySelector('#start')!.addEventListener('click', start);
  root.querySelector('#tutorial')!.addEventListener('click', startTutorial);
  root.querySelector<HTMLInputElement>('#variable-count')!.addEventListener('input',event=>{
    variableCount=Number((event.currentTarget as HTMLInputElement).value);
    root.querySelector('#variable-value')!.textContent=String(variableCount);
    root.querySelector('#best-score')!.textContent=best().toLocaleString();
    try{localStorage.setItem(variablesKey,String(variableCount));}catch{/* Storage is optional. */}
  });
}
function startTutorial() {
  void unlockSound();screen = 'tutorial'; stopClock(); advance.cancel(); storageFlight.cancel(); queueDraw.cancel(); queueArrival.cancel(); drawing=false; arriving=false;
  root.innerHTML = `${header()}<div id="tutorial-host"></div>`; bindCommon();
  tutorialControls = mountTutorial(root.querySelector<HTMLElement>('#tutorial-host')!, renderHome, start,()=>pauseGame(t('일시정지','Paused')));
}
function start() {
  closeResults();
  tutorialControls?.cancel(); tutorialControls = null;
  visibilityPaused = false; ending.cancel(); advance.cancel(); storageFlight.cancel(); queueDraw.cancel(); queueArrival.cancel(); drawing=false; arriving=false; storing = false; unlockSound(); stopClock(); session = createSession(Math.random,variableCount); newBest = false; arrivalInterval=ARRIVAL_SECONDS; remaining=arrivalInterval; deadline=0; nextRound();
}
function nextRound() {
  advance.cancel(); storageFlight.cancel(); queueDraw.cancel(); queueArrival.cancel(); drawing=false; arriving=false; storing = false;
  if (isGameOver(session!)) { finish(); return; }
  cancelAnimationFrame(readyFrame);readyFrame=0;arrivingId=null;
  if(!session!.current&&!session!.queue.length){
    holdClock();enqueueCandidate(session!);remaining=arrivalInterval;deadline=0;
  }
  const nextEntry=session!.current?null:session!.queue.at(-1);
  const queuedCard=nextEntry?root.querySelector<HTMLElement>(`#queue-${nextEntry.id}`):null;
  const drawFrom=queuedCard?captureQueueCard(queuedCard):null;
  question = generateQuestion(session!);
  newInputIndexes=[];
  answer=null;paused=false;drawing=true;screen='playing';renderGame();drawQuestion(drawFrom);
}

function drawQuestion(snapshot:QueueSnapshot|null) {
  const candidate=root.querySelector<HTMLElement>('.candidate')!;
  fitCandidate(candidate);
  let from=snapshot;
  if(!from){
    const slot=root.querySelector<HTMLElement>('.danger-slot:last-child')!;
    from=captureQueueCard(slot);from.html=renderMath(question!.expr);
    const text=candidate.querySelector('.formula')!.getBoundingClientRect();
    const small=parseFloat(getComputedStyle(slot).fontSize)||16;
    const large=parseFloat(getComputedStyle(candidate.querySelector('.operand-expression')!).fontSize)||small;
    from.textWidth=text.width*small/large;
  }
  void queueDraw.fly(from,candidate,'draw',()=>{
    drawing=false;root.querySelector('.game')?.classList.remove('is-drawing');prepareQuestion();
  });
  if(document.hidden)freezeForVisibility();else if(paused)queueDraw.pause();
}
function prepareQuestion() {
  root.querySelectorAll<HTMLButtonElement>('[data-record-id]').forEach(button=>{button.disabled=storing||drawing;});
  const add=root.querySelector<HTMLButtonElement>('#novel');if(add)add.disabled=storing||drawing;
  // Start only after the candidate has reached the screen, including after an addition animation.
  readyFrame = requestAnimationFrame(() => { readyFrame = requestAnimationFrame(() => {
    readyFrame = 0;
    if (screen !== 'playing'||drawing) return;
    fitCandidate(root.querySelector('.candidate'));
    root.querySelector<HTMLElement>('#question-title')?.focus();
    if (document.hidden) freezeForVisibility(); else if (!paused) runClock();
  }); });
}
function boardState():BoardState{return{session:session!,question,answer,feedback:screen==='feedback',drawing,storing,arriving,arrivingId,changedInputs:newInputIndexes,arrivalInterval,remaining};}
function mappingMarkup(){return inputMarkup(boardState());}
function refreshInputs(){
  const previous=session!.mappings;updateQueueInput(session!);
  if(previous===session!.mappings)return;
  if(screen==='playing'&&session!.current)question=generateQuestion(session!);
  newInputIndexes=session!.settings.variables.map((_,i)=>i).filter(i=>{const name=session!.settings.variables[i];return previous[0][name].n!==session!.mappings[0][name].n;});
  if(newInputIndexes.length){const table=root.querySelector('.input-table-wrap');if(table)table.outerHTML=mappingMarkup();}
  newInputIndexes=[];
}
function updateInputTimer(){
  const seconds=inputSecondsRemaining(session!),timer=root.querySelector<HTMLElement>('.input-timer');
  timer?.setAttribute('aria-valuenow',seconds.toFixed(1));
  timer?.setAttribute('aria-valuemax',String(inputIntervalSeconds(session!)));
  const bar=root.querySelector<HTMLElement>('#input-time-bar');if(bar)bar.style.transform=`scaleX(${seconds/inputIntervalSeconds(session!)})`;
}
function dangerMarkup(){return queueMarkup(boardState());}
function renderGame() {
  const scrollTop = root.querySelector<HTMLElement>('.records')?.scrollTop ?? 0;
  const s = session!, q = question!, revealed = screen === 'feedback';
  root.innerHTML=header()+gameBoardMarkup(boardState());
  root.querySelector<HTMLElement>('.records')!.scrollTop = scrollTop;
  fitCandidate(root.querySelector('.candidate'));fitQueueExpressions(root);
  bindCommon();
  root.querySelector('#pause')?.addEventListener('click',()=>pauseGame(t('일시정지','Paused')));
  if (revealed) {
    root.querySelector<HTMLElement>('.feedback')?.focus();
    const match=answer!.returned?`queue-${q.candidateId}`:answer!.removed?'clearing-record':`record-${answer!.added!.id}`;
    root.querySelector(`#${match}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: answer!.correct ? 'auto' : 'smooth' });
  } else {
    root.querySelectorAll<HTMLButtonElement>('[data-record-id]').forEach(button => button.addEventListener('click', () => choose(Number(button.dataset.recordId))));
    root.querySelector('#novel')?.addEventListener('click', () => choose('new'));
  }
}
function runClock() {
  if(frame||paused||(!deadline&&(drawing||readyFrame!==0))||document.hidden||(screen!=='playing'&&screen!=='feedback'))return;
  lastTick=performance.now();deadline=lastTick+remaining*1000;
  frame=requestAnimationFrame(tick);
}
function tick(now:number) {
  frame=0;
  if(paused||(screen!=='playing'&&screen!=='feedback'))return;
  advanceQueueTime(session!,Math.max(0,now-lastTick));lastTick=now;
  remaining=Math.max(0,(deadline-now)/1000);
  if(hasDueQueueMapping(session!))refreshInputs();
  updateInputTimer();
  const bar=root.querySelector<HTMLElement>('#time-bar');
  root.querySelector('.queue-timer')?.setAttribute('aria-valuenow',remaining.toFixed(1));
  if(bar)bar.style.transform=`scaleY(${remaining/arrivalInterval})`;
  const tone=timeTone(remaining,arrivalInterval);
  for(const element of [bar])for(const phase of ['normal','warning','critical'])element?.classList.toggle(`time-${phase}`,tone===phase);
  if(remaining<=0){
    arrivalInterval=nextArrivalSeconds(arrivalInterval);remaining=arrivalInterval;deadline=now+arrivalInterval*1000;
    receiveArrival();
    if(screen!=='playing'&&screen!=='feedback')return;
  }
  frame=requestAnimationFrame(tick);
}
function holdClock(){
  if(frame){const now=performance.now();remaining=Math.max(0,(deadline-now)/1000);advanceQueueTime(session!,Math.max(0,now-lastTick));lastTick=now;}
  cancelAnimationFrame(frame);frame=0;
}
function stopClock(){holdClock();cancelAnimationFrame(readyFrame);readyFrame=0;}
function receiveArrival(){
  const incoming=enqueueCandidate(session!);if(!incoming)return;
  if(isGameOver(session!)){beginEnding();return;}
  arrivingId=incoming.id;arriving=true;
  const previousCards=new Map([...root.querySelectorAll<HTMLElement>('.danger-slot.occupied')].map(card=>[card.id,card]));
  const queue=root.querySelector('.danger-queue');if(queue)queue.outerHTML=dangerMarkup();
  for(const [id,card]of previousCards){
    const replacement=root.querySelector<HTMLElement>(`#${id}`);
    if(replacement){card.toggleAttribute('data-next',replacement.hasAttribute('data-next'));replacement.replaceWith(card);}
  }
  fitQueueExpressions(root);
  const card=root.querySelector<HTMLElement>(`#queue-${incoming.id}`)!;
  const entrance=captureQueueCard(card);entrance.top-=58;
  void queueArrival.fly(entrance,card,'arrival',()=>{
    arriving=false;arrivingId=null;
    if(screen==='playing'&&!question)nextRound();
  });
}
function choose(choice: Selection) {
  if (!question || screen !== 'playing' || paused || drawing || readyFrame !== 0) return;
  queueArrival.cancel();arriving=false;arrivingId=null;
  screen = 'feedback';
  answer = submitAnswer(session!, question!, choice);
  storing = answer.returned || answer.added !== null;
  if(isGameOver(session!)){beginEnding();return;}
  renderGame();
  if (storing) {
    const source = root.querySelector<HTMLElement>('.candidate')!;
    const card = root.querySelector<HTMLElement>(answer.returned?`#queue-${question!.candidateId}`:`#record-${answer.added!.id}`)!;
    void storageFlight.store(source, {parts:[card.querySelector<HTMLElement>('.record-expression')!], reveal:[card], frame:card}, () => {
      storing = false; card.classList.add('record-enter'); root.querySelector('.game')?.classList.remove('is-storing');
    });
  }
  if (answer.removed) {
    const source=root.querySelector<HTMLElement>('.candidate')!;
    const card=root.querySelector<HTMLElement>('#clearing-record')!;
    void storageFlight.absorb(source,card,()=>{
      const empty=document.createElement('div');empty.className='record empty-record';empty.dataset.slot=card.dataset.slot!;empty.setAttribute('aria-hidden','true');empty.textContent='·';card.replaceWith(empty);
    },()=>card.classList.add('record-clearing'));
  }
  playFeedback(answer.correct,false);
  advance.start(answer.correct?900:2500);
  if (document.hidden) freezeForVisibility();
}
function pauseGame(title: string, help = false) {
  visibilityPaused = false;
  if (dialog?.open) return;
  holdClock();queueDraw.pause();queueArrival.pause();
  if (screen === 'tutorial'){tutorialControls?.pause();paused=true;}
  if(screen==='ending'){ending.pause();paused=true;}
  if (screen === 'feedback') { advance.pause(); storageFlight.pause(); paused = true; }
  if (screen === 'playing' && !paused) {
    stopClock(); paused = true;
  }
  openDialog(title, help);
}
function openDialog(title: string, help: boolean) {
  const el = document.createElement('dialog'); dialog = el; el.className = help ? 'modal guide-modal' : 'modal';
  el.setAttribute('aria-labelledby', 'modal-title');
  document.body.append(el);
  const close = () => {
    // A background tab must never resume a round.
    if (document.hidden && (paused || screen === 'tutorial')) return;
    el.close(); el.remove(); dialog = null;refreshDialogLanguage=null;
    if (screen === 'tutorial') tutorialControls?.resume();
    if (paused) {
      paused = false;
      if (screen === 'playing') {
        if(drawing){queueDraw.resume();} else { runClock(); root.querySelector<HTMLButtonElement>('[data-record-id]')?.focus(); }
      }
      else if (screen === 'feedback') { storageFlight.resume();queueArrival.resume(); advance.resume(); }
      else if(screen==='ending')ending.resume();
      queueArrival.resume();runClock();
    }
  };
  refreshDialogLanguage=()=>{
    el.innerHTML=`<div class="modal-heading"><h2 id="modal-title">${help?t('플레이 가이드','How to play'):t('일시정지','Paused')}</h2><button class="language-button" id="modal-language" aria-label="${t('영어로 전환','Switch to Korean')}">${getLanguage()==='en'?'EN':'KR'}</button></div>${help?guideMarkup():''}<button id="close-modal" class="primary">${paused?t('계속','Resume'):t('닫기','Close')} <span aria-hidden="true">→</span></button>`;
    el.querySelector('#close-modal')!.addEventListener('click',close);el.querySelector('#modal-language')!.addEventListener('click',changeLanguage);
  };
  refreshDialogLanguage();el.showModal();
  el.addEventListener('cancel', event => { event.preventDefault(); close(); });
}
function beginEnding(){
  if(screen==='ending'||screen==='results')return;
  stopClock();advance.cancel();queueDraw.cancel();queueArrival.cancel();storageFlight.cancel();
  drawing=false;arriving=false;storing=false;screen='ending';void playFeedback(false,true);renderGame();
  const game=root.querySelector<HTMLElement>('.game')!;game.classList.add('is-ending');
  game.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=true;});
  ending.start(1000);
  if(document.hidden)freezeForVisibility();
}
function finish() {
  ending.cancel();advance.cancel(); storageFlight.cancel(); queueDraw.cancel(); queueArrival.cancel(); drawing=false; arriving=false; storing = false; stopClock(); screen = 'results'; saveBest();
  renderResults();
}
function closeResults(){
  const overlay=root.querySelector<HTMLDialogElement>('.game-over');
  if(overlay){overlay.close();overlay.remove();}
}
function renderResults() {
  closeResults();
  const s=session!;
  const overlay=document.createElement('dialog');overlay.className='game-over';overlay.setAttribute('aria-labelledby','game-over-title');
  overlay.innerHTML=`<section class="results"><div class="result-heading"><h1 id="game-over-title">Game over.</h1><button class="language-button" id="results-language" aria-label="${t('영어로 전환','Switch to Korean')}">${getLanguage()==='en'?'EN':'KR'}</button></div><div class="final-score">${s.score.toLocaleString()}<small>${t('점','pts')}</small>${newBest?`<span>${t('최고 기록','New best')}</span>`:''}</div><div class="result-actions"><button class="primary" id="replay">${t('다시 하기','Play again')} <span aria-hidden="true">↻</span></button><button class="secondary" id="home">${t('처음으로','Home')}</button></div></section>`;
  root.append(overlay);overlay.showModal();
  overlay.addEventListener('cancel',event=>event.preventDefault());
  overlay.querySelector('#replay')!.addEventListener('click',start);
  overlay.querySelector('#home')!.addEventListener('click',renderHome);
  overlay.querySelector('#results-language')!.addEventListener('click',changeLanguage);
  overlay.querySelector<HTMLButtonElement>('#replay')?.focus();
}
function changeLanguage(){
  setLanguage(getLanguage()==='ko'?'en':'ko');
  if(screen==='home')renderHome();
  else{
    const current=root.querySelector('.site-header');if(current)current.outerHTML=header();bindCommon();
    if(screen==='tutorial')tutorialControls?.refreshLanguage();else localizeGameBoard(root,boardState());
    if(screen==='results')renderResults();
  }
  refreshDialogLanguage?.();
}
function bindCommon() {
  root.querySelector('#language')?.addEventListener('click', () => {
    changeLanguage();
    root.querySelector<HTMLButtonElement>('#language')?.focus();
  });
  root.querySelector('#help')!.addEventListener('click', () => pauseGame(t('플레이 가이드', 'How to play'), true));
  root.querySelector<HTMLButtonElement>('#sound')!.addEventListener('click', event => {
    toggleSound();if(soundEnabled())void playFeedback(true,false);
    const button = event.currentTarget as HTMLButtonElement;
    button.classList.toggle('muted', !soundEnabled());
    button.setAttribute('aria-label', soundEnabled() ? t('효과음 끄기', 'Mute sound') : t('효과음 켜기', 'Enable sound'));
    button.setAttribute('aria-pressed', String(soundEnabled()));
  });
}
function freezeForVisibility() {
  if (screen === 'tutorial') { tutorialControls?.pause(); return; }
  if (paused || (screen !== 'playing' && screen !== 'feedback' && screen!=='ending')) return;
  visibilityPaused = true;holdClock();queueArrival.pause();
  if (screen === 'playing') {
    stopClock(); queueDraw.pause();
  } else if(screen==='ending'){ending.pause();}else { advance.pause(); storageFlight.pause();queueArrival.pause(); }
  paused = true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { freezeForVisibility(); return; }
  if (screen === 'tutorial' && !dialog?.open) tutorialControls?.resume();
  if (!visibilityPaused) return;
  visibilityPaused = false;
  if (dialog?.open) return;
  paused = false;
  if (screen === 'playing') {
    if(drawing)queueDraw.resume();else prepareQuestion();
  } else if (screen === 'feedback') { storageFlight.resume();queueArrival.resume(); advance.resume(); }
  else if(screen==='ending')ending.resume();
  queueArrival.resume();runClock();
});
window.addEventListener('resize', () => {fitCandidate(root.querySelector('.candidate'));fitQueueExpressions(root);});
void document.fonts?.ready.then(() => {fitCandidate(root.querySelector('.candidate'));fitQueueExpressions(root);});
renderHome();
