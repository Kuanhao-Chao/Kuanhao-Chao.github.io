/**
 * Web Audio Procedural Feedback Engine
 *
 * Provides subtle, futuristic sonic feedback during pathfinding exploration
 * and victory fanfare upon reaching the goal using the browser Web Audio API.
 * Zero external audio assets required.
 */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private isEnabled: boolean = false;
  private lastSoundTime: number = 0;
  private timers = new Set<number>();

  constructor() {
    if (typeof window !== 'undefined') {
      try { this.isEnabled = localStorage.getItem('bayroute_sound_enabled') === 'true'; } catch {}
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public isSoundEnabled(): boolean {
    return this.isEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    if (typeof window !== 'undefined') {
      try { localStorage.setItem('bayroute_sound_enabled', String(enabled)); } catch {}
    }
    if (enabled) {
      this.initContext();
      this.playBlip(440, 0.05);
    }
  }

  public toggleSound(): boolean {
    this.setSoundEnabled(!this.isEnabled);
    return this.isEnabled;
  }

  /**
   * Plays a short exploration blip. Pitch scales up from 220Hz to 880Hz
   * as the search gets closer to the destination.
   */
  public playStepSound(progressFraction: number): void {
    if (!this.isEnabled) return;
    const now = performance.now();
    // Throttle sounds to avoid audio stuttering during rapid playback
    if (now - this.lastSoundTime < 40) return;
    this.lastSoundTime = now;

    const ctx = this.initContext();
    if (!ctx) return;

    // Pitch rises dynamically: 220Hz (A3) up to 880Hz (A5)
    const baseFreq = 220;
    const maxFreq = 880;
    const freq = baseFreq + Math.pow(Math.min(1, Math.max(0, progressFraction)), 1.5) * (maxFreq - baseFreq);

    this.playBlip(freq, 0.035, 0.08);
  }

  /**
   * Plays a harmonious arrival chord when the optimal route is discovered.
   */
  public playArrivalFanfare(): void {
    if (!this.isEnabled) return;
    const ctx = this.initContext();
    if (!ctx) return;

    // C-Major arpeggio: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.5Hz)
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const id = window.setTimeout(() => {
        this.timers.delete(id);
        this.playBlip(freq, 0.25, 0.12);
      }, idx * 75);
      this.timers.add(id);
    });
  }

  public destroy(): void {
    this.timers.forEach((id) => window.clearTimeout(id)); this.timers.clear();
    void this.ctx?.close().catch(() => {}); this.ctx = null; this.lastSoundTime = 0;
  }

  private playBlip(frequency: number, duration: number, volume = 0.08): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);

      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (_e) {
      // Ignore audio policy restrictions if user hasn't interacted with DOM yet
    }
  }
}

export const audioEngine = new AudioEngine();
