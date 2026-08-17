/**
 * DNA Polyphonic Synthesizer Easter Egg.
 *
 * Real-time Web Audio polyphonic synthesizer mapping nucleic acid base chemistry,
 * molecular mass, and GC hydrogen bonding to harmonic overtones with an interactive
 * keyboard and live HTML5 Canvas audio waveform oscilloscope.
 */

interface BaseNoteConfig {
  key: string;
  name: string;
  freq: number;
  type: OscillatorType;
  color: string;
  formula: string;
}

const BASE_NOTES: Record<string, BaseNoteConfig> = {
  a: { key: 'A', name: 'Adenine (Purine)', freq: 220.0, type: 'triangle', color: '#2e6e5e', formula: 'C5H5N5 · 135.1 Da' },
  t: { key: 'T', name: 'Thymine (Pyrimidine)', freq: 329.63, type: 'sine', color: '#e11d48', formula: 'C5H6N2O2 · 126.1 Da' },
  g: { key: 'G', name: 'Guanine (Purine · 3 H-Bonds)', freq: 261.63, type: 'triangle', color: '#d97706', formula: 'C5H5N5O · 151.1 Da' },
  c: { key: 'C', name: 'Cytosine (Pyrimidine · 3 H-Bonds)', freq: 392.0, type: 'sine', color: '#2563eb', formula: 'C4H5N3O · 111.1 Da' },
  u: { key: 'U', name: 'Uracil (RNA)', freq: 349.23, type: 'sine', color: '#0891b2', formula: 'C4H4N2O2 · 112.1 Da' },
  p: { key: 'P', name: 'Phosphate Backbone', freq: 110.0, type: 'sawtooth', color: '#7c3aed', formula: 'PO4(3-) · 95.0 Da' },
  s: { key: 'S', name: 'Deoxyribose Sugar', freq: 523.25, type: 'sine', color: '#059669', formula: 'C5H10O4 · 134.1 Da' },
  n: { key: 'N', name: 'Random Codon Chord', freq: 440.0, type: 'triangle', color: '#64748b', formula: 'Any Base (IUPAC)' },
};

let isSynthActive = false;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let dockEl: HTMLElement | null = null;
let canvasEl: HTMLCanvasElement | null = null;
let animFrameId: number | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      audioCtx = new AudioCtx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playNucleotideNote(baseChar: string) {
  const char = baseChar.toLowerCase();
  const config = BASE_NOTES[char];
  if (!config) return;

  const ctx = getAudioContext();
  if (!ctx || !analyser) return;

  const now = ctx.currentTime;

  if (char === 'n') {
    // Play random 3-base codon chord
    const keys = ['a', 't', 'g', 'c', 'u'];
    for (let i = 0; i < 3; i++) {
      const k = keys[Math.floor(Math.random() * keys.length)];
      playNucleotideNote(k);
    }
    return;
  }

  // Dual-oscillator voice with harmonic envelope
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  osc1.type = config.type;
  osc1.frequency.setValueAtTime(config.freq, now);

  // Subharmonic or overtone for purines vs pyrimidines
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(config.freq * 1.5, now);

  // ADSR Envelope
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.02); // Attack
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.15); // Decay & Sustain
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6); // Release

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(analyser);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.65);
  osc2.stop(now + 0.65);

  // Visual active state on dock key
  const keyBtn = document.querySelector<HTMLElement>(`[data-synth-key="${char}"]`);
  if (keyBtn) {
    keyBtn.style.transform = 'translateY(2px) scale(0.96)';
    keyBtn.style.background = 'color-mix(in srgb, var(--color-accent, #2e6e5e) 25%, #ffffff)';
    setTimeout(() => {
      keyBtn.style.transform = '';
      keyBtn.style.background = '';
    }, 150);
  }
}

function drawOscilloscope() {
  if (!isSynthActive || !canvasEl || !analyser) return;

  const canvas = canvasEl;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteTimeDomainData(dataArray);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = 'var(--color-accent, #2e6e5e)';
  ctx.beginPath();

  const sliceWidth = canvas.width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * canvas.height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  animFrameId = requestAnimationFrame(drawOscilloscope);
}

function createSynthDock(): HTMLElement {
  const dock = document.createElement('div');
  dock.id = 'dna-synth-dock';
  dock.style.position = 'fixed';
  dock.style.bottom = '20px';
  dock.style.left = '50%';
  dock.style.transform = 'translateX(-50%)';
  dock.style.zIndex = '999999';
  dock.style.width = 'calc(100% - 32px)';
  dock.style.maxWidth = '640px';
  dock.style.padding = '16px';
  dock.style.background = 'color-mix(in srgb, var(--color-surface, #ffffff) 94%, #000 6%)';
  dock.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.15))';
  dock.style.borderRadius = '16px';
  dock.style.boxShadow = '0 16px 40px rgba(0,0,0,0.2)';
  dock.style.backdropFilter = 'blur(12px)';
  dock.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  dock.style.display = 'flex';
  dock.style.flexDirection = 'column';
  dock.style.gap = '12px';
  dock.style.color = 'var(--color-ink, #202020)';

  // Header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  titleWrap.style.gap = '8px';

  const icon = document.createElement('span');
  icon.style.fontSize = '18px';
  icon.textContent = '🎹';

  const title = document.createElement('span');
  title.style.fontWeight = 'bold';
  title.style.fontSize = '14px';
  title.textContent = 'DNA Polyphonic Synthesizer';

  const hint = document.createElement('span');
  hint.style.fontSize = '11px';
  hint.style.color = 'var(--color-muted, #707070)';
  hint.textContent = '(Press keyboard keys A, T, G, C, U, P, S, N)';

  titleWrap.appendChild(icon);
  titleWrap.appendChild(title);
  titleWrap.appendChild(hint);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'synth-close-btn';
  closeBtn.type = 'button';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '14px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = 'var(--color-muted, #707070)';
  closeBtn.textContent = '✕ ESC';
  closeBtn.addEventListener('click', stopDnaSynth);

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  dock.appendChild(header);

  // Oscilloscope Container
  const oscWrap = document.createElement('div');
  oscWrap.style.height = '48px';
  oscWrap.style.background = 'color-mix(in srgb, var(--color-bg, #fafaf8) 80%, #000 5%)';
  oscWrap.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.1))';
  oscWrap.style.borderRadius = '8px';
  oscWrap.style.overflow = 'hidden';
  oscWrap.style.position = 'relative';

  const canvas = document.createElement('canvas');
  canvas.id = 'synth-oscilloscope';
  canvas.width = 600;
  canvas.height = 48;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  oscWrap.appendChild(canvas);
  dock.appendChild(oscWrap);
  canvasEl = canvas;

  // Keyboard Grid
  const keysGrid = document.createElement('div');
  keysGrid.style.display = 'grid';
  keysGrid.style.gridTemplateColumns = 'repeat(8, 1fr)';
  keysGrid.style.gap = '6px';

  Object.entries(BASE_NOTES).forEach(([char, cfg]) => {
    const btn = document.createElement('button');
    btn.dataset.synthKey = char;
    btn.type = 'button';
    btn.style.display = 'flex';
    btn.style.flexDirection = 'column';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.padding = '10px 4px';
    btn.style.background = 'var(--color-surface, #fff)';
    btn.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.15))';
    btn.style.borderBottom = `3px solid ${cfg.color}`;
    btn.style.borderRadius = '8px';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = 'monospace';
    btn.style.fontWeight = 'bold';
    btn.style.transition = 'all 0.1s ease';

    const kText = document.createElement('span');
    kText.style.fontSize = '16px';
    kText.style.color = cfg.color;
    kText.textContent = cfg.key;

    const fText = document.createElement('span');
    fText.style.fontSize = '9px';
    fText.style.color = 'var(--color-muted, #707070)';
    fText.style.marginTop = '2px';
    fText.textContent = `${cfg.freq}Hz`;

    btn.appendChild(kText);
    btn.appendChild(fText);
    btn.addEventListener('click', () => playNucleotideNote(char));
    keysGrid.appendChild(btn);
  });
  dock.appendChild(keysGrid);

  // Preset Chords Row
  const chordsRow = document.createElement('div');
  chordsRow.style.display = 'flex';
  chordsRow.style.gap = '6px';
  chordsRow.style.justifyContent = 'center';

  const makeChordBtn = (text: string, onPlay: () => void) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.fontSize = '11px';
    btn.style.padding = '4px 10px';
    btn.style.borderRadius = '999px';
    btn.style.background = 'transparent';
    btn.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.2))';
    btn.style.cursor = 'pointer';
    btn.style.color = 'var(--color-ink, #202020)';
    btn.textContent = text;
    btn.addEventListener('click', onPlay);
    return btn;
  };

  chordsRow.appendChild(
    makeChordBtn('✨ Watson-Crick Duet', () => {
      playNucleotideNote('a');
      setTimeout(() => playNucleotideNote('t'), 80);
      setTimeout(() => playNucleotideNote('g'), 220);
      setTimeout(() => playNucleotideNote('c'), 300);
    })
  );

  chordsRow.appendChild(
    makeChordBtn('🧬 CpG Island', () => {
      playNucleotideNote('c');
      setTimeout(() => playNucleotideNote('g'), 100);
      setTimeout(() => playNucleotideNote('p'), 200);
    })
  );

  chordsRow.appendChild(
    makeChordBtn('🎺 TATA Box', () => {
      ['t', 'a', 't', 'a', 'a', 'a'].forEach((b, idx) => {
        setTimeout(() => playNucleotideNote(b), idx * 120);
      });
    })
  );

  dock.appendChild(chordsRow);
  document.body.appendChild(dock);

  return dock;
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (!isSynthActive) return;

  if (e.key === 'Escape') {
    stopDnaSynth();
    return;
  }

  const char = e.key.toLowerCase();
  if (BASE_NOTES[char]) {
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      playNucleotideNote(char);
    }
  }
}

export function startDnaSynth() {
  if (isSynthActive) return;
  isSynthActive = true;

  dockEl = createSynthDock();
  getAudioContext();

  window.addEventListener('keydown', onGlobalKeyDown);

  animFrameId = requestAnimationFrame(drawOscilloscope);
}

export function stopDnaSynth() {
  if (!isSynthActive) return;
  isSynthActive = false;

  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (dockEl) {
    dockEl.remove();
    dockEl = null;
  }

  window.removeEventListener('keydown', onGlobalKeyDown);
}
