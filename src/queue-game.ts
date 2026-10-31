import {createSession, inputMapping, equivalentOnMappings, outputsFor, sameOutputs, withinDifficultyLimits, type InputMapping, type Session, type Question, type Answer, type Entry} from './game.ts';
import {binary,combine,constant,format,formatComposition,variable,normalize,type Operator} from './math.ts';
import {sampleCombinationIndices} from './candidate-sampling.ts';

export const QUEUE_CAPACITY=5;
export const RECORD_CAPACITY=9;
export const VALUE_BOUND=5;
export const INPUT_SECONDS=20;
export const MIN_INPUT_SECONDS=10;
export const INPUT_STEP_SECONDS=.5;
export const inputIntervalSeconds=(s:QueueSession)=>Math.max(MIN_INPUT_SECONDS,INPUT_SECONDS-s.inputChanges*INPUT_STEP_SECONDS);
function inputArrivalMilliseconds(count:number){
  const shrinking=Math.min(count,(INPUT_SECONDS-MIN_INPUT_SECONDS)/INPUT_STEP_SECONDS);
  return (shrinking*(2*INPUT_SECONDS-(shrinking-1)*INPUT_STEP_SECONDS)/2+(count-shrinking)*MIN_INPUT_SECONDS)*1000;
}
export const CONSTANT_CHANCE=.2;
export const ARRIVAL_SECONDS=10;
export const MIN_ARRIVAL_SECONDS=3;
export const ARRIVAL_STEP_SECONDS=.5;
export const nextArrivalSeconds=(seconds:number)=>Math.max(MIN_ARRIVAL_SECONDS,seconds-ARRIVAL_STEP_SECONDS);
export type Selection=number|'new'|null;
export interface Candidate extends Entry {left:Entry;right:Entry;op:Operator}
export interface QueueQuestion extends Question {candidateId:number}
export interface QueueAnswer extends Answer {
  question:QueueQuestion;
  selection:Selection; returned:boolean; removed:Entry|null; removedIndex:number; added:Entry|null;
  reason:'match'|'new'|'wrong'|'full';
}
export interface QueueSession extends Session {
  queue:Candidate[]; current:QueueQuestion|null; capacity:number; recordCapacity:number; nextId:number;
  inputChanges:number; playMilliseconds:number; answers:QueueAnswer[]; recordSlots:(number|null)[];
}
export function createQueueSession(random=Math.random,variableCount=1):QueueSession {
  const base=createSession('easy',random,{seconds:ARRIVAL_SECONDS,variableCount});
  base.settings={...base.settings,inputBound:VALUE_BOUND,constantBound:VALUE_BOUND,maxOutput:99,maxDegree:4,maxNodes:base.settings.maxNodes+2};
  base.mappings=[sampleQueueInput(base,random)];
  const s:QueueSession={...base,queue:[],current:null,capacity:QUEUE_CAPACITY,recordCapacity:RECORD_CAPACITY,nextId:base.records.length+1,inputChanges:0,playMilliseconds:0,answers:[],recordSlots:Array.from({length:RECORD_CAPACITY},(_,i)=>base.records[i]?.id??null)};
  s.queue.push(createCandidate(s,random));return s;
}
export const isQueueOver=(s:QueueSession)=>s.queue.length>=s.capacity;
/** Keep every surviving card in its slot; only newly introduced cards fill empty slots. */
function syncSlots(s:QueueSession) {
  const ids=new Set(s.records.map(entry=>entry.id));
  s.recordSlots=s.recordSlots.map(id=>id!==null&&ids.has(id)?id:null);
  for(const entry of s.records)if(!s.recordSlots.includes(entry.id)){
    const slot=s.recordSlots.indexOf(null);if(slot<0)throw Error('식 목록이 가득 찼습니다.');
    s.recordSlots[slot]=entry.id;
  }
}
/** Expressions are immutable. Base grammar variables remain available even if their cards are deleted. */
export function createCandidate(s:QueueSession,random=Math.random):Candidate {
  const base=s.settings.variables.map((name,i)=>{const expr=variable(name);return {id:-i-1,expr,polynomial:normalize(expr)};});
  return candidatePool(s,base,random);
}
function candidatePool(s:QueueSession,base:Entry[],random:()=>number):Candidate {
  const atoms=base;
  const pool=[...atoms,...s.records,...s.queue];
  if(random()<CONSTANT_CHANCE){
    const value=Math.min(2*VALUE_BOUND,Math.max(0,Math.floor(random()*(2*VALUE_BOUND+1))))-VALUE_BOUND,expr=constant(value);
    pool.push({id:-100+value,expr,polynomial:normalize(expr)});
  }
  const unique=[...new Map(pool.map(entry=>[format(entry.expr),entry])).values()];
  const matches:Omit<Candidate,'id'>[]=[],novel:Omit<Candidate,'id'>[]=[];
  const ops:Operator[]=['+','-','*'];
  for(const index of sampleCombinationIndices(unique.length,random)){
    const left=unique[Math.floor(index/(unique.length*3))],right=unique[Math.floor(index/3)%unique.length],op=ops[index%3];
    const expr=binary(op,left.expr,right.expr),polynomial=combine(op,left.polynomial,right.polynomial);
    if(!withinDifficultyLimits(expr,polynomial,s.settings))continue;
    const outputs=outputsFor(expr,s.mappings);
    if(outputs.some(value=>(value.n<0n?-value.n:value.n)>BigInt(s.settings.maxOutput)*value.d))continue;
    const candidate={expr,polynomial,left,right,op};
    (s.records.some(entry=>sameOutputs(outputsFor(entry.expr,s.mappings),outputs))?matches:novel).push(candidate);
  }
  const desired=random()<.5?matches:novel, choices=desired.length?desired:[...matches,...novel];
  if(!choices.length){
    const left=atoms[0],expr=binary('-',left.expr,left.expr);
    return {id:s.nextId++,expr,polynomial:combine('-',left.polynomial,left.polynomial),left,right:left,op:'-'};
  }
  const weights=choices.map(c=>{
    const variables=Number(c.left.expr.kind==='variable')+Number(c.right.expr.kind==='variable');
    const retainsVariable=[...c.polynomial.keys()].some(key=>key!=='0,0,0');
    return (8/(8+formatComposition(c.expr).length))**2*2**variables*(retainsVariable?3:1);
  });
  let ticket=random()*weights.reduce((a,b)=>a+b,0);
  const selected=choices.find((_,i)=>(ticket-=weights[i])<0)??choices.at(-1)!;
  return {id:s.nextId++,...selected};
}
/** Newest is at index zero; the last entry is the oldest and is drawn next. */
export function generateQueueQuestion(s:QueueSession,random=Math.random):QueueQuestion {
  if(isQueueOver(s))throw new Error('큐가 가득 찼습니다.');
  syncSlots(s);
  updateQueueInput(s,random);
  if(s.current&&s.current.mappings.length===s.mappings.length&&s.current.mappings.every((mapping,i)=>mapping===s.mappings[i]))return s.current;
  const candidate=s.current?{...s.current,id:s.current.candidateId}:s.queue.pop();if(!candidate)throw new Error('대기 중인 식이 없습니다.');
  const mappings=[...s.mappings],outputs=outputsFor(candidate.expr,mappings);
  const matchId=s.records.find(entry=>sameOutputs(outputsFor(entry.expr,mappings),outputs))?.id??null;
  s.current={...candidate,candidateId:candidate.id,mappings,outputs,matchId};
  return s.current;
}
export function submitQueueAnswer(s:QueueSession,q:QueueQuestion,selection:Selection,_remaining=0,_random=Math.random):QueueAnswer {
  const previous=s.answers.find(answer=>answer.question===q);if(previous)return previous;
  if(isQueueOver(s)||s.current!==q)throw new Error('현재 라운드의 식이 아닙니다.');
  syncSlots(s);
  const selectedIndex=typeof selection==='number'?s.records.findIndex(entry=>entry.id===selection):-1;
  if(typeof selection==='number'&&selectedIndex<0)throw new Error('목록에 없는 식입니다.');
  const selected=selection!==null&&selectedIndex>=0?s.records[selectedIndex]:null;
  let reason:QueueAnswer['reason']='wrong',removed:Entry|null=null,added:Entry|null=null,removedIndex=-1;
  if(selected&&equivalentOnMappings(selected.expr,q.expr,q.mappings)){
    reason='match';removed=selected;removedIndex=s.recordSlots.indexOf(selected.id);
    s.recordSlots[removedIndex]=null;s.records.splice(selectedIndex,1);
  }else if(selection==='new'&&q.matchId===null){
    if(s.records.length===s.recordCapacity)reason='full';
    else {reason='new';added={id:q.candidateId,expr:q.expr,polynomial:q.polynomial};s.records.push(added);s.recordSlots[s.recordSlots.indexOf(null)]=added.id;}
  }
  const correct=reason==='match'||reason==='new',returned=!correct;
  if(returned)s.queue.unshift({id:q.candidateId,expr:q.expr,polynomial:q.polynomial,left:q.left,right:q.right,op:q.op});
  s.streak=correct?s.streak+1:0;
  const earned=correct?Math.min(Number.MAX_SAFE_INTEGER-s.score,Math.round(100*1.01**s.streak)):0;
  s.score+=earned;
  const answer:QueueAnswer={question:q,selection,choice:selection===null?null:selection!=='new',correct,earned,replaced:null,returned,removed,removedIndex,added,reason};
  s.answers.push(answer);s.current=null;
  return answer;
}

/** Only the independent arrival clock adds fresh expressions. Never overflow the queue. */
export function enqueueCandidate(s:QueueSession,random=Math.random):Candidate|null {
  if(isQueueOver(s))return null;
  const candidate=createCandidate(s,random);s.queue.unshift(candidate);return candidate;
}

/** Initial coordinates are sampled independently from the bounded integer domain. */
function sampleQueueInput(s:Session,random:()=>number):InputMapping{
  const radix=2*VALUE_BOUND+1,total=radix**s.settings.variables.length;
  let code=Math.min(total-1,Math.max(0,Math.floor(random()*total)));
  const values={x:0,y:0,z:0};
  for(const name of s.settings.variables){values[name]=code%radix-VALUE_BOUND;code=Math.floor(code/radix);}
  return inputMapping(values.x,values.y,values.z);
}
/** Reroll every active coordinate together; unchanged values are valid outcomes. */
export function updateQueueInput(s:QueueSession,random=Math.random){
  while(hasDueQueueMapping(s)){
    s.mappings=[sampleQueueInput(s,random)];s.inputChanges++;
  }
}

export function advanceQueueTime(s:QueueSession,milliseconds:number){
  if(!Number.isFinite(milliseconds)||milliseconds<0)throw Error('Invalid elapsed time');
  s.playMilliseconds+=milliseconds;
}
export const hasDueQueueMapping=(s:QueueSession)=>s.playMilliseconds>=inputArrivalMilliseconds(s.inputChanges+1);

export function inputSecondsRemaining(s:QueueSession):number{
  return Math.max(0,(inputArrivalMilliseconds(s.inputChanges+1)-s.playMilliseconds)/1000);
}
