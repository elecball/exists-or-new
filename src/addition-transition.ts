export interface ArrivalTarget {
  parts: HTMLElement[];
  reveal: HTMLElement[];
  frame?: HTMLElement;
}
export const ARRIVAL_HOLD_OFFSET = 0.67;
export const ARRIVAL_DURATION_MS = 2700;
/** Fade the previous puzzle, then move each new item from the stage into its real slot. */
export class AdditionTransition {
  private generation = 0;
  private animations = new Set<Animation>();
  private ghosts = new Set<HTMLElement>();
  private paused = false;
  private running = false;
  private cleanup: (() => void) | null = null;
  pause() { this.paused = true; this.animations.forEach(animation => animation.pause()); }
  resume() { this.paused = false; this.animations.forEach(animation => animation.play()); }
  cancel() {
    this.generation++; this.running = false;
    this.animations.forEach(animation => animation.cancel()); this.animations.clear();
    this.ghosts.forEach(ghost => ghost.remove()); this.ghosts.clear();
    this.cleanup?.(); this.cleanup = null;
  }
  private async animate(element: HTMLElement, keyframes: Keyframe[], duration: number) {
    const animation = element.animate(keyframes, { duration, fill: 'forwards', easing: 'cubic-bezier(.22,.75,.25,1)' });
    this.animations.add(animation);
    if (this.paused) animation.pause();
    try { await animation.finished; } catch { /* Cancellation is expected on replay/navigation. */ }
    this.animations.delete(animation);
    return animation;
  }
  private addFrame(ghost: HTMLElement, frame: HTMLElement) {
    const style = getComputedStyle(frame);
    ghost.classList.add('framed-flight');
    ghost.style.border = style.border || '1px solid #aebf9b';
    ghost.style.borderRadius = style.borderRadius || '7px';
    ghost.style.boxSizing = 'border-box';
  }
  /** A discarded candidate converges on its existing representative without adding a card. */
  async absorb(source: HTMLElement, representative: HTMLElement, done: () => void, onArrive = () => {}) {
    this.cancel(); this.paused = false; this.running = true;
    const generation = this.generation;
    const valid = () => generation === this.generation && this.running;
    try {
      const from = source.getBoundingClientRect(), to = representative.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.classList.add('expression-flight', 'absorption-flight', 'math');
      ghost.innerHTML = source.innerHTML;
      ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      Object.assign(ghost.style, {
        position:'absolute', left:`${from.left + window.scrollX}px`, top:`${from.top + window.scrollY}px`,
        width:`${from.width}px`, height:`${from.height}px`, font:getComputedStyle(source).font,
        margin:'0', padding:'0', background:'transparent', border:'0', boxShadow:'none',
        transformOrigin:'center', pointerEvents:'none', zIndex:'15',
      });
      document.body.append(ghost); this.ghosts.add(ghost);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const dx = to.left + to.width / 2 - from.left - from.width / 2;
      const dy = to.top + to.height / 2 - from.top - from.height / 2;
      await Promise.all([
        this.animate(source, [{opacity:1}, {opacity:0}], reduced ? 60 : 160),
        this.animate(ghost, [
          {opacity:1, transform:'none', offset:0},
          {opacity:.8, transform:reduced ? 'none' : `translate(${dx}px, ${dy}px) scale(.35)`, offset:.8},
          {opacity:0, transform:reduced ? 'none' : `translate(${dx}px, ${dy}px) scale(.08)`, offset:1},
        ], reduced ? 120 : 850),
      ]);
      if (!valid()) return;
      source.style.opacity = '0'; ghost.remove(); this.ghosts.delete(ghost);
      onArrive();
      await this.animate(representative, reduced
        ? [{opacity:1}, {opacity:.65}, {opacity:1}]
        : [{transform:'scale(1)'}, {transform:'scale(1.07)'}, {transform:'scale(1)'}], reduced ? 120 : 300);
      if (!valid()) return;
      this.running = false; done();
    } catch {
      if (valid()) { this.cancel(); onArrive(); done(); }
    }
  }
  async store(source: HTMLElement, target: ArrivalTarget, done: () => void) {
    this.cancel(); this.paused = false; this.running = true;
    const generation = this.generation;
    const valid = () => generation === this.generation && this.running;
    const part = target.parts[0];
    this.cleanup = () => target.reveal.forEach(element => element.classList.remove('arrival-target'));
    try {
      const from = source.getBoundingClientRect(), to = (target.frame ?? part).getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.classList.add('expression-flight', 'math'); ghost.innerHTML = part.innerHTML;
      ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
      Object.assign(ghost.style, {
        position: 'absolute', left: `${to.left + window.scrollX}px`, top: `${to.top + window.scrollY}px`,
        font: getComputedStyle(part).font, width: `${to.width}px`, height: `${to.height}px`,
        background: 'transparent', border: '0', padding: '0', margin: '0', boxShadow: 'none',
        transformOrigin: 'center', zIndex: '15', pointerEvents: 'none',
      });
      if (target.frame) this.addFrame(ghost, target.frame);
      document.body.append(ghost); this.ghosts.add(ghost);
      const scale = Math.min(1.8, from.width / Math.max(1, to.width));
      const start = `translate(${from.left + from.width / 2 - to.left - to.width / 2}px, ${from.top + from.height / 2 - to.top - to.height / 2}px) scale(${scale})`;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      await Promise.all([
        this.animate(source, [{opacity:1},{opacity:0}], reduced ? 60 : 160),
        this.animate(ghost, [
          {opacity:0, transform: reduced ? 'none' : start, offset:0},
          {opacity:1, transform: reduced ? 'none' : start, offset:.15},
          {opacity:1, transform:'translate(0, 0) scale(1)', offset:1},
        ], reduced ? 120 : 750),
      ]);
      if (!valid()) return;
      source.style.opacity = '0';
      this.cleanup?.(); this.cleanup = null;
      ghost.remove(); this.ghosts.delete(ghost); this.running = false; done();
    } catch {
      if (valid()) { this.cancel(); done(); }
    }
  }
  async run(host: HTMLElement, outgoing: HTMLElement | null, puzzle: HTMLElement, targets: ArrivalTarget[], done: () => void) {
    this.cancel(); this.paused = false; this.running = true;
    const generation = this.generation;
    const valid = () => generation === this.generation && this.running;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.cleanup = () => {
      outgoing?.remove(); targets.forEach(target => target.reveal.forEach(element => element.classList.remove('arrival-target')));
      puzzle.classList.remove('preparing');
    };
    try {
      if (outgoing) {
        const fade = await this.animate(outgoing, [{ opacity: 1 }, { opacity: 0 }], reduced ? 60 : 220);
        if (!valid()) return;
        outgoing.remove(); fade.cancel();
      }
      if (!valid()) return;
      const stage = host.getBoundingClientRect();
      const slots = targets.map(target => {
        const rects = target.parts.map(part => part.getBoundingClientRect());
        const left = Math.min(...rects.map(rect => rect.left));
        const top = Math.min(...rects.map(rect => rect.top));
        const right = Math.max(...rects.map(rect => rect.left + rect.width));
        const bottom = Math.max(...rects.map(rect => rect.top + rect.height));
        const box = target.frame?.getBoundingClientRect();
        return {left: box?.left ?? left, top: box?.top ?? top, width: box?.width ?? right - left, height: box?.height ?? bottom - top, rects};
      });
      const totalHeight = slots.reduce((sum, slot) => sum + slot.height * 1.8, 0) + Math.max(0, slots.length - 1) * 32;
      await Promise.all(targets.map(async (target, index) => {
        const slot = slots[index];
        const ghost = document.createElement('div');
        ghost.classList.add('arrival-fly', 'math');
        target.parts.forEach((part, partIndex) => {
          const glyph = document.createElement('span');
          const rect = slot.rects[partIndex];
          glyph.innerHTML = part.innerHTML;
          glyph.classList.add('arrival-glyph');
          Object.assign(glyph.style, {
            position: 'absolute', left: `${rect.left - slot.left}px`, top: `${rect.top - slot.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`, font: getComputedStyle(part).font,
          });
          ghost.append(glyph);
        });
        ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
        Object.assign(ghost.style, {
          position: 'absolute', left: `${slot.left + window.scrollX}px`, top: `${slot.top + window.scrollY}px`,
          width: `${slot.width}px`, height: `${slot.height}px`, margin: '0', padding: '0', background: 'transparent', border: '0', boxShadow: 'none',
          visibility: 'visible', opacity: '0', pointerEvents: 'none', zIndex: '15', transformOrigin: 'center',
        });
        if (target.frame) this.addFrame(ghost, target.frame);
        document.body.append(ghost); this.ghosts.add(ghost);
        const dx = stage.left + stage.width / 2 - (slot.left + slot.width / 2);
        const above = slots.slice(0, index).reduce((sum, other) => sum + other.height * 1.8 + 32, 0);
        const dy = stage.top + stage.height / 2 - totalHeight / 2 + above + slot.height * 1.8 / 2 - (slot.top + slot.height / 2);
        const center = reduced ? 'none' : `translate(${dx}px, ${dy}px) scale(1.8)`;
        const flight = await this.animate(ghost, [
          { opacity: 0, transform: center, offset: 0 },
          { opacity: 1, transform: center, offset: .1 },
          { opacity: 1, transform: center, offset: ARRIVAL_HOLD_OFFSET },
          { opacity: 1, transform: 'translate(0, 0) scale(1)', offset: 1 },
        ], reduced ? 100 : ARRIVAL_DURATION_MS + index * 90);
        if (!valid()) return;
        target.reveal.forEach(element => element.classList.remove('arrival-target'));
        ghost.remove(); this.ghosts.delete(ghost); flight.cancel();
      }));
      if (!valid()) return;
      puzzle.classList.remove('preparing');
      const reveal = await this.animate(puzzle, [{ opacity: 0 }, { opacity: 1 }], reduced ? 60 : 240);
      if (!valid()) return;
      reveal.cancel(); this.cleanup?.(); this.cleanup = null; this.running = false;
      done();
    } catch {
      // An unavailable animation API still reveals a usable question without starting early.
      if (valid()) {
        this.cancel(); done();
      }
    }
  }
}
