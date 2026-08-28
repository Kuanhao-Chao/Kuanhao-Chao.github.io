import type { GenomicNoteEvent, SynthPreset } from './sonicGenome';

export class SonicAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private delayNode: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayGain: GainNode | null = null;
  private convolverNode: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;

  private isInitialized = false;
  private isMuted = false;
  private masterVolume = 0.75;
  private reverbLevel = 0.4;
  private timeDataBuffer: Uint8Array<ArrayBuffer> | null = null;
  private freqDataBuffer: Uint8Array<ArrayBuffer> | null = null;

  public async init(): Promise<void> {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) {
      console.warn('Web Audio API is not supported in this browser environment.');
      return;
    }

    this.ctx = new AudioContextClass();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    // 1. Analyser Node for Visualizers
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 1024;
    this.analyserNode.smoothingTimeConstant = 0.85;
    this.timeDataBuffer = new Uint8Array(this.analyserNode.fftSize);
    this.freqDataBuffer = new Uint8Array(this.analyserNode.frequencyBinCount);

    // 2. Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(this.masterVolume, this.ctx.currentTime);

    // 3. Dynamic Filter (modulated by GC-content)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.setValueAtTime(2200, this.ctx.currentTime);
    this.filterNode.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // 4. Stereo Ping-Pong / Tape Delay
    this.delayNode = this.ctx.createDelay();
    this.delayNode.delayTime.setValueAtTime(0.3, this.ctx.currentTime);
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.delayGain = this.ctx.createGain();
    this.delayGain.gain.setValueAtTime(0.25, this.ctx.currentTime);

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);

    // 5. Algorithmic Reverb Impulse Response
    this.convolverNode = this.ctx.createConvolver();
    this.convolverNode.buffer = this.generateReverbImpulse(2.5, 2.0);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(this.reverbLevel, this.ctx.currentTime);

    this.convolverNode.connect(this.reverbGain);

    // Routing Graph:
    // Filter -> MasterGain -> Analyser -> Destination
    // Filter -> Delay -> MasterGain
    // Filter -> Convolver -> MasterGain
    this.filterNode.connect(this.masterGain);
    this.filterNode.connect(this.delayNode);
    this.filterNode.connect(this.convolverNode);

    this.delayGain.connect(this.masterGain);
    this.reverbGain.connect(this.masterGain);

    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    this.isInitialized = true;
  }

  /**
   * Mathematically synthesizes a lush stereo acoustic space impulse response.
   */
  private generateReverbImpulse(duration: number, decay: number): AudioBuffer | null {
    if (!this.ctx) return null;
    const sampleRate = this.ctx.sampleRate;
    const length = sampleRate * duration;
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const t = i / length;
      const factor = Math.exp(-t * decay);
      left[i] = (Math.random() * 2 - 1) * factor;
      right[i] = (Math.random() * 2 - 1) * factor;
    }
    return impulse;
  }

  /**
   * Plays a single genomic note event with the selected synthesizer timbre preset.
   */
  public playNote(event: GenomicNoteEvent, preset: SynthPreset): void {
    if (!this.ctx || !this.isInitialized || !this.filterNode || this.isMuted) return;

    const now = this.ctx.currentTime;
    const freq = event.frequency;
    const duration = event.duration;
    const velocity = event.velocity;

    // Modulate filter cutoff based on GC content
    this.updateFilterCutoff(event.gcRatio);

    switch (preset) {
      case 'ambient-pad':
        this.playAmbientPad(freq, duration, velocity, now);
        break;
      case 'crystal-chimes':
        this.playCrystalFM(freq, duration, velocity, now);
        break;
      case 'cyber-saw':
        this.playCyberSaw(freq, duration, velocity, now);
        break;
      case 'chiptune':
        this.playChiptune(freq, duration, velocity, now);
        break;
      case 'ethereal-glass':
      default:
        this.playEtherealGlass(freq, duration, velocity, now);
        break;
    }

    // Trigger percussion if motif encountered
    if (event.motif) {
      this.triggerPercussion(event.motif.percussionTrigger, 0.7);
    }
  }

  private playAmbientPad(freq: number, duration: number, velocity: number, time: number): void {
    if (!this.ctx || !this.filterNode) return;

    // Dual detuned oscillators for lush chorus
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 1.004, time); // 7 cents detune

    // ADSR Envelope
    const attack = 0.08;
    const decay = 0.15;
    const sustain = 0.4 * velocity;
    const release = duration * 0.8;

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.25 * velocity, time + attack);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, sustain), time + attack + decay);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + release);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.filterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration + release + 0.1);
    osc2.stop(time + duration + release + 0.1);
  }

  private playCrystalFM(freq: number, duration: number, velocity: number, time: number): void {
    if (!this.ctx || !this.filterNode) return;

    // 2-Operator Frequency Modulation (Bell/Chime)
    const carrier = this.ctx.createOscillator();
    const modulator = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const carrierGain = this.ctx.createGain();

    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(freq, time);

    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(freq * 2.756, time); // Inharmonic chime ratio

    const modIndex = freq * 1.5 * velocity;
    modGain.gain.setValueAtTime(modIndex, time);
    modGain.gain.exponentialRampToValueAtTime(0.1, time + duration);

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    carrierGain.gain.setValueAtTime(0.3 * velocity, time);
    carrierGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 1.2);

    carrier.connect(carrierGain);
    carrierGain.connect(this.filterNode);

    carrier.start(time);
    modulator.start(time);
    carrier.stop(time + duration * 1.3);
    modulator.stop(time + duration * 1.3);
  }

  private playCyberSaw(freq: number, duration: number, velocity: number, time: number): void {
    if (!this.ctx || !this.filterNode) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.2 * velocity, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration + 0.05);
  }

  private playChiptune(freq: number, duration: number, velocity: number, time: number): void {
    if (!this.ctx || !this.filterNode) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.15 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.7);

    osc.connect(gain);
    gain.connect(this.filterNode);

    osc.start(time);
    osc.stop(time + duration * 0.75);
  }

  private playEtherealGlass(freq: number, duration: number, velocity: number, time: number): void {
    if (!this.ctx || !this.filterNode) return;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, time);
    osc2.frequency.setValueAtTime(freq * 2, time); // 1 octave above

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.22 * velocity, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 1.5);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.filterNode);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + duration * 1.6);
    osc2.stop(time + duration * 1.6);
  }

  /**
   * Synthesizes percussion hits without external audio sample files.
   */
  public triggerPercussion(
    type: 'kick' | 'snare' | 'hihat' | 'shimmer' | 'woodblock',
    velocity: number = 0.8
  ): void {
    if (!this.ctx || !this.isInitialized || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;

    switch (type) {
      case 'kick': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.12);
        gain.gain.setValueAtTime(0.7 * velocity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }
      case 'snare': {
        // Noise + body
        const bufferSize = this.ctx.sampleRate * 0.15;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'highpass';
        noiseFilter.frequency.setValueAtTime(800, now);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.35 * velocity, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.masterGain);
        noise.start(now);
        break;
      }
      case 'hihat': {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(7500, now);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2 * velocity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        noise.start(now);
        break;
      }
      case 'woodblock': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.04);
        gain.gain.setValueAtTime(0.4 * velocity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.06);
        break;
      }
      case 'shimmer': {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.linearRampToValueAtTime(2800, now + 0.35);
        gain.gain.setValueAtTime(0.25 * velocity, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }
    }
  }

  /**
   * Modulates the low-pass filter cutoff based on rolling GC ratio (0.0 to 1.0).
   */
  public updateFilterCutoff(gcRatio: number): void {
    if (!this.filterNode || !this.ctx) return;
    const minFreq = 400;
    const maxFreq = 6000;
    const targetFreq = minFreq + Math.pow(Math.max(0, Math.min(1, gcRatio)), 1.5) * (maxFreq - minFreq);
    this.filterNode.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.08);
  }

  public setMasterVolume(val: number): void {
    this.masterVolume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
    }
  }

  public setReverbLevel(level: number): void {
    this.reverbLevel = Math.max(0, Math.min(1, level));
    if (this.reverbGain && this.ctx) {
      this.reverbGain.gain.setTargetAtTime(this.reverbLevel, this.ctx.currentTime, 0.05);
    }
  }

  public getAnalyserData(): { timeData: Uint8Array; freqData: Uint8Array } {
    if (this.analyserNode && this.timeDataBuffer && this.freqDataBuffer) {
      this.analyserNode.getByteTimeDomainData(this.timeDataBuffer);
      this.analyserNode.getByteFrequencyData(this.freqDataBuffer);
      return { timeData: this.timeDataBuffer, freqData: this.freqDataBuffer };
    }
    return { timeData: new Uint8Array(0), freqData: new Uint8Array(0) };
  }

  public stopAll(): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public destroy(): void {
    this.stopAll();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {}
    }
    this.ctx = null;
    this.isInitialized = false;
  }
}
