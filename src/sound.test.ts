import {test} from 'node:test';
import assert from 'node:assert/strict';
let serial=0;
async function fixture(initial:'running'|'suspended'='running'){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
  const instances:FakeAudio[]=[];const notes:number[]=[],peaks:number[]=[];
  let resume:()=>void=()=>{};
  class FakeAudio{
    state:string=initial;currentTime=1;destination={};resumes=0;
    constructor(){instances.push(this);}
    resume(){this.resumes++;return new Promise<void>(resolve=>{resume=()=>{this.state='running';resolve();};});}
    createOscillator(){const oscillator={type:'',frequency:{value:0},connect(){},disconnect(){},start(){notes.push(oscillator.frequency.value);},stop(){},onended:null};return oscillator;}
    createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(value:number){peaks.push(value);},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:FakeAudio});
  const sound=await import(`./sound.ts?test=${serial++}`) as typeof import('./sound.ts');
  return{sound,instances,notes,peaks,resume:()=>resume(),restore(){if(previous)Object.defineProperty(globalThis,'AudioContext',previous);else Reflect.deleteProperty(globalThis,'AudioContext');}};
}
test('feedback waits for a suspended device to resume instead of silently dropping the sound',async()=>{
  const f=await fixture('suspended');try{
    const first=f.sound.playFeedback(true,false);assert.equal(f.instances[0].resumes,1);assert.deepEqual(f.notes,[]);
    f.resume();await first;assert.deepEqual(f.notes,[660,880]);assert.deepEqual(f.peaks,[.25,.25]);
  }finally{f.restore();}
});
test('muting while the device resumes suppresses the pending feedback',async()=>{
  const f=await fixture('suspended');try{
    const pending=f.sound.playFeedback(false,false);f.sound.toggleSound();f.resume();await pending;
    assert.deepEqual(f.notes,[]);assert.equal(f.sound.soundEnabled(),false);
  }finally{f.restore();}
});
test('feedback uses separate correct, wrong and game-over cues and can recover a closed device',async()=>{
  const f=await fixture();try{
    await f.sound.playFeedback(false,false);await f.sound.playFeedback(false,true);assert.deepEqual(f.notes,[196,147,220,165]);
    f.instances[0].state='closed';await f.sound.playFeedback(true,false);assert.equal(f.instances.length,2);
    assert.deepEqual(f.notes.slice(-2),[660,880]);f.sound.toggleSound();await f.sound.playFeedback(true,false);assert.equal(f.notes.length,6);
  }finally{f.restore();}
});
test('an unavailable audio API never rejects a feedback call',async()=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'AudioContext');
  try{
    Object.defineProperty(globalThis,'AudioContext',{configurable:true,value:class{constructor(){throw Error('No device');}}});
    const sound=await import(`./sound.ts?test=${serial++}`);assert.equal(await sound.unlockSound(),false);await assert.doesNotReject(sound.playFeedback(true,false));
  }finally{if(previous)Object.defineProperty(globalThis,'AudioContext',previous);else Reflect.deleteProperty(globalThis,'AudioContext');}
});
