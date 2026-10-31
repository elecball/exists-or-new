import {t} from './i18n.ts';
import {inputMapping} from './game.ts';
import {binary,normalize,variable,type Expr} from './math.ts';
import {renderMath} from './math-markup.ts';
import {playFeedback,unlockSound} from './sound.ts';
import {AdditionTransition} from './addition-transition.ts';
import {QueueMotion,captureQueueCard,type QueueSnapshot} from './queue-motion.ts';
import {gameBoardMarkup,localizeGameBoard} from './game-board.ts';
import {fitCandidate,fitQueueExpressions} from './fit-candidate.ts';
import {TutorialTimerPointers} from './tutorial-timer-pointers.ts';
import {createQueueSession,generateQueueQuestion,submitQueueAnswer,advanceQueueTime,updateQueueInput,enqueueCandidate,INPUT_SECONDS,MIN_INPUT_SECONDS,type Selection,type QueueAnswer} from './queue-game.ts';
const inputEquality=(value:number)=>`<math class="formula" aria-label="x = ${value}"><mi mathvariant="italic">x</mi><mo>=</mo><mn>${value}</mn></math>`;
const plusMath='<math class="formula" aria-label="+"><mo>+</mo></math>';
export const TUTORIAL_STEPS=6;
export const TUTORIAL_PROGRESS_KEY='exists-tutorial-progress-v1';
function loadProgress():Set<number>{
  try{
    const value=JSON.parse(window.localStorage.getItem(TUTORIAL_PROGRESS_KEY)??'[]');
    return new Set(Array.isArray(value)?value.filter((step:unknown)=>typeof step==='number'&&Number.isInteger(step)&&step>=0&&step<TUTORIAL_STEPS):[]);
  }catch{return new Set();}
}
export function tutorialLesson(index:number){
  if(!Number.isInteger(index)||index<0||index>=TUTORIAL_STEPS)throw Error('Invalid tutorial step');
  const x=variable('x'),twice=binary('+',x,x),s=createQueueSession(()=>.75);
  const expressions:Expr[]=index===1||index===2?[x,twice]:[x];
  s.records=expressions.map((expr,i)=>({id:i+1,expr,polynomial:normalize(expr)}));s.nextId=s.records.length+1;
  s.mappings=[inputMapping(1,0,0)];
  const left=s.records[0],right=left,op=index===1||index===3?'*':'+';
  const expr=binary(op,left.expr,right.expr);s.queue=[{id:s.nextId++,expr,polynomial:normalize(expr),left,right,op}];
  const q=generateQueueQuestion(s),expected:Selection=index===0||index===3?'new':index>=4?null:1;
  if(index===5)for(let i=0;i<4;i++)enqueueCandidate(s,()=>.75);
  const xMath=renderMath(x),sumMath=renderMath(twice),squareMath=renderMath(binary('*',x,x));
  const copy=[
    {title:t('계산하고 추가하기','Calculate, then add'),prompt:t(`${sumMath}는 2, 목록의 ${xMath}는 1. ${plusMath}로 추가하세요.`,`${sumMath} gives 2; the listed ${xMath} gives 1. Choose ${plusMath}.`),explanation:t('새 식이 빈칸에 들어갔습니다.','The new expression fills an empty slot.')},
    {title:t('결과가 같으면 지우기','Clear a matching result'),prompt:t(`${squareMath}도 1입니다. 목록의 ${xMath}를 누르세요.`,`${squareMath} also gives 1. Tap the listed ${xMath}.`),explanation:t(`결과가 같아서 후보와 ${xMath}가 함께 지워졌습니다.`,'Their results match, so both expressions disappear.')},
    {title:t('오답은 큐로','Mistakes go back'),prompt:t(`일부러 틀려보세요. 결과가 2인 후보에 ${xMath}를 누르세요.`,`Try a mistake: the candidate gives 2, but tap ${xMath}.`),explanation:t('후보가 큐로 돌아갔습니다. 목록은 그대로입니다.','The candidate returns to the queue. The list stays unchanged.')},
    {title:t('입력이 바뀌면','When the input changes'),prompt:t(`위 타이머가 끝나면 ${xMath} 값이 바뀝니다. 식은 그대로입니다.`,`When the input timer runs out, ${xMath} changes. The expressions stay the same.`),explanation:t(`식은 그대로지만 결과는 달라졌습니다. 입력 교체 간격은 ${INPUT_SECONDS}초부터 ${MIN_INPUT_SECONDS}초까지 줄어듭니다.`,`Same expressions, different results. Input intervals decrease from ${INPUT_SECONDS}s to ${MIN_INPUT_SECONDS}s.`)},
    {title:t('후보가 들어오는 동안','While candidates arrive'),prompt:t('② 세로 바가 끝날 때마다 새 식이 큐에 들어옵니다.','Each time timer ② runs out, a new expression joins the queue.'),explanation:t('계산하는 동안에도 후보는 계속 들어옵니다. 유입 간격은 10초에서 3초까지 줄어듭니다.','Candidates keep arriving while you calculate. Intervals decrease from 10s to 3s.')},
    {title:t('큐가 가득 차면','When the queue fills'),prompt:t('한 칸 남았습니다. 다음 후보가 들어오는 걸 보세요.','One slot left. Watch the next candidate arrive.'),explanation:t('대기 중인 식이 5개가 되면 게임이 끝납니다.','Five waiting expressions end the game.')},
  ][index];return{index,s,q,expected,inputChanged:false,...copy};
}
export function changeTutorialInput(lesson:ReturnType<typeof tutorialLesson>){
  if(lesson.index!==3||lesson.inputChanged)return;
  advanceQueueTime(lesson.s,INPUT_SECONDS*1000);updateQueueInput(lesson.s,()=>7.25/11);
  lesson.q=generateQueueQuestion(lesson.s);lesson.inputChanged=true;
}
export interface TutorialControls{pause():void;resume():void;cancel():void;refreshLanguage():void}
export function mountTutorial(host:HTMLElement,onExit:()=>void,onPlay:()=>void,onPause:()=>void=()=>{}):TutorialControls{
  let introduction=true,step=0,lesson=tutorialLesson(0),answer:QueueAnswer|null=null,attempted=false,disposed=false,paused=false,busy=true;
  let timerAnimation:Animation|null=null,drawing=false;
  let arrivals=0,gameOver=false,generation=0;
  const flight=new AdditionTransition(),queueMotion=new QueueMotion(),progress=loadProgress(),pointers=new TutorialTimerPointers(host);
  document.body.classList.add('tutorial-playing');
  function complete(){return answer!==null||(step===4&&arrivals===3)||(step===5&&gameOver);}
  function canAdvance(){return introduction||complete()||progress.has(step);}
  function settle(){
    if(disposed)return;
    if(!introduction&&complete()&&!progress.has(step)){
      progress.add(step);
      try{window.localStorage.setItem(TUTORIAL_PROGRESS_KEY,JSON.stringify([...progress].sort()));}catch{/* Practice works without storage. */}
    }
    busy=false;drawing=false;render();
    host.querySelector<HTMLButtonElement>(targetSelector())?.focus();
  }
  function targetSelector(){
    if(introduction||complete())return '#tutorial-next';
    if(busy&&step===3&&!drawing&&!answer)return '.input-table-wrap';
    if(busy&&step>=4)return '.danger-queue';
    return typeof lesson.expected==='number'?`[data-tutorial-record="${lesson.expected}"]`:'#novel';
  }
  function highlightTarget(){
    host.querySelectorAll('.tutorial-target').forEach(element=>{element.classList.remove('tutorial-target');element.removeAttribute('aria-describedby');});
    if(disposed||paused||(busy&&!((step===3&&!drawing&&!answer)||step>=4)))return;
    const target=host.querySelector<HTMLElement>(targetSelector());
    target?.classList.add('tutorial-target');target?.setAttribute('aria-describedby','tutorial-instruction');
  }
  function goTo(next:number){
    if(disposed||paused||(busy&&!progress.has(step))||next< -1||next>=TUTORIAL_STEPS)return;
    const queued=introduction&&next===0?host.querySelector<HTMLElement>('.danger-slot.occupied'):null;
    const from=queued?captureQueueCard(queued):null;
    generation++;flight.cancel();queueMotion.cancel();timerAnimation?.cancel();timerAnimation=null;
    introduction=next===-1;step=Math.max(0,next);lesson=tutorialLesson(step);answer=null;attempted=false;arrivals=0;gameOver=false;draw(from);
  }
  function instructionCopy(){
    const done=complete();
    const prompt=step===3&&lesson.inputChanged?t(`${inputEquality(2)}. 후보는 4, 목록은 2. ${plusMath}로 추가하세요.`,`${inputEquality(2)}. The candidate gives 4; ${renderMath(variable('x'))} gives 2. Choose ${plusMath}.`):lesson.prompt;
    return introduction?t(`현재 입력으로 식의 결과를 비교하는 게임입니다. 같은 결과의 식을 누르고, 없으면 ${plusMath}로 추가하세요.`,`Compare expressions at the current input. Tap a listed expression with the same result, or add it with ${plusMath}.`):done&&!busy?lesson.explanation:attempted&&!answer?t('이번 단계에 적힌 대상을 눌러보세요.','Choose the target described above.'):prompt;
  }
  function render(){
    const{s,q}=lesson,done=complete(),locked=introduction||busy||done||step>=4||(step===3&&!lesson.inputChanged);
    const copy=instructionCopy();
    host.innerHTML=gameBoardMarkup({session:introduction?{...s,queue:[{...q,id:q.candidateId}],current:null}:s,question:q,hideCandidate:introduction,answer,feedback:answer!==null,drawing,storing:busy&&Boolean(answer?.returned||answer?.added),locked,busy,tutorial:true,showRemoved:busy,animateFeedback:busy,arrivalInterval:10,remaining:10,changedInputs:step===3&&lesson.inputChanged&&!done?[0]:[],className:`tutorial-board ${gameOver?'is-ending':''} ${done&&!busy&&step<4?'tutorial-resolved':''}`})+
      `${gameOver?'<div class="tutorial-game-over" role="status">Game over.</div>':''}<aside class="tutorial-coach" aria-label="${t('튜토리얼 안내','Tutorial instructions')}"><button class="coach-arrow" id="tutorial-prev" ${introduction||(busy&&!progress.has(step))?'disabled':''} aria-label="${t('이전 단계','Previous step')}"><span aria-hidden="true">&lt;</span></button><div class="coach-center"><span class="coach-step">${introduction?0:step+1}/${TUTORIAL_STEPS} · ${introduction?'Exists or New':lesson.title}</span><p id="tutorial-instruction" class="tutorial-prompt" aria-live="polite">${copy}</p></div><button class="coach-arrow" id="tutorial-next" ${(busy&&!progress.has(step))||!canAdvance()?'disabled':''} aria-label="${!introduction&&step===TUTORIAL_STEPS-1?t('로비로 돌아가기','Return to lobby'):t('다음 단계','Next step')}"><span aria-hidden="true">&gt;</span></button></aside>`;
    fitCandidate(host.querySelector('.candidate'));fitQueueExpressions(host);pointers.show(!introduction&&step>=4&&!gameOver);
    host.querySelector('#pause')!.addEventListener('click',onPause);
    host.querySelectorAll<HTMLButtonElement>('[data-tutorial-record]').forEach(button=>button.addEventListener('click',()=>choose(Number(button.dataset.tutorialRecord))));
    host.querySelector('#novel')!.addEventListener('click',()=>choose('new'));
    host.querySelector('#tutorial-prev')!.addEventListener('click',()=>goTo(step-1));
    host.querySelector('#tutorial-next')!.addEventListener('click',()=>{
      if(disposed||paused||(busy&&!progress.has(step))||!canAdvance())return;
      if(introduction){goTo(0);return;}
      if(step===TUTORIAL_STEPS-1){onExit();return;}goTo(step+1);
    });
    highlightTarget();
  }
  function draw(from:QueueSnapshot|null=null){
    if(introduction){busy=false;drawing=false;render();host.querySelector<HTMLButtonElement>('#tutorial-next')?.focus();return;}
    busy=true;drawing=step<4;render();
    if(step>=4){
      if(progress.has(step)){
        const count=step===4?3:1;for(let i=0;i<count;i++)enqueueCandidate(lesson.s,()=>.75);arrivals=count;gameOver=step===5;settle();
      }else void showArrivals();
      return;
    }
    const source=host.querySelector<HTMLElement>('.danger-slot:last-child')!,target=host.querySelector<HTMLElement>('#question-title')!;
    const snapshot=from??captureQueueCard(source);
    if(!from){
      snapshot.html=renderMath(lesson.q.expr);
      const text=target.querySelector('.formula')!.getBoundingClientRect();
      snapshot.textWidth=text.width*(parseFloat(getComputedStyle(source).fontSize)||16)/(parseFloat(getComputedStyle(target.querySelector('.operand-expression')!).fontSize)||32);
    }
    void queueMotion.fly(snapshot,target,'draw',()=>{
      if(disposed)return;drawing=false;
      if(step===3&&!lesson.inputChanged){void changeInput();}else settle();
    });
  }
  async function runDemoAnimation(selector:string,frames:Keyframe[],duration:number):Promise<boolean>{
    const target=host.querySelector<HTMLElement>(selector)!,activeGeneration=generation;
    try{
      const animation=target.animate(frames,{duration,fill:'forwards',easing:'linear'});
      timerAnimation=animation;if(paused)animation.pause();
      await animation.finished;if(disposed||generation!==activeGeneration)return false;
      timerAnimation=null;animation.cancel();return true;
    }catch{return false;}
  }
  async function changeInput(){
    if(disposed)return;busy=true;render();
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!await runDemoAnimation('#input-time-bar',[{transform:'scaleX(1)',offset:0},{transform:'scaleX(1)',offset:.25},{transform:'scaleX(0)',offset:.8},{transform:'scaleX(0)',offset:1}],reduced?800:3200))return;
    changeTutorialInput(lesson);render();
    // Allow time to compare the new value before enabling the answer.
    if(!await runDemoAnimation('.input-values',[{opacity:1},{opacity:1}],900))return;
    settle();
  }
  async function showArrivals(){
    const count=step===4?3:1,reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for(let i=0;i<count;i++){
      if(!await runDemoAnimation('#time-bar',[{transform:'scaleY(1)',offset:0},{transform:'scaleY(0)',offset:1}],reduced?500:1400))return;
      enqueueCandidate(lesson.s,()=>.75);arrivals++;render();
      const card=host.querySelector<HTMLElement>(`#queue-${lesson.s.queue[0].id}`)!;
      const from=captureQueueCard(card);from.top-=44;
      await new Promise<void>(resolve=>{void queueMotion.fly(from,card,'arrival',resolve);});
      if(disposed)return;
    }
    if(step===5){
      host.querySelector('.game')?.classList.add('is-ending');void playFeedback(false,true);
      if(!await runDemoAnimation('.danger-queue',[{opacity:1},{opacity:1}],1000))return;
      gameOver=true;
    }
    settle();
  }
  function choose(selection:Selection){
    if(introduction||disposed||paused||busy||complete()||step>=4||(step===3&&!lesson.inputChanged))return;
    attempted=true;void unlockSound();
    if(selection!==lesson.expected){void playFeedback(false,false);render();return;}
    answer=submitQueueAnswer(lesson.s,lesson.q,selection);busy=true;render();void playFeedback(answer.correct,false);
    const source=host.querySelector<HTMLElement>('#question-title')!;
    if(answer.removed){
      const target=host.querySelector<HTMLElement>('#clearing-record')!;
      void flight.absorb(source,target,settle,()=>target.classList.add('record-clearing'));
    }else{
      const target=host.querySelector<HTMLElement>(answer.returned?`#queue-${lesson.q.candidateId}`:`#record-${answer.added!.id}`)!;
      void flight.store(source,{parts:[target.querySelector<HTMLElement>('.record-expression')!],reveal:[target],frame:target},settle);
    }
  }
  draw();
  return{refreshLanguage(){
    const translated=tutorialLesson(step);lesson.title=translated.title;lesson.prompt=translated.prompt;lesson.explanation=translated.explanation;
    host.querySelector('.coach-step')!.textContent=`${introduction?0:step+1}/${TUTORIAL_STEPS} · ${introduction?'Exists or New':lesson.title}`;
    host.querySelector('#tutorial-instruction')!.innerHTML=instructionCopy();
    host.querySelector('#tutorial-prev')!.setAttribute('aria-label',t('이전 단계','Previous step'));
    host.querySelector('#tutorial-next')!.setAttribute('aria-label',!introduction&&step===TUTORIAL_STEPS-1?t('로비로 돌아가기','Return to lobby'):t('다음 단계','Next step'));
    host.querySelector('.tutorial-coach')!.setAttribute('aria-label',t('튜토리얼 안내','Tutorial instructions'));
    localizeGameBoard(host,{session:lesson.s,question:lesson.q,answer,feedback:answer!==null,arrivalInterval:10,remaining:10});pointers.show(!introduction&&step>=4&&!gameOver);
  },pause(){paused=true;highlightTarget();flight.pause();queueMotion.pause();timerAnimation?.pause();},resume(){paused=false;flight.resume();queueMotion.resume();timerAnimation?.play();highlightTarget();},cancel(){disposed=true;pointers.cancel();flight.cancel();queueMotion.cancel();timerAnimation?.cancel();timerAnimation=null;document.body.classList.remove('tutorial-playing');}};
}
