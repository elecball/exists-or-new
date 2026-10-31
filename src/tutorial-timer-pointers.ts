let serial=0;
/** Two short arrows identify the real timer bars without moving the game board. */
export class TutorialTimerPointers{
  private readonly svg:SVGSVGElement;
  private visible=false;
  private readonly host:HTMLElement;
  private readonly marker=`tutorial-timer-arrow-${serial++}`;
  constructor(host:HTMLElement){
    this.host=host;
    this.svg=document.createElementNS('http://www.w3.org/2000/svg','svg');this.svg.classList.add('tutorial-timer-pointers');this.svg.setAttribute('aria-hidden','true');
    window.addEventListener('resize',this.update);document.addEventListener('scroll',this.update,true);window.visualViewport?.addEventListener('resize',this.update);
    void document.fonts?.ready.then(this.update);
  }
  show(visible:boolean){this.visible=visible;if(visible){document.body.append(this.svg);this.update();}else this.svg.remove();}
  private update=()=>{
    if(!this.visible)return;
    const input=this.host.querySelector('.input-timer')?.getBoundingClientRect(),queue=this.host.querySelector('.queue-timer')?.getBoundingClientRect();if(!input||!queue)return;
    const width=window.innerWidth,height=window.innerHeight;
    this.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const tip1={x:input.left+input.width*.72,y:input.top+input.height/2},x1=tip1.x+18,y1=tip1.y-18;
    const tip2={x:queue.left+queue.width/2,y:queue.top+queue.height*.3},offset2=Math.min(20,width-9-tip2.x),x2=tip2.x+offset2,y2=tip2.y-offset2;
    const badge=(x:number,y:number,label:number)=>`<circle cx="${x}" cy="${y}" r="8"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${label}</text>`;
    this.svg.innerHTML=`<defs><marker id="${this.marker}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" viewBox="0 0 6 6"><path d="M0 0L6 3L0 6" fill="none"/></marker></defs><g data-timer="input"><path d="M${x1-6} ${y1+6}L${tip1.x} ${tip1.y}" marker-end="url(#${this.marker})"/>${badge(x1,y1,1)}</g><g data-timer="queue"><path d="M${x2-6} ${y2+6}L${tip2.x} ${tip2.y}" marker-end="url(#${this.marker})"/>${badge(x2,y2,2)}</g>`;
  };
  cancel(){this.visible=false;this.svg.remove();window.removeEventListener('resize',this.update);document.removeEventListener('scroll',this.update,true);window.visualViewport?.removeEventListener('resize',this.update);}
}
