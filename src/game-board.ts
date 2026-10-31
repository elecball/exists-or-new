import {t} from './i18n.ts';
import {format,formatComposition} from './math.ts';
import {escapeHtml as escape,renderMath} from './math-markup.ts';
import {timeTone} from './game.ts';
import {inputSecondsRemaining,inputIntervalSeconds,type QueueSession,type QueueQuestion,type QueueAnswer} from './queue-game.ts';
export interface BoardState{
  session:QueueSession;question:QueueQuestion|null;answer?:QueueAnswer|null;feedback?:boolean;
  drawing?:boolean;storing?:boolean;arriving?:boolean;arrivingId?:number|null;locked?:boolean;
  changedInputs?:number[];arrivalInterval:number;remaining:number;
  className?:string;tutorial?:boolean;busy?:boolean;showRemoved?:boolean;animateFeedback?:boolean;hideCandidate?:boolean;
}
const expression=(value:string)=>escape(value).replace(/-/g,'−');
export const emptyRecord=(slot=-1)=>`<div class="record empty-record" data-slot="${slot}" aria-hidden="true">·</div>`;
function recordsMarkup(b:BoardState){
  const a=b.answer,records=new Map(b.session.records.map(record=>[record.id,record]));
  return b.session.recordSlots.map((id,slot)=>{
    const clearing=b.feedback&&a?.removed&&a.removedIndex===slot&&b.showRemoved!==false;
    const r=clearing?a!.removed:id!==null?records.get(id):null;if(!r)return emptyRecord(slot);
    const selected=b.feedback&&a?.selection===r.id,added=b.feedback&&a?.added?.id===r.id;
    const state=selected?(a!.correct?'selected-correct':'selected-wrong'):'';
    return `<button type="button" class="record ${state} ${added&&b.storing?'arrival-target':''}" data-slot="${slot}" id="${clearing?'clearing-record':'record-'+r.id}" ${clearing?'data-clearing="true"':`data-record-id="${r.id}"`} ${b.tutorial?`data-tutorial-record="${r.id}"`:''} ${b.locked||!b.question||b.feedback||b.drawing?'disabled':''} aria-label="${escape(format(r.expr))}"><span class="math record-expression">${renderMath(r.expr)}</span></button>`;
  }).join('');
}
export function inputMarkup(b:BoardState){
  const s=b.session,seconds=inputSecondsRemaining(s),interval=inputIntervalSeconds(s);
  return `<section class="input-table-wrap math" aria-label="${t('현재 입력','Current input')}"><div class="input-timer" role="progressbar" aria-label="${t('다음 입력까지','Next input in')}" aria-valuemin="0" aria-valuemax="${interval}" aria-valuenow="${seconds.toFixed(1)}"><div id="input-time-bar" style="transform:scaleX(${seconds/interval})"></div></div><table class="input-values"><caption class="sr-only">${t('현재 입력','Current input')}</caption><tbody><tr>${s.settings.variables.map((name,i)=>`<td class="input-pair"><span class="input-field"><span class="input-variable">${renderMath({kind:'variable',name})}</span><span class="input-equals" aria-hidden="true">=</span><span data-variable="${name}" data-input="${i}" class="input-value ${b.changedInputs?.includes(i)?'input-enter':''}" aria-label="${name} = ${escape(s.mappings[0][name].toString())}">${expression(s.mappings[0][name].toString())}</span></span></td>`).join('')}</tr></tbody></table></section>`;
}
export function queueMarkup(b:BoardState){
  const s=b.session,tone=s.queue.length>=4?'critical':s.queue.length>=3?'warning':'normal';
  return `<aside class="danger-queue queue-${tone} ${b.feedback&&b.answer?.returned&&b.animateFeedback!==false?'queue-hit':''}" aria-label="${t('대기 중인 식 5칸 큐','Five-slot expression queue')}"><div class="danger-slots">${Array.from({length:s.capacity-s.queue.length},()=>'<div class="danger-slot empty" aria-hidden="true">·</div>').join('')}${s.queue.map((entry,index)=>{
    const returned=b.feedback&&b.answer?.returned&&entry.id===b.question?.candidateId;
    return `<div class="danger-slot occupied ${returned?'queue-return':''} ${returned&&b.storing?'arrival-target':''} ${entry.id===b.arrivingId&&b.arriving?'queue-hidden':''}" id="queue-${entry.id}" ${index===s.queue.length-1?'data-next="true"':''}><span class="math record-expression">${renderMath(entry.expr)}</span></div>`;
  }).join('')}</div><div class="time-track queue-timer" role="progressbar" aria-label="${t('다음 식까지','Next arrival in')}" aria-valuemin="0" aria-valuemax="${b.arrivalInterval}" aria-valuenow="${b.remaining.toFixed(1)}"><div id="time-bar" class="time-${timeTone(b.remaining,b.arrivalInterval)}" style="transform:scaleY(${b.remaining/b.arrivalInterval})"></div></div></aside>`;
}
function answerMarkup(b:BoardState){
  const a=b.answer,state=b.feedback&&a?.selection==='new'?(a.correct?'selected-correct':'selected-wrong'):'';
  return `<div class="answer-buttons queue-actions"><button class="answer-button novel ${state}" id="novel" ${b.locked||b.feedback||b.drawing?'disabled':''} aria-label="${t('같은 식이 없으므로 목록에 추가','No match; add to the list')}" aria-pressed="${Boolean(b.feedback&&a?.selection==='new')}"><span class="choice-math" aria-hidden="true">+</span></button></div>`;
}
function feedbackMarkup(a:QueueAnswer,animate=true){
  const result=a.reason==='full'?t('목록이 가득 참 · 큐로 반환','List full · returned to queue'):a.correct?t('정답','Correct'):t('오답','Incorrect');
  return `<section class="feedback ${a.correct?'correct':'incorrect'} ${animate?'':'feedback-still'}" aria-live="polite" tabindex="-1"><div class="feedback-title">${!a.correct?'<span class="damage-emoji" aria-hidden="true">😵‍💫</span>':''}<span>${a.correct?'✓':'×'} ${result}${!a.correct?`<span class="sr-only">${t(', 후보를 큐로 반환',', candidate returned to the queue')}</span>`:''}</span><strong>+${a.earned}</strong></div></section>`;
}
/** The same board structure and classes are used by live play and guided practice. */
export function gameBoardMarkup(b:BoardState){
  const s=b.session,q=b.question,a=b.answer;
  return `<main class="game ${b.className??''} ${b.drawing?'is-drawing':''} ${b.storing?'is-storing':''} ${b.feedback&&a&&!a.correct&&b.animateFeedback!==false?'took-damage':''} ${b.feedback&&q?.matchId!==null&&a?.choice===false?'is-duplicate':''}" ${b.tutorial?`aria-busy="${Boolean(b.busy)}"`:''}><section class="status" aria-label="${t('게임 현황','Game status')}"><span class="score-item"><small>${t('점수','Score')}</small> <strong>${expression(s.score.toLocaleString())}</strong></span><span class="score-item"><small>${t('연속','Streak')}</small> <strong>${s.streak}</strong></span><button id="pause" class="pause-button" aria-label="${t('게임 일시정지','Pause game')}">Ⅱ</button></section><section class="archive" aria-label="${t('식 목록','Expression list')}"><div class="records" tabindex="0" aria-label="${t('식 기록 세로 스크롤','Scroll archived expressions vertically')}">${recordsMarkup(b)}</div></section><div class="playfield">${inputMarkup(b)}<div class="puzzle-host" tabindex="-1" aria-label="${t('문제 영역','Puzzle area')}">${q?`<section class="puzzle" aria-label="${t('현재 문제','Current candidate')}"><div id="question-title" data-candidate-id="${q.candidateId}" tabindex="-1" class="candidate" ${b.hideCandidate?'aria-hidden="true"':''} aria-label="${b.hideCandidate?'':escape(formatComposition(q.expr))}"><div class="operand"><div class="math operand-expression">${b.hideCandidate?'':renderMath(q.expr)}</div></div></div><div class="answer-area">${answerMarkup(b)}${b.feedback&&a?feedbackMarkup(a,b.animateFeedback!==false):''}</div></section>`:`<section class="waiting-puzzle" aria-live="polite">${t('다음 식을 기다리는 중','Waiting for the next expression')}<span aria-hidden="true">···</span></section>`}</div>${queueMarkup(b)}</div></main>`;
}

/** Update labels without replacing elements that are moving or counting down. */
export function localizeGameBoard(root:ParentNode,b:BoardState){
  const template=document.createElement('template');template.innerHTML=gameBoardMarkup(b);
  for(const selector of ['.status','.archive','.records','.input-table-wrap','.input-timer','.puzzle-host','.puzzle','.danger-queue','.queue-timer','#novel','#pause']){
    const source=template.content.querySelector(selector),target=root.querySelector(selector),label=source?.getAttribute('aria-label');
    if(label)target?.setAttribute('aria-label',label);
  }
  for(const selector of ['.score-item small','.input-values caption','.feedback-title > span:not(.damage-emoji)']){
    const source=template.content.querySelectorAll(selector),targets=root.querySelectorAll(selector);
    source.forEach((el,i)=>{if(targets[i])targets[i].innerHTML=el.innerHTML;});
  }
}
