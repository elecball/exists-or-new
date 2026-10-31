import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {QueueMotion,type QueueSnapshot} from './queue-motion.ts';
function fixture(reduced=false){
  const w=new Window(),animations:{state:string;duration:number;frames:Keyframe[];finish:()=>void;finished:Promise<void>;pause:()=>void;play:()=>void;cancel:()=>void}[]=[];
  const globals=['window','document','getComputedStyle'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const);
  Object.defineProperty(globalThis,'window',{configurable:true,value:{scrollX:0,scrollY:0,matchMedia:()=>({matches:reduced})}});
  Object.defineProperty(globalThis,'document',{configurable:true,value:w.document});
  Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:()=>({font:'20px Georgia',color:'#203d30',border:'1px solid #aaa',borderRadius:'5px'})});
  w.HTMLElement.prototype.animate=((frames:Keyframe[],options:KeyframeAnimationOptions)=>{
    let resolve!:()=>void,reject!:(reason:Error)=>void;
    const animation={state:'running',duration:Number(options.duration),frames,finished:new Promise<void>((r,j)=>{resolve=r;reject=j;}),
      finish(){this.state='finished';resolve();},pause(){this.state='paused';},play(){this.state='running';},cancel(){this.state='cancelled';reject(Error('cancelled'));}};
    animations.push(animation);return animation;
  }) as unknown as typeof w.HTMLElement.prototype.animate;
  const target=w.document.createElement('div');target.innerHTML='<math class="formula"><mi>x</mi></math>';w.document.body.append(target);
  Object.defineProperty(target,'getBoundingClientRect',{value:()=>new w.DOMRect(200,300,160,80)});
  Object.defineProperty(target.querySelector('math')!,'getBoundingClientRect',{value:()=>new w.DOMRect(250,320,60,35)});
  const from:QueueSnapshot={html:'<math class="formula"><mi>x</mi></math>',left:10,top:20,width:60,height:40,textWidth:20,font:'20px Georgia',color:'#203d30',border:'1px solid #aaa',borderRadius:'5px'};
  return{w,from,target:target as unknown as HTMLElement,animations,restore:async()=>{
    for(const[key,descriptor]of globals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete(globalThis as unknown as Record<string,unknown>)[key];
    await w.close();
  }};
}
test('queue draw reaches the candidate before revealing it and completing, and can pause mid-flight',async()=>{
  const f=fixture(),motion=new QueueMotion();let done=0;
  try{
    const run=motion.fly(f.from,f.target,'draw',()=>done++);
    assert.ok(f.target.classList.contains('queue-hidden'));assert.equal(f.w.document.querySelectorAll('.queue-flight').length,1);assert.equal(done,0);
    assert.equal(f.animations[0].duration,350);assert.match(String(f.animations[0].frames.at(-1)!.transform),/translate.*scale\(3\)/);
    motion.pause();assert.equal(f.animations[0].state,'paused');motion.resume();assert.equal(f.animations[0].state,'running');
    f.animations[0].finish();await run;assert.equal(done,1);assert.equal(f.target.classList.contains('queue-hidden'),false);assert.equal(f.w.document.querySelector('.queue-flight'),null);
  }finally{motion.cancel();await f.restore();}
});
test('cancelling a queue flight removes its ghost, reveals the slot and prevents stale completion',async()=>{
  const f=fixture(),motion=new QueueMotion();let done=0;
  try{
    const run=motion.fly(f.from,f.target,'arrival',()=>done++);motion.cancel();await run;
    assert.equal(done,0);assert.equal(f.target.classList.contains('queue-hidden'),false);assert.equal(f.w.document.querySelector('.queue-flight'),null);
    const next=motion.fly(f.from,f.target,'draw',()=>done++);f.animations[1].finish();await next;assert.equal(done,1);
  }finally{motion.cancel();await f.restore();}
});
test('reduced-motion queue movement uses opacity and a short duration',async()=>{
  const f=fixture(true),motion=new QueueMotion();
  try{
    const run=motion.fly(f.from,f.target,'arrival',()=>{});assert.equal(f.animations[0].duration,80);
    assert.ok(f.animations[0].frames.every(frame=>frame.transform==='none'));f.animations[0].finish();await run;
  }finally{motion.cancel();await f.restore();}
});
test('unavailable animation APIs still reveal a usable candidate and complete once',async()=>{
  const f=fixture(),motion=new QueueMotion();let done=0;
  try{
    f.w.HTMLElement.prototype.animate=(()=>{throw Error('unavailable');}) as unknown as typeof f.w.HTMLElement.prototype.animate;
    await motion.fly(f.from,f.target,'draw',()=>done++);assert.equal(done,1);assert.equal(f.target.classList.contains('queue-hidden'),false);
    assert.equal(f.w.document.querySelector('.queue-flight'),null);
  }finally{motion.cancel();await f.restore();}
});
