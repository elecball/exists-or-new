let context: AudioContext | null = null;
let enabled = true;
export function soundEnabled() { return enabled; }
export function unlockSound() {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Audio availability never blocks play. */ }
}
export function toggleSound() {
  enabled = !enabled;
  if (enabled) unlockSound();
}
export function playFeedback(correct: boolean, timeout: boolean) {
  if (!enabled) return;
  unlockSound();
  if (!context || context.state !== 'running') return;
  try {
    const now = context.currentTime;
    const notes = correct ? [660, 880] : timeout ? [220, 165] : [196, 147];
    notes.forEach((frequency, index) => {
      const oscillator = context!.createOscillator(), gain = context!.createGain();
      const start = now + index * 0.075;
      oscillator.type = correct ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.15, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      oscillator.connect(gain); gain.connect(context!.destination);
      oscillator.start(start); oscillator.stop(start + 0.13);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    });
  } catch { /* Continue silently if the audio device is unavailable. */ }
}
