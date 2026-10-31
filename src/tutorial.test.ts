import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tutorialLesson,changeTutorialInput,TUTORIAL_STEPS} from './tutorial.ts';
import {submitQueueAnswer,enqueueCandidate,isQueueOver} from './queue-game.ts';
test('guided examples use real add, removal and return rules with no per-answer arrival',()=>{
  for(let i=0;i<4;i++){
    const lesson=tutorialLesson(i);if(i===3)changeTutorialInput(lesson);
    const{s,q,expected}=lesson,before=s.records.length,a=submitQueueAnswer(s,q,expected);
    assert.equal(a.correct,i!==2);assert.equal(s.records.length,before+(i===0||i===3?1:i===1?-1:0));
    assert.equal(s.queue.length,i===2?1:0);assert.equal(a.removed!==null,i===1);assert.equal(s.mappings.length,1);
  }
});
test('input practice replaces x=1 with x=2, reclassifies the same expression and keeps the archive intact',()=>{
  const lesson=tutorialLesson(3),before=lesson.q,record=lesson.s.records[0];
  assert.equal(before.matchId,1);assert.equal(before.outputs[0].toString(),'1');changeTutorialInput(lesson);
  assert.equal(lesson.q.candidateId,before.candidateId);assert.equal(lesson.q.matchId,null);assert.equal(lesson.q.outputs[0].toString(),'4');
  assert.equal(lesson.s.mappings.length,1);assert.equal(lesson.s.mappings[0].x.toString(),'2');assert.equal(lesson.s.records[0],record);
  changeTutorialInput(lesson);assert.equal(lesson.s.inputChanges,1);
});
test('arrival practice starts empty and the final lesson has one remaining space',()=>{
  assert.equal(TUTORIAL_STEPS,6);const arrival=tutorialLesson(4);assert.equal(arrival.s.queue.length,0);
  for(let i=0;i<3;i++)assert.ok(enqueueCandidate(arrival.s,()=>.75));
  assert.equal(arrival.s.queue.length,3);assert.equal(isQueueOver(arrival.s),false);
  const{s}=tutorialLesson(5);assert.equal(s.queue.length,4);assert.equal(isQueueOver(s),false);
  enqueueCandidate(s,()=>.75);assert.equal(isQueueOver(s),true);assert.equal(s.answers.length,0);
  assert.throws(()=>tutorialLesson(6));
});
