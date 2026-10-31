import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {mountTutorial} from './tutorial.ts';
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function fixture(progress?:number[]){
  const w=new Window(),animations:FakeAnimation[]=[];
  class FakeAnimation{
    state='running';private resolve!:()=>void;private reject!:(reason:Error)=>void;
    finished=new Promise<void>((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    pause(){this.state='paused';}play(){this.state='running';}
    finish(){this.state='finished';this.resolve();}cancel(){this.state='cancelled';this.reject(Error('cancelled'));}
  }
  w.HTMLElement.prototype.animate=(()=>{const animation=new FakeAnimation();animations.push(animation);return animation;}) as unknown as typeof w.HTMLElement.prototype.animate;
  const saved=['window','document','getComputedStyle'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)] as const);
  Object.defineProperty(globalThis,'window',{configurable:true,value:w});Object.defineProperty(globalThis,'document',{configurable:true,value:w.document});Object.defineProperty(globalThis,'getComputedStyle',{configurable:true,value:w.getComputedStyle.bind(w)});
  w.document.body.innerHTML='<div id="host"></div>';const host=w.document.querySelector('#host')! as unknown as HTMLElement;
  if(progress)w.localStorage.setItem('exists-tutorial-progress-v1',JSON.stringify(progress));
  const controls=mountTutorial(host,()=>{},()=>{});
  const click=(selector:string)=>(host.querySelector(selector) as HTMLButtonElement).click();
  click('#tutorial-next');
  const finish=async()=>{for(let i=0;i<8;i++){for(const animation of animations)if(animation.state==='running')animation.finish();await flush();}};
  return{w,host,controls,animations,click,finish,async restore(){controls.cancel();await flush();for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name);await w.close();}};
}
test('tutorial draws and stores with real motion classes, locking progression until arrival and supporting pause',async()=>{
  const f=fixture();try{
    assert.ok(f.w.document.querySelector('.queue-flight'));assert.equal((f.host.querySelector('#novel') as HTMLButtonElement).disabled,true);
    await f.finish();f.click('#novel');assert.ok(f.w.document.querySelector('.expression-flight'));assert.ok(f.host.querySelector('.arrival-target'));
    assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,true);
    f.controls.pause();assert.ok(f.animations.filter(a=>a.state==='paused').length>=2);f.controls.resume();await f.finish();
    assert.equal(f.w.document.querySelector('.expression-flight'),null);assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,false);
    assert.equal(f.host.querySelectorAll('[data-tutorial-record]').length,2);
  }finally{await f.restore();}
});
test('tutorial pair clearing keeps the selected card until absorption completes, then leaves its slot empty',async()=>{
  const f=fixture();try{
    await f.finish();f.click('#novel');await f.finish();f.click('#tutorial-next');await f.finish();
    f.click('[data-tutorial-record="1"]');assert.ok(f.w.document.querySelector('.absorption-flight'));assert.ok(f.host.querySelector('#clearing-record'));
    await f.finish();assert.equal(f.host.querySelector('#record-1'),null);assert.ok(f.host.querySelector('[data-slot="0"].empty-record'));
    assert.equal(f.host.querySelectorAll('[data-tutorial-record]').length,1);
  }finally{await f.restore();}
});
test('leaving tutorial during movement removes ghosts and prevents stale progression',async()=>{
  const f=fixture();try{
    await f.finish();f.click('#novel');assert.ok(f.w.document.querySelector('.expression-flight'));
    f.controls.cancel();await f.finish();assert.equal(f.w.document.querySelector('.expression-flight,.queue-flight'),null);
    assert.equal(f.w.localStorage.getItem('exists-tutorial-progress-v1'),null);
    assert.equal(f.w.document.body.classList.contains('tutorial-playing'),false);assert.equal(f.host.querySelector('.tutorial-board')!.getAttribute('aria-busy'),'true');
  }finally{await f.restore();}
});
test('cancelling a paused input timer never changes the practice input',async()=>{
  const f=fixture();try{
    for(const selector of ['#novel','[data-tutorial-record="1"]','[data-tutorial-record="1"]']){await f.finish();f.click(selector);await f.finish();f.click('#tutorial-next');}
    // Finish only the initial draw; its completion starts the automatic input timer.
    for(const animation of f.animations)if(animation.state==='running')animation.finish();await flush();
    assert.equal(f.host.querySelector('#tutorial-change'),null);assert.ok(f.host.querySelector('.input-table-wrap.tutorial-target'));f.controls.pause();assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
    assert.ok(f.animations.some(a=>a.state==='paused'));f.controls.cancel();await f.finish();assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
  }finally{await f.restore();}
});

test('input replacement runs automatically after the draw and waits for expiry before changing x',async()=>{
  const f=fixture();try{
    for(const selector of ['#novel','[data-tutorial-record="1"]','[data-tutorial-record="1"]']){await f.finish();f.click(selector);await f.finish();f.click('#tutorial-next');}
    const id=f.host.querySelector('#question-title')!.getAttribute('data-candidate-id');
    for(const animation of f.animations)if(animation.state==='running')animation.finish();await flush();
    assert.equal(f.host.querySelector('#tutorial-change'),null);assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
    assert.equal((f.host.querySelector('#novel') as HTMLButtonElement).disabled,true);
    const timer=f.animations.at(-1)!;assert.equal(timer.state,'running');timer.finish();await flush();
    assert.equal(f.host.querySelector('.input-value')!.textContent,'2');assert.equal((f.host.querySelector('#novel') as HTMLButtonElement).disabled,true);
    const review=f.animations.at(-1)!;assert.notEqual(review,timer);review.finish();await flush();
    assert.equal(f.host.querySelector('.input-value')!.textContent,'2');assert.equal(f.host.querySelector('#question-title')!.getAttribute('data-candidate-id'),id);
    assert.equal((f.host.querySelector('#novel') as HTMLButtonElement).disabled,false);assert.match(f.host.querySelector('#input-time-bar')!.getAttribute('style')!,/scaleX\(1\)/);
  }finally{await f.restore();}
});

test('the mistake shakes once during the return flight, then keeps still when the explanation appears',async()=>{
  const f=fixture();try{
    for(const selector of ['#novel','[data-tutorial-record="1"]']){await f.finish();f.click(selector);await f.finish();f.click('#tutorial-next');}
    await f.finish();f.click('[data-tutorial-record="1"]');
    assert.ok(f.host.querySelector('.took-damage'));assert.ok(f.host.querySelector('.queue-hit'));assert.equal(f.host.querySelector('.feedback-still'),null);
    await f.finish();assert.equal(f.host.querySelector('.took-damage,.queue-hit'),null);assert.ok(f.host.querySelector('.feedback-still.incorrect'));
    assert.equal(f.host.querySelectorAll('.queue-return').length,1);
  }finally{await f.restore();}
});

test('a completed input step still drains the timer before changing the value when revisited',async()=>{
  const f=fixture([0,1,2,3]);try{
    await f.finish();f.click('#tutorial-next');await f.finish();f.click('#tutorial-next');await f.finish();
    f.click('#tutorial-next');assert.match(f.host.querySelector('.coach-step')!.textContent!,/4\/6/);
    assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
    for(const animation of f.animations)if(animation.state==='running')animation.finish();await flush();
    assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
    assert.ok(f.host.querySelector('.input-table-wrap.tutorial-target'));
    f.animations.at(-1)!.finish();await flush();assert.equal(f.host.querySelector('.input-value')!.textContent,'2');
    await f.finish();assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,false);
  }finally{await f.restore();}
});

test('completed input practice can skip its running timer without changing the next lesson',async()=>{
  const f=fixture([0,1,2,3]);try{
    await f.finish();f.click('#tutorial-next');await f.finish();f.click('#tutorial-next');await f.finish();f.click('#tutorial-next');
    for(const animation of f.animations)if(animation.state==='running')animation.finish();await flush();
    assert.equal(f.host.querySelector('.input-value')!.textContent,'1');
    assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,false);
    const timer=f.animations.at(-1)!;f.click('#tutorial-next');await flush();
    assert.equal(timer.state,'cancelled');assert.match(f.host.querySelector('.coach-step')!.textContent!,/5\/6/);
    timer.finish();await f.finish();assert.match(f.host.querySelector('.coach-step')!.textContent!,/5\/6/);
    assert.equal(f.host.querySelector('.input-value')!.textContent,'1');assert.equal(f.host.querySelectorAll('.danger-slot.occupied').length,3);
  }finally{await f.restore();}
});

test('three timed arrivals animate into the queue; the final lesson fills it before game over',async()=>{
  const f=fixture([0,1,2,3]);try{
    for(let i=0;i<4;i++){await f.finish();f.click('#tutorial-next');}
    assert.match(f.host.querySelector('.coach-step')!.textContent!,/5\/6/);
    assert.equal(f.host.querySelectorAll('.danger-slot.occupied').length,0);
    assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,true);
    const finishOne=async()=>{const a=f.animations.filter(a=>a.state==='running');for(const animation of a)animation.finish();await flush();};
    for(let count=1;count<=3;count++){
      await finishOne();assert.equal(f.host.querySelectorAll('.danger-slot.occupied').length,count);
      assert.ok(f.w.document.querySelector('.queue-flight-arrival'));await finishOne();
    }
    assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,false);
    f.click('#tutorial-next');assert.equal(f.host.querySelectorAll('.danger-slot.occupied').length,4);
    await finishOne();assert.equal(f.host.querySelectorAll('.danger-slot.occupied').length,5);
    assert.equal(f.host.querySelector('.tutorial-game-over'),null);await finishOne();
    assert.ok(f.host.querySelector('.is-ending'));assert.equal(f.host.querySelector('.tutorial-game-over'),null);
    f.controls.pause();assert.ok(f.animations.some(a=>a.state==='paused'));f.controls.resume();await finishOne();
    assert.ok(f.host.querySelector('.tutorial-game-over'));assert.equal((f.host.querySelector('#tutorial-next') as HTMLButtonElement).disabled,false);
  }finally{await f.restore();}
});
