export interface QueueSnapshot {
  html:string; left:number; top:number; width:number; height:number; textWidth:number;
  font:string; color:string; border:string; borderRadius:string;
}
export function captureQueueCard(element:HTMLElement):QueueSnapshot {
  const rect=element.getBoundingClientRect(),part=element.querySelector<HTMLElement>('.record-expression')??element;
  const text=part.querySelector('.formula')?.getBoundingClientRect(),style=getComputedStyle(part),frame=getComputedStyle(element);
  return {html:part.innerHTML,left:rect.left+window.scrollX,top:rect.top+window.scrollY,width:rect.width,height:rect.height,textWidth:text?.width??rect.width,
    font:style.font,color:style.color,border:frame.border,borderRadius:frame.borderRadius};
}
/** A queue card travels to its actual destination. Pausing and cancellation always reveal it safely. */
export class QueueMotion {
  private generation=0;
  private animation:Animation|null=null;
  private ghost:HTMLElement|null=null;
  private target:HTMLElement|null=null;
  pause(){this.animation?.pause();}
  resume(){this.animation?.play();}
  cancel(){
    this.generation++;this.animation?.cancel();this.animation=null;
    this.ghost?.remove();this.ghost=null;this.target?.classList.remove('queue-hidden');this.target=null;
  }
  async fly(from:QueueSnapshot,target:HTMLElement,kind:'draw'|'arrival',done:()=>void){
    this.cancel();const generation=this.generation;this.target=target;
    target.classList.add('queue-hidden');
    try{
      const destination=target.getBoundingClientRect(),text=target.querySelector('.formula')?.getBoundingClientRect()??destination;
      const toX=text.left+window.scrollX+text.width/2,toY=text.top+window.scrollY+text.height/2;
      const scale=kind==='draw'&&from.textWidth>0?text.width/from.textWidth:1;
      const dx=toX-from.left-from.width/2,dy=toY-from.top-from.height/2;
      const ghost=document.createElement('div');this.ghost=ghost;
      ghost.className=`queue-flight math queue-flight-${kind}`;ghost.innerHTML=from.html;ghost.inert=true;ghost.setAttribute('aria-hidden','true');
      Object.assign(ghost.style,{position:'absolute',left:`${from.left}px`,top:`${from.top}px`,width:`${from.width}px`,height:`${from.height}px`,font:from.font,color:from.color,
        border:from.border||'1px solid #bdc9ae',borderRadius:from.borderRadius||'5px',transformOrigin:'center',pointerEvents:'none',zIndex:'16'});
      document.body.append(ghost);
      const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const end=reduced?'none':`translate(${dx}px, ${dy}px) scale(${Math.max(.05,scale)})`;
      const animation=ghost.animate([
        {opacity:0,transform:'none',offset:0},
        {opacity:1,transform:'none',offset:.15},
        {opacity:1,transform:end,borderColor:kind==='draw'?'transparent':from.color,offset:1},
      ],{duration:reduced?80:kind==='draw'?350:300,fill:'forwards',easing:'cubic-bezier(.22,.75,.25,1)'});
      this.animation=animation;
      try{await animation.finished;}catch{if(generation!==this.generation)return;}
      if(generation!==this.generation)return;
      target.classList.remove('queue-hidden');ghost.remove();animation.cancel();
      this.animation=null;this.ghost=null;this.target=null;done();
    }catch{
      if(generation===this.generation){this.cancel();done();}
    }
  }
}
