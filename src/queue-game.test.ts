import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputMapping,outputsFor,sameOutputs,withinDifficultyLimits} from './game.ts';
import {binary,constant,normalize,variable,equal,type Expr} from './math.ts';
import {createQueueSession,generateQueueQuestion,submitQueueAnswer,createCandidate,inputIntervalSeconds,inputSecondsRemaining,advanceQueueTime,updateQueueInput,enqueueCandidate,nextArrivalSeconds,isQueueOver,QUEUE_CAPACITY,RECORD_CAPACITY,type QueueSession,type Candidate} from './queue-game.ts';
const rng=(initial:number)=>{let seed=initial;return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};};
function candidate(s:QueueSession,expr:Expr):Candidate {
  if(expr.kind!=='binary')throw Error('binary fixture');
  const left={id:-1,expr:expr.left,polynomial:normalize(expr.left)},right={id:-2,expr:expr.right,polynomial:normalize(expr.right)};
  return{id:s.nextId++,expr,polynomial:normalize(expr),left,right,op:expr.op};
}
function active(expr:Expr,x=2){const s=createQueueSession(rng(3));s.mappings=[inputMapping(x,0,0)];s.queue=[candidate(s,expr)];return{s,q:generateQueueQuestion(s,rng(1))};}
const x=variable('x');
test('starts with variable cards, one pending expression and a five-slot queue',()=>{
  const s=createQueueSession(rng(1));assert.equal(s.records.length,1);assert.equal(s.records[0].expr.kind,'variable');
  assert.equal(s.queue.length,1);assert.equal(s.capacity,5);assert.equal(s.recordCapacity,9);
  const id=s.queue.at(-1)!.id,q=generateQueueQuestion(s);assert.equal(q.candidateId,id);assert.equal(s.queue.length,0);assert.equal(generateQueueQuestion(s),q);
});
test('matching a card removes that exact existing expression and consumes E',()=>{
  const {s,q}=active(binary('*',x,x),1),old=s.records[0];
  const a=submitQueueAnswer(s,q,old.id,20,rng(2));
  assert.equal(a.correct,true);assert.equal(a.removed,old);assert.equal(s.records.length,0);assert.equal(a.returned,false);
  assert.equal(s.queue.length,0);assert.equal(s.queue.some(e=>e.id===q.candidateId),false);
  assert.deepEqual(old.expr,variable('x')); // The removed snapshot was not mutated.

});
test('a new E enters the list without creating an arrival or a speed bonus',()=>{
  const {s,q}=active(binary('+',x,x));const a=submitQueueAnswer(s,q,'new',20,rng(2));
  assert.equal(a.correct,true);assert.equal(a.reason,'new');assert.equal(s.records.length,2);assert.equal(a.added!.id,q.candidateId);
  assert.equal(a.added!.expr,q.expr);assert.equal(s.queue.length,0);assert.equal(s.score,101);
});
test('wrong selections return only the exact candidate, with idempotent scoring',()=>{
  for(const kind of ['card','new'] as const){
    const {s,q}=active(binary(kind==='new'?'*':'+',x,x),kind==='new'?1:2),before=[...s.records];
    const selection=kind==='card'?s.records[0].id:kind==='new'?'new':null;
    const a=submitQueueAnswer(s,q,selection,0,rng(4));
    assert.equal(a.correct,false);assert.equal(a.returned,true);assert.deepEqual(s.records,before);assert.equal(s.queue.length,1);
    assert.equal(s.queue[0].id,q.candidateId);assert.equal(s.queue[0].expr,q.expr);
    assert.equal(submitQueueAnswer(s,q,'new',30),a);assert.equal(s.queue.length,1);
  }
});
test('FIFO: draw from the last end, so returned E is actually encountered again',()=>{
  const s=createQueueSession(rng(7));s.mappings=[inputMapping(2,0,0)];
  const a=candidate(s,binary('+',x,x)),b=candidate(s,binary('-',x,x)),c=candidate(s,binary('*',x,x));s.queue=[c,b,a];
  let q=generateQueueQuestion(s);assert.equal(q.candidateId,a.id);submitQueueAnswer(s,q,1,20,rng(2));
  q=generateQueueQuestion(s);assert.equal(q.candidateId,b.id);submitQueueAnswer(s,q,q.matchId??'new',20,rng(3));
  q=generateQueueQuestion(s);assert.equal(q.candidateId,c.id);submitQueueAnswer(s,q,q.matchId??'new',20,rng(4));
  q=generateQueueQuestion(s);assert.equal(q.candidateId,a.id);assert.equal(q.expr,a.expr);
});
test('queued expressions are reclassified using current cards and all current inputs',()=>{
  const s=createQueueSession(rng(3));s.mappings=[inputMapping(1,0,0)];const e=candidate(s,binary('*',x,x));s.queue=[e];
  const q=generateQueueQuestion(s);assert.equal(q.matchId,s.records[0].id);submitQueueAnswer(s,q,'new',20,rng(1));
  s.mappings.push(inputMapping(2,0,0));const retried=generateQueueQuestion(s);
  assert.equal(retried.candidateId,e.id);assert.equal(retried.matchId,null);assert.deepEqual(retried.outputs.map(v=>v.toString()),['1','4']);
  assert.equal(q.mappings.length,1);assert.equal(q.matchId,1);
});
test('full 3×3 list returns a novel expression without overflowing or deleting a card',()=>{
  const {s,q}=active(binary('+',constant(5),constant(5)));
  s.records=Array.from({length:RECORD_CAPACITY},(_,i)=>{const expr=constant(i);return{id:s.nextId++,expr,polynomial:normalize(expr)};});
  const before=[...s.records],a=submitQueueAnswer(s,q,'new',20,rng(1));
  assert.equal(a.reason,'full');assert.equal(a.returned,true);assert.deepEqual(s.records,before);assert.equal(s.queue.length,1);
});
test('only arrivals grow the queue, including while a candidate is still active',()=>{
  const random=rng(2),s=createQueueSession(random),q=generateQueueQuestion(s,random);
  for(let i=0;i<QUEUE_CAPACITY;i++){
    const arrival=enqueueCandidate(s,random);assert.ok(arrival);assert.equal(s.queue[0],arrival);
    assert.equal(s.current,q);assert.equal(s.queue.length,i+1);
  }
  assert.ok(isQueueOver(s));assert.equal(enqueueCandidate(s,random),null);assert.equal(s.queue.length,5);
  assert.throws(()=>submitQueueAnswer(s,q,'new'),/現在|현재/);
});
test('answers have no deadline: zero or negative elapsed budget cannot turn a correct answer into a timeout',()=>{
  for(const budget of [0,-100,NaN]){
    const {s,q}=active(binary('+',x,x));const a=submitQueueAnswer(s,q,'new',budget);
    assert.ok(a.correct);assert.equal(a.earned,101);assert.equal(s.queue.length,0);
  }
});
test('empty expression lists still generate valid bounded expressions from grammar variables',()=>{
  const s=createQueueSession(rng(5));s.records=[];
  for(let seed=0;seed<30;seed++){
    const c=createCandidate(s,rng(seed));assert.ok(withinDifficultyLimits(c.expr,c.polynomial,s.settings));assert.ok(equal(normalize(c.expr),c.polynomial));
  }
});
test('long seeded plays preserve exact decisions, unique card IDs and bounded queues',()=>{
  for(let seed=1;seed<=12;seed++){
    const random=rng(seed),s=createQueueSession(random);
    for(let r=0;r<70&&!isQueueOver(s);r++){
      if(!s.queue.length)enqueueCandidate(s,random);
      const q=generateQueueQuestion(s,random),match=s.records.find(e=>sameOutputs(outputsFor(e.expr,q.mappings),q.outputs));
      assert.equal(q.matchId,match?.id??null);assert.ok(equal(normalize(q.expr),q.polynomial));
      const a=submitQueueAnswer(s,q,r%17===0?null:match?.id??'new',r%17===0?0:20,random);
      assert.equal(s.records.length<=9,true);assert.equal(s.queue.length<=5,true);assert.equal(new Set(s.records.map(e=>e.id)).size,s.records.length);
      if(a.removed)assert.equal(s.records.includes(a.removed),false);
      assert.equal(s.current,null);
    }
  }
});
test('clearing a card leaves its slot empty across rounds and new cards fill holes without shifting others',()=>{
  const {s,q}=active(binary('+',x,x));const first=submitQueueAnswer(s,q,'new',20,rng(2));
  assert.equal(s.recordSlots[0],1);assert.equal(s.recordSlots[1],first.added!.id);
  s.queue=[candidate(s,binary('*',x,x))];s.mappings=[inputMapping(1,0,0)];
  const match=generateQueueQuestion(s),removed=submitQueueAnswer(s,match,1,20,rng(2));
  assert.equal(removed.removedIndex,0);assert.equal(s.recordSlots[0],null);assert.equal(s.recordSlots[1],first.added!.id);
  s.queue=[candidate(s,binary('+',x,x))];s.mappings=[inputMapping(3,0,0)];
  const next=generateQueueQuestion(s);assert.equal(s.recordSlots[1],first.added!.id);
  // Remove the surviving 2x representative, then add a genuinely different value.
  submitQueueAnswer(s,next,first.added!.id,20,rng(2));assert.equal(s.recordSlots[1],null);
  s.queue=[candidate(s,binary('*',x,x))];const novel=generateQueueQuestion(s);
  const added=submitQueueAnswer(s,novel,'new',20,rng(2));assert.equal(s.recordSlots[0],added.added!.id);assert.equal(s.recordSlots[1],null);
});

test('arrival intervals decrease from fifteen seconds and never fall below three',()=>{
  let interval=10;const intervals=[interval];
  for(let i=0;i<16;i++)intervals.push(interval=nextArrivalSeconds(interval));
  assert.deepEqual(intervals,[10,9.5,9,8.5,8,7.5,7,6.5,6,5.5,5,4.5,4,3.5,3,3,3]);
});

test('input replacements stay in −5…5, can repeat values, and keep one column indefinitely',()=>{
  const initial=new Set<number>();
  for(let seed=0;seed<150;seed++){
    const random=rng(seed),s=createQueueSession(random);initial.add(Number(s.mappings[0].x.n));
    for(let i=0;i<25;i++){
      advanceQueueTime(s,inputSecondsRemaining(s)*1000);updateQueueInput(s,random);
      assert.equal(s.mappings.length,1);
      assert.ok(s.mappings[0].x.n>=-5n&&s.mappings[0].x.n<=5n);
    }
    assert.equal(inputIntervalSeconds(s),10);assert.equal(s.inputChanges,25);
  }
  assert.ok(initial.has(0));
});
test('occasional constants appear as literal operands, always within −5…5',()=>{
  const random=rng(8721),s=createQueueSession(random);s.mappings=[inputMapping(1,0,0)];
  const literals=(expr:Expr):number[]=>expr.kind==='constant'?[Number(expr.value.n)]:expr.kind==='variable'?[]:[...literals(expr.left),...literals(expr.right)];
  let withConstant=0;
  for(let i=0;i<1000;i++){
    const c=createCandidate(s,random),values=literals(c.expr);if(values.length)withConstant++;
    for(const value of values)assert.ok(Number.isInteger(value)&&value>=-5&&value<=5);
  }
  assert.ok(withConstant>0);assert.ok(withConstant<250,`Too many constant candidates: ${withConstant}`);
});

test('inputs change by play time, not answer count, and reclassify the active candidate',()=>{
  const {s,q}=active(binary('*',x,x),1);assert.equal(q.matchId,1);
  s.answers.length=100;updateQueueInput(s,()=>0);assert.equal(s.mappings.length,1);s.answers.length=0;
  advanceQueueTime(s,19999);updateQueueInput(s,()=>0);assert.equal(s.mappings.length,1);
  advanceQueueTime(s,1);const updated=generateQueueQuestion(s,()=>0);
  assert.equal(s.mappings.length,1);assert.equal(s.inputChanges,1);assert.equal(updated.candidateId,q.candidateId);assert.equal(s.queue.length,0);
  assert.equal(updated.matchId,null);assert.equal(q.matchId,1);assert.equal(q.mappings.length,1);
  advanceQueueTime(s,19_500);updateQueueInput(s,()=>0);assert.equal(s.mappings.length,1);assert.equal(s.inputChanges,2);
});

test('input timer starts at 20 seconds, decreases by half a second, and stays at 10',()=>{
  const s=createQueueSession(rng(2));assert.equal(inputSecondsRemaining(s),20);
  advanceQueueTime(s,10_000);assert.equal(inputSecondsRemaining(s),10);
  advanceQueueTime(s,10_000);assert.equal(inputSecondsRemaining(s),0);
  updateQueueInput(s,rng(3));assert.equal(inputSecondsRemaining(s),19.5);assert.equal(inputIntervalSeconds(s),19.5);
  advanceQueueTime(s,60_000*30);updateQueueInput(s,rng(3));assert.ok(inputSecondsRemaining(s)>0);assert.equal(inputIntervalSeconds(s),10);assert.equal(s.mappings.length,1);
});
test('successive correct answers earn rounded 100 × 1.01^n; a mistake resets the streak',()=>{
  const {s,q}=active(binary('+',x,x));let a=submitQueueAnswer(s,q,'new');assert.equal(a.earned,101);
  s.queue=[candidate(s,binary('+',x,x))];let next=generateQueueQuestion(s);a=submitQueueAnswer(s,next,next.matchId!);
  assert.equal(a.earned,102);assert.equal(s.streak,2);assert.equal(s.score,203);
  s.queue=[candidate(s,binary('+',x,x))];next=generateQueueQuestion(s);a=submitQueueAnswer(s,next,1);
  assert.equal(a.correct,false);assert.equal(a.earned,0);assert.equal(s.streak,0);
  next=generateQueueQuestion(s);a=submitQueueAnswer(s,next,'new');assert.equal(a.earned,101);assert.equal(s.streak,1);
  assert.equal(submitQueueAnswer(s,next,'new'),a);assert.equal(s.score,304);
});

test('input rerolls preserve exact timer overflow across decreasing intervals',()=>{
  const s=createQueueSession(rng(7));
  advanceQueueTime(s,19_999);updateQueueInput(s);assert.equal(s.inputChanges,0);
  advanceQueueTime(s,1);updateQueueInput(s);assert.equal(s.inputChanges,1);assert.equal(inputSecondsRemaining(s),19.5);
  advanceQueueTime(s,19_499);updateQueueInput(s);assert.equal(s.inputChanges,1);
  advanceQueueTime(s,2);updateQueueInput(s);assert.equal(s.inputChanges,2);assert.equal(inputSecondsRemaining(s),18.999);
});
test('large input values still generate variable-dependent candidates instead of only cancellation',()=>{
  for(const value of [-9,9]){
    const s=createQueueSession(rng(1));s.mappings=[inputMapping(value,0,0)];const random=rng(374);let variableCount=0;
    for(let i=0;i<400;i++){
      const c=createCandidate(s,random);if([...c.polynomial.keys()].some(key=>key!=='0,0,0'))variableCount++;
      assert.ok(withinDifficultyLimits(c.expr,c.polynomial,s.settings));
    }
    assert.ok(variableCount>300,`${value}: ${variableCount}/400 variable candidates`);
  }
});

test('input replacement changes only the observed match, keeps archived expressions separate, and rejects stale questions',()=>{
  const {s,q}=active(binary('*',x,x),2);
  const square={id:s.nextId++,expr:q.expr,polynomial:q.polynomial};s.records.push(square);
  const before=[...s.records],slots=[...s.recordSlots];advanceQueueTime(s,20_000);
  const updated=generateQueueQuestion(s,()=>.6); // samples x=1 from the full −5…5 domain
  assert.equal(s.mappings[0].x.toString(),'1');assert.equal(updated.matchId,1);
  assert.deepEqual(s.records,before);assert.equal(s.records[0],before[0]);assert.equal(s.records[1],square);
  assert.equal(s.recordSlots[0],slots[0]);assert.equal(q.mappings[0].x.toString(),'2');
  assert.throws(()=>submitQueueAnswer(s,q,1),/현재/);
  const answer=submitQueueAnswer(s,updated,square.id);assert.ok(answer.correct);assert.equal(answer.removed,square);
  assert.equal(s.records[0],before[0]);
});

test('one to three variables initialize distinct cards and unique IDs; every input coordinate stays bounded',()=>{
  for(const count of [1,2,3]){
    const random=rng(724+count),s=createQueueSession(random,count);
    assert.deepEqual(s.settings.variables,['x','y','z'].slice(0,count));assert.equal(s.records.length,count);
    assert.equal(new Set([...s.records,...s.queue].map(e=>e.id)).size,count+1);
    for(let i=0;i<45;i++){
      const previous=s.mappings[0];advanceQueueTime(s,inputSecondsRemaining(s)*1000);updateQueueInput(s,random);
      assert.equal(s.mappings.length,1);
      for(const name of s.settings.variables)assert.ok(s.mappings[0][name].n>=-5n&&s.mappings[0][name].n<=5n);
      const c=createCandidate(s,random);assert.ok(withinDifficultyLimits(c.expr,c.polynomial,s.settings));
    }
  }
  for(const count of [0,4,1.5,NaN])assert.throws(()=>createQueueSession(rng(3),count));
});
test('multivariable matching uses the whole current tuple after replacement',()=>{
  const s=createQueueSession(rng(4),3),y=variable('y'),z=variable('z');
  s.mappings=[inputMapping(2,3,5)];s.queue=[candidate(s,binary('-',z,y))];
  let q=generateQueueQuestion(s);assert.equal(q.matchId,1);submitQueueAnswer(s,q,'new');
  advanceQueueTime(s,20_000);q=generateQueueQuestion(s,()=>0);assert.equal(q.outputs[0].toString(),'0');assert.equal(q.matchId,null);
});

test('a scheduled reroll can change all coordinates together or repeat the entire tuple',()=>{
  const s=createQueueSession(rng(3),3);s.mappings=[inputMapping(5,5,5)];
  advanceQueueTime(s,20_000);updateQueueInput(s,()=>0);
  assert.deepEqual(s.settings.variables.map(name=>s.mappings[0][name].toString()),['-5','-5','-5']);
  advanceQueueTime(s,20_000);updateQueueInput(s,()=>0);
  assert.deepEqual(s.settings.variables.map(name=>s.mappings[0][name].toString()),['-5','-5','-5']);
  assert.equal(s.inputChanges,2);assert.equal(inputSecondsRemaining(s),18.5);
});

test('queue expressions allow degree four and 3/4/5 operators for 1/2/3 variables',()=>{
  const square=binary('*',x,x),quartic=binary('*',square,square),fourOps=binary('+',quartic,x),fiveOps=binary('+',fourOps,x),sixOps=binary('+',fiveOps,x);
  for(const count of [1,2,3]){
    const s=createQueueSession(rng(3),count);assert.equal(s.settings.maxDegree,4);assert.equal(s.settings.maxNodes,5+count*2);
    assert.ok(withinDifficultyLimits(quartic,normalize(quartic),s.settings));
    assert.equal(withinDifficultyLimits(fourOps,normalize(fourOps),s.settings),count>=2);
    assert.equal(withinDifficultyLimits(fiveOps,normalize(fiveOps),s.settings),count===3);
    assert.equal(withinDifficultyLimits(sixOps,normalize(sixOps),s.settings),false);
    const fifth=binary('*',quartic,x);assert.equal(withinDifficultyLimits(fifth,normalize(fifth),s.settings),false);
  }
});
test('the generator can actually produce a quartic from two archived squares',()=>{
  const random=rng(9184),s=createQueueSession(random),expr=binary('*',x,x);
  s.mappings=[inputMapping(2,0,0)];s.records.push({id:s.nextId++,expr,polynomial:normalize(expr)});
  let found=false;for(let i=0;i<500;i++){const q=createCandidate(s,random);if([...q.polynomial.keys()].some(key=>key==='4,0,0')){found=true;break;}}
  assert.ok(found);
});
