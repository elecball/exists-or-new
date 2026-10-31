let context:AudioContext|null=null;
let resuming:Promise<boolean>|null=null;
let enabled=true;
export function soundEnabled(){return enabled;}
/** Create/resume inside the user's gesture, then wait until the device is ready. */
export function unlockSound():Promise<boolean>{
  if(!enabled)return Promise.resolve(false);
  try{
    if(!context||context.state==='closed'){context=new AudioContext();resuming=null;}
    if(context.state==='running')return Promise.resolve(true);
    if(!resuming){
      const active=context;
      resuming=active.resume().then(()=>context===active&&active.state==='running',()=>false).finally(()=>{resuming=null;});
    }
    return resuming;
  }catch{return Promise.resolve(false);}
}
export function toggleSound(){
  enabled=!enabled;
  if(enabled)void unlockSound();
}
export async function playFeedback(correct:boolean,timeout:boolean){
  if(!enabled)return;
  const ready=unlockSound(),active=context;
  if(!await ready||!enabled||!active||context!==active)return;
  try{
    const now=active.currentTime,notes=correct?[660,880]:timeout?[220,165]:[196,147];
    notes.forEach((frequency,index)=>{
      const oscillator=active.createOscillator(),gain=active.createGain(),start=now+index*.085;
      oscillator.type=correct?'sine':'triangle';oscillator.frequency.value=frequency;
      gain.gain.setValueAtTime(0,start);
      gain.gain.linearRampToValueAtTime(.25,start+.008);
      gain.gain.exponentialRampToValueAtTime(.001,start+.16);
      oscillator.connect(gain);gain.connect(active.destination);
      oscillator.start(start);oscillator.stop(start+.17);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  }catch{/* An unavailable audio device must not interrupt the game. */}
}
