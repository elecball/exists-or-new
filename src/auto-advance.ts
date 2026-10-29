export interface DelayClock {
  now(): number;
  schedule(callback: () => void, milliseconds: number): () => void;
}
const browserClock: DelayClock = {
  now: () => performance.now(),
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};
/** A single transition that preserves its remaining delay while the tab/modal is paused. */
export class AutoAdvance {
  private remaining: number | null = null;
  private started = 0;
  private cancelTimer: (() => void) | null = null;
  private readonly callback: () => void;
  private readonly clock: DelayClock;
  constructor(callback: () => void, clock: DelayClock = browserClock) {
    this.callback = callback; this.clock = clock;
  }
  start(milliseconds = 2000) {
    this.cancel(); this.remaining = milliseconds; this.resume();
  }
  pause() {
    if (!this.cancelTimer || this.remaining === null) return;
    this.remaining = Math.max(0, this.remaining - (this.clock.now() - this.started));
    this.cancelTimer(); this.cancelTimer = null;
  }
  resume() {
    if (this.remaining === null || this.cancelTimer) return;
    this.started = this.clock.now();
    this.cancelTimer = this.clock.schedule(() => {
      this.cancelTimer = null; this.remaining = null; this.callback();
    }, this.remaining);
  }
  cancel() {
    this.cancelTimer?.(); this.cancelTimer = null; this.remaining = null;
  }
}
