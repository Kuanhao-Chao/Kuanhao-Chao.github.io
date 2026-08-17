/**
 * Universal Easter Eggs Hub.
 *
 * Coordinates keyword listening, Konami code sequence, custom events,
 * and lifecycle management for all website interactive secrets:
 * - ✂️ CRISPR-Cas9 Molecular Scissors
 * - 🌌 Zero-Gravity DOM Physics
 * - 📺 1988 NIH Supercomputer CRT Mode
 * - 🧬 Ribosome mRNA Translation Rush
 * - 🎹 DNA Polyphonic Synthesizer
 * - 🌧️ Matrix DNA Rain
 */
import { startCrisprMode, stopCrisprMode } from './crisprMode';
import { startZeroGravity, stopZeroGravity } from './domPhysics';
import { startCrtMode, stopCrtMode } from './retroCrt';
import { openRibosomeGame, closeRibosomeGame } from './ribosomeGameVisualizer';
import { startDnaSynth, stopDnaSynth } from './dnaSynth';
import { startDnaRain } from './dnaRain';

const KONAMI_CODE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

const KEYWORD_MAP: Record<string, () => void> = {
  crispr: startCrisprMode,
  cas9: startCrisprMode,
  cut: startCrisprMode,
  gravity: startZeroGravity,
  zerog: startZeroGravity,
  physics: startZeroGravity,
  antigravity: startZeroGravity,
  crt: () => startCrtMode('amber'),
  retro: () => startCrtMode('green'),
  '1988': () => startCrtMode('amber'),
  fallout: () => startCrtMode('green'),
  ribosome: openRibosomeGame,
  splice: openRibosomeGame,
  rush: openRibosomeGame,
  synth: startDnaSynth,
  piano: startDnaSynth,
  music: startDnaSynth,
  chords: startDnaSynth,
  dna: startDnaRain,
  matrix: startDnaRain,
  rain: startDnaRain,
  helix: startDnaRain,
};

let charBuffer: string[] = [];
let konamiSequence: string[] = [];

function onGlobalKeyDown(e: KeyboardEvent) {
  // Ignore input if user is typing in form inputs
  const tag = (e.target as HTMLElement | null)?.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable;
  if (isInput) return;

  // 1. Keyword sequence detection
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    charBuffer.push(e.key.toLowerCase());
    if (charBuffer.length > 25) charBuffer.shift();

    const typed = charBuffer.join('');
    for (const [kw, action] of Object.entries(KEYWORD_MAP)) {
      if (typed.endsWith(kw)) {
        charBuffer = [];
        konamiSequence = [];
        action();
        return;
      }
    }
  }

  // 2. Konami code detection
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const expectedKey = KONAMI_CODE[konamiSequence.length];

  if (key === expectedKey || (expectedKey && expectedKey.length === 1 && key === expectedKey.toLowerCase())) {
    konamiSequence.push(expectedKey);
    if (konamiSequence.length === KONAMI_CODE.length) {
      konamiSequence = [];
      charBuffer = [];
      startDnaRain();
    }
  } else {
    konamiSequence = key === KONAMI_CODE[0] ? [KONAMI_CODE[0]] : [];
  }
}

export function initEasterEggs(): () => void {
  const onCrispr = () => startCrisprMode();
  const onZeroG = () => startZeroGravity();
  const onCrt = (e: CustomEvent<{ mode?: 'off' | 'amber' | 'green' }>) => {
    if (e.detail?.mode === 'off') {
      stopCrtMode();
    } else {
      startCrtMode(e.detail?.mode || 'amber');
    }
  };
  const onRibosome = () => openRibosomeGame();
  const onSynth = () => startDnaSynth();
  const onDnaRain = () => startDnaRain();
  const onSetBg = (e: CustomEvent<{ mode?: string }>) => {
    const mode = e.detail?.mode;
    const bgApi = (window as unknown as { __khcBg?: { set: (m: string) => void; next: () => void } }).__khcBg;
    if (bgApi) {
      if (mode === 'next') bgApi.next();
      else if (mode) bgApi.set(mode as any);
    }
  };

  window.addEventListener('keydown', onGlobalKeyDown);
  window.addEventListener('khc:start-crispr', onCrispr as EventListener);
  window.addEventListener('khc:start-zerog', onZeroG as EventListener);
  window.addEventListener('khc:start-crt', onCrt as EventListener);
  window.addEventListener('khc:start-ribosome', onRibosome as EventListener);
  window.addEventListener('khc:start-synth', onSynth as EventListener);
  window.addEventListener('khc:start-dna-rain', onDnaRain as EventListener);
  window.addEventListener('khc:set-bg', onSetBg as EventListener);

  return () => {
    window.removeEventListener('keydown', onGlobalKeyDown);
    window.removeEventListener('khc:start-crispr', onCrispr as EventListener);
    window.removeEventListener('khc:start-zerog', onZeroG as EventListener);
    window.removeEventListener('khc:start-crt', onCrt as EventListener);
    window.removeEventListener('khc:start-ribosome', onRibosome as EventListener);
    window.removeEventListener('khc:start-synth', onSynth as EventListener);
    window.removeEventListener('khc:start-dna-rain', onDnaRain as EventListener);
    window.removeEventListener('khc:set-bg', onSetBg as EventListener);

    stopCrisprMode();
    stopZeroGravity();
    stopCrtMode();
    closeRibosomeGame();
    stopDnaSynth();
  };
}
